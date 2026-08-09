/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt, toTimestamp } = require("../server/server");

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

  afterEach(() => {
    jest.useRealTimers();
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

  function installAuditLogStore(initialLogs) {
    const logs = initialLogs.map((log) => clone(log));

    __testModels.AuditLog.updateMany.mockImplementation(async (query = {}, update = {}) => {
      const selectedIds = query.id?.$in || [];
      let modifiedCount = 0;
      logs.forEach((log) => {
        const matchesId = selectedIds.includes(log.id);
        const matchesArchivedState = query.archived === true
          ? log.archived === true
          : query.archived?.$ne === true
            ? log.archived !== true
            : true;
        if (!matchesId || !matchesArchivedState) return;

        Object.assign(log, clone(update.$set || {}));
        modifiedCount += 1;
      });
      return { modifiedCount };
    });

    __testModels.AuditLog.create.mockImplementation(async (payload) => {
      const saved = clone({ id: payload.id || `AUD-CREATED-${logs.length + 1}`, ...payload });
      logs.push(saved);
      return saved;
    });

    __testModels.AuditLog.find.mockImplementation((query = {}) => {
      const rows = logs.filter((log) => {
        if (query.archived === true) return log.archived === true;
        if (query.archived?.$ne === true) return log.archived !== true;
        return true;
      });
      return {
        sort: () => ({
          lean: async () => clone(rows),
        }),
      };
    });

    return logs;
  }

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
      meta: expect.objectContaining({
        archivedAuditLogIds: ["AUD-1", "AUD-7"],
        archivedCount: 2,
      }),
    }));
    expect(__testModels.AuditLog.create.mock.calls[0][0]).not.toHaveProperty("archived", true);
    expect(__testModels.AuditLog.create.mock.calls[0][0]).not.toHaveProperty("archivedAt");
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

  test("returns all archived audit log IDs for explicit archived Select All", async () => {
    const response = await request("/api/admin/audit-logs/archived-ids", {
      token: auth(admin),
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ids: ["AUD-1", "AUD-7"] });
    expect(__testModels.AuditLog.find).toHaveBeenCalledWith({ archived: true }, { id: 1, _id: 0 });
  });

  test("selected archive keeps the newly-created archive action audit record active", async () => {
    const logs = installAuditLogStore([
      { id: "AUD-A", action: "A", archived: false },
      { id: "AUD-B", action: "B", archived: false },
      { id: "AUD-C", action: "C", archived: false },
    ]);

    const response = await request("/api/admin/audit-logs/archive", {
      token: auth(admin),
      body: { auditUser: admin.email, ids: ["AUD-A"] },
    });

    expect(response.status).toBe(204);
    expect(logs.find((log) => log.id === "AUD-A")).toEqual(expect.objectContaining({ archived: true }));
    expect(logs.find((log) => log.id === "AUD-B").archived).not.toBe(true);
    expect(logs.find((log) => log.id === "AUD-C").archived).not.toBe(true);
    expect(logs.filter((log) => log.archived === true).map((log) => log.id)).toEqual(["AUD-A"]);

    const actionLog = logs.find((log) => log.action === "Archived audit logs");
    expect(actionLog).toBeTruthy();
    expect(actionLog.archived).not.toBe(true);
  });

  test("global Select All archives only the captured pre-operation IDs and leaves the action record active", async () => {
    const logs = installAuditLogStore([
      { id: "AUD-A", action: "A", archived: false },
      { id: "AUD-B", action: "B", archived: false },
      { id: "AUD-C", action: "C", archived: false },
    ]);

    const selectionResponse = await request("/api/admin/audit-logs/active-ids", {
      token: auth(admin),
      method: "GET",
    });

    expect(selectionResponse.body).toEqual({ ids: ["AUD-A", "AUD-B", "AUD-C"] });

    const archiveResponse = await request("/api/admin/audit-logs/archive", {
      token: auth(admin),
      body: { auditUser: admin.email, ids: selectionResponse.body.ids },
    });

    expect(archiveResponse.status).toBe(204);
    expect(logs.filter((log) => log.archived === true).map((log) => log.id)).toEqual(["AUD-A", "AUD-B", "AUD-C"]);

    const actionLog = logs.find((log) => log.action === "Archived audit logs");
    expect(actionLog).toBeTruthy();
    expect(actionLog.archived).not.toBe(true);
  });

  test("restore only selected archived IDs and records an active restore action", async () => {
    const logs = installAuditLogStore([
      { id: "AUD-A", action: "A", archived: true, archivedAt: "2026-08-09T01:00:00.000Z", archivedBy: "admin@example.com" },
      { id: "AUD-B", action: "B", archived: true, archivedAt: "2026-08-09T01:00:00.000Z", archivedBy: "admin@example.com" },
      { id: "AUD-C", action: "C", archived: false },
    ]);

    const response = await request("/api/admin/audit-logs/unarchive", {
      token: auth(admin),
      body: { auditUser: admin.email, ids: ["AUD-A"] },
    });

    expect(response.status).toBe(204);
    expect(logs.find((log) => log.id === "AUD-A")).toEqual(expect.objectContaining({ archived: false, archivedAt: "", archivedBy: "" }));
    expect(logs.find((log) => log.id === "AUD-B")).toEqual(expect.objectContaining({ archived: true }));

    const actionLog = logs.find((log) => log.action === "Unarchived audit logs");
    expect(actionLog).toBeTruthy();
    expect(actionLog.archived).not.toBe(true);
    expect(actionLog.meta).toEqual(expect.objectContaining({
      restoredAuditLogIds: ["AUD-A"],
      restoredCount: 1,
    }));
  });

  test.each([
    ["missing ids", {}],
    ["empty ids", { ids: [] }],
    ["non-audit id", { ids: ["PAY-1"] }],
  ])("restore rejects %s without restoring anything", async (_label, body) => {
    const response = await request("/api/admin/audit-logs/unarchive", {
      token: auth(admin),
      body: { auditUser: admin.email, ...body },
    });

    expect(response.status).toBe(400);
    expect(__testModels.AuditLog.updateMany).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("generates authoritative UTC ISO audit timestamps", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-09T19:45:00.000Z"));

    expect(toTimestamp()).toBe("2026-08-09T19:45:00.000Z");

    jest.useRealTimers();
  });
});
