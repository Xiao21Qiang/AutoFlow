/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

function doc(value) {
  return {
    lean: async () => (value ? { ...value } : null),
  };
}

function auth(user) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { token, method = "PUT", body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = token ? { authorization: token } : {};
    req.body = body || {};
    req.push(null);

    const res = new http.ServerResponse(req);
    const chunks = [];
    res.write = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof callback === "function") callback();
      return true;
    };
    res.end = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof callback === "function") callback();
      const text = Buffer.concat(chunks).toString("utf8");
      resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
      return res;
    };
    app.handle(req, res, reject);
  });
}

describe("Dashboard quote request route RBAC", () => {
  const originals = [];
  const salesAssociate = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
  const marketing = { id: "MKT-1", email: "marketing@example.com", name: "Marketing", userType: "Staff", role: "Marketing", status: "active" };
  const seniorDetailer = { id: "SR-1", email: "senior@example.com", name: "Senior Detailer", userType: "Staff", role: "Senior Detailer", status: "active" };
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const users = [salesAssociate, marketing, seniorDetailer, admin];

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = users.find((item) => item.id === query.id || item.email === query.email);
      return doc(user);
    });
    stub(__testModels.QuoteRequest, "findOneAndUpdate", jest.fn());
    stub(__testModels.AuditLog, "create", jest.fn(async (payload) => payload));
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    __testModels.QuoteRequest.findOneAndUpdate.mockReset();
    __testModels.QuoteRequest.findOneAndUpdate.mockImplementation(async (query, update) => ({
      id: query.id,
      fullName: "Quote Customer",
      status: update.status,
    }));
    __testModels.AuditLog.create.mockClear();
  });

  test("Sales Associate can update Dashboard quote status and is audited as the authenticated actor", async () => {
    const response = await request("/api/admin/quote-requests/Q-1", {
      token: auth(salesAssociate),
      body: {
        status: "Received",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "Q-1", status: "Received" });
    expect(__testModels.QuoteRequest.findOneAndUpdate).toHaveBeenCalledWith(
      { id: "Q-1" },
      { status: "Received" },
      { new: true }
    );
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "sales@example.com",
      action: "Updated quote request status",
      targetId: "Q-1",
      meta: { status: "Received" },
    }));
  });

  test("Marketing can update Dashboard quote status through Engagement management and is audited as the authenticated actor", async () => {
    const response = await request("/api/admin/quote-requests/Q-1", {
      token: auth(marketing),
      body: {
        status: "Received",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "Q-1", status: "Received" });
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: "marketing@example.com",
      action: "Updated quote request status",
      targetId: "Q-1",
    }));
  });

  test("Staff without Dashboard or Engagement-management authority cannot update Dashboard quote status", async () => {
    const response = await request("/api/admin/quote-requests/Q-1", {
      token: auth(seniorDetailer),
      body: {
        status: "Received",
        auditUser: "admin@example.com",
      },
    });

    expect(response.status).toBe(403);
    expect(__testModels.QuoteRequest.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });
});
