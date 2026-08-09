/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  return {
    ...value,
    lean: async () => clone(value),
    toObject: () => clone(value),
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

describe("Audit log archive routes", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = admin.id === query.id || admin.email === query.email ? admin : null;
      return user ? doc(user) : emptyDoc();
    });
    stub(__testModels.AuditLog, "updateMany", jest.fn());
    stub(__testModels.AuditLog, "create", jest.fn());
    stub(__testModels.AuditLog, "find", jest.fn());
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    __testModels.AuditLog.updateMany.mockReset();
    __testModels.AuditLog.updateMany.mockResolvedValue({ modifiedCount: 2 });
    __testModels.AuditLog.create.mockReset();
    __testModels.AuditLog.create.mockResolvedValue({});
    __testModels.AuditLog.find.mockReset();
    __testModels.AuditLog.find.mockReturnValue({
      sort: () => ({
        lean: async () => [{ id: "AUD-1" }, { id: "AUD-7" }],
      }),
    });
  });

  test("archives only selected active audit log IDs and records the action after mutation", async () => {
    const response = await request("/api/admin/audit-logs/archive", {
      token: auth(admin),
      body: { auditUser: admin.email, ids: ["AUD-1", "AUD-7", "AUD-1"] },
    });

    expect(response.status).toBe(204);
    expect(__testModels.AuditLog.updateMany).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.updateMany).toHaveBeenCalledWith(
      { id: { $in: ["AUD-1", "AUD-7"] }, archived: { $ne: true } },
      expect.objectContaining({
        $set: expect.objectContaining({
          archived: true,
          archivedBy: admin.email,
        }),
      })
    );
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Archived audit logs",
      archived: true,
      meta: expect.objectContaining({
        archivedAuditLogIds: ["AUD-1", "AUD-7"],
        archivedCount: 2,
      }),
    }));
  });

  test.each([
    ["missing ids", {}],
    ["empty ids", { ids: [] }],
    ["null ids", { ids: null }],
    ["blank id", { ids: [""] }],
    ["non-string id", { ids: ["AUD-1", 7] }],
    ["non-audit id", { ids: ["PAY-1"] }],
  ])("rejects %s without archiving anything", async (_label, body) => {
    const response = await request("/api/admin/audit-logs/archive", {
      token: auth(admin),
      body: { auditUser: admin.email, ...body },
    });

    expect(response.status).toBe(400);
    expect(__testModels.AuditLog.updateMany).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("returns all active audit log IDs for explicit Select All", async () => {
    const response = await request("/api/admin/audit-logs/active-ids", {
      token: auth(admin),
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ids: ["AUD-1", "AUD-7"] });
    expect(__testModels.AuditLog.find).toHaveBeenCalledWith({ archived: { $ne: true } }, { id: 1, _id: 0 });
  });
});
