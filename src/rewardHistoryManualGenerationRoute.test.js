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
    ...value,
    lean: async () => ({ ...value }),
  };
}

function emptyDoc() {
  return {
    lean: async () => null,
  };
}

function auth(user) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { token, method = "POST", body = {} } = {}) {
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

describe("manual reward generation endpoint", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = [admin, staff].find((item) => item.id === query.id || item.email === query.email);
      return user ? doc(user) : emptyDoc();
    });
    stub(__testModels.Booking, "findOne", jest.fn());
    stub(__testModels.Reward, "find", jest.fn());
    stub(__testModels.Reward, "findOneAndUpdate", jest.fn());
    stub(__testModels.CustomerReward, "create", jest.fn());
    stub(__testModels.AuditLog, "create", jest.fn());
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    [
      __testModels.Booking.findOne,
      __testModels.Reward.find,
      __testModels.Reward.findOneAndUpdate,
      __testModels.CustomerReward.create,
      __testModels.AuditLog.create,
    ].forEach((mock) => mock.mockClear());
  });

  test("rejects Admin manual reward awarding before any reward, stock, history, milestone, or audit mutation", async () => {
    const response = await request("/api/admin/rewards/generate", {
      token: auth(admin),
      body: { customerId: "CUS-1", customerEmail: "casey@example.com", customerName: "Casey" },
    });

    expect(response.status).toBe(410);
    expect(response.body.message).toMatch(/Manual reward generation is disabled/i);
    expect(__testModels.Booking.findOne).not.toHaveBeenCalled();
    expect(__testModels.Reward.find).not.toHaveBeenCalled();
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.CustomerReward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("keeps Staff blocked from the disabled manual reward route", async () => {
    const response = await request("/api/admin/rewards/generate", {
      token: auth(staff),
      body: { customerId: "CUS-1" },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/Admin access required/i);
    expect(__testModels.CustomerReward.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Unauthorized admin route attempt",
    }));
  });
});
