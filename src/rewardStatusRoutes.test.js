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

async function request(path, { token, method = "PATCH", body = {} } = {}) {
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

describe("Reward status lifecycle route", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };
  const salesAssociate = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
  let rewards;
  let auditLogs;

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  function existingReward(overrides = {}) {
    return {
      _id: "64f0c2f1a5b8a77a12345678",
      id: "RWD-1",
      name: "Loyalty Spark",
      code: "LOYALTY-SPARK",
      type: "Free Microfiber Towel",
      rewardType: "Free Microfiber Towel",
      description: "Reward for loyal customers.",
      value: "Free Towel",
      discountType: "",
      discountValue: 0,
      rarity: "Common",
      weight: 10,
      enabled: true,
      active: true,
      archived: false,
      stock: 8,
      quantity: 8,
      expirationDays: 30,
      ...overrides,
    };
  }

  function matchesQuery(reward, query = {}) {
    if (Array.isArray(query.$or)) {
      return query.$or.some((candidate) => matchesQuery(reward, candidate));
    }
    if (query.id && reward.id !== query.id) return false;
    if (query._id && reward._id !== query._id) return false;
    if (query.code && reward.code !== query.code) return false;
    return Boolean(query.id || query._id || query.code);
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = [admin, staff, salesAssociate].find((item) => item.id === query.id || item.email === query.email);
      return user ? doc(user) : emptyDoc();
    });
    stub(__testModels.Reward, "findOne", (query = {}) => {
      const found = rewards.find((reward) => matchesQuery(reward, query));
      return found ? doc(found) : null;
    });
    stub(__testModels.Reward, "findOneAndUpdate", jest.fn());
    stub(__testModels.Reward, "create", jest.fn());
    stub(__testModels.AuditLog, "create", jest.fn());
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    rewards = [existingReward()];
    auditLogs = [];
    __testModels.Reward.findOneAndUpdate.mockClear();
    __testModels.Reward.create.mockClear();
    __testModels.AuditLog.create.mockClear();
    __testModels.Reward.findOneAndUpdate.mockImplementation(async (query, payload) => {
      const index = rewards.findIndex((reward) => matchesQuery(reward, query));
      if (index < 0) return null;
      rewards[index] = { ...rewards[index], ...clone(payload) };
      return doc(rewards[index]);
    });
    __testModels.AuditLog.create.mockImplementation(async (payload) => {
      auditLogs.push(clone(payload));
      return clone(payload);
    });
  });

  function patchStatus(id, body, user = admin) {
    return request(`/api/admin/rewards/${id}/status`, {
      token: auth(user),
      body,
    });
  }

  test("valid disable updates exactly one reward and writes one success audit", async () => {
    const before = clone(rewards[0]);

    const response = await patchStatus("RWD-1", { enabled: false, auditUser: admin.email });

    expect(response.status).toBe(200);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toEqual({
      ...before,
      enabled: false,
      active: false,
    });
    expect(response.body).toEqual(expect.objectContaining({
      id: "RWD-1",
      type: "Free Microfiber Towel",
      value: "Free Towel",
      stock: 8,
      weight: 10,
      expirationDays: 30,
      rarity: "Common",
      enabled: false,
      active: false,
    }));
    expect(__testModels.Reward.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Reward disabled",
      targetId: "RWD-1",
    }));
  });

  test("valid enable updates exactly one reward and writes one success audit", async () => {
    rewards = [existingReward({ enabled: false, active: false })];

    const response = await patchStatus("RWD-1", { enabled: true, auditUser: admin.email });

    expect(response.status).toBe(200);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toEqual(expect.objectContaining({
      id: "RWD-1",
      enabled: true,
      active: true,
      type: "Free Microfiber Towel",
      value: "Free Towel",
      stock: 8,
      weight: 10,
      expirationDays: 30,
      rarity: "Common",
    }));
    expect(__testModels.Reward.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Reward enabled",
      targetId: "RWD-1",
    }));
  });

  test.each([
    ["missing enabled", {}, /enabled status/],
    ["string enabled", { enabled: "false" }, /enabled status/],
    ["numeric enabled", { enabled: 0 }, /enabled status/],
    ["null enabled", { enabled: null }, /enabled status/],
  ])("rejects %s without mutation or success audit", async (_label, body, messagePattern) => {
    const before = clone(rewards);

    const response = await patchStatus("RWD-1", body);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(messagePattern);
    expect(rewards).toEqual(before);
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("missing reward returns 404 without mutation or success audit", async () => {
    const response = await patchStatus("RWD-MISSING", { enabled: false });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Reward not found.");
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("can update a backend-shaped _id while preserving the existing id", async () => {
    const response = await patchStatus("64f0c2f1a5b8a77a12345678", { enabled: false });

    expect(response.status).toBe(200);
    expect(rewards[0]).toEqual(expect.objectContaining({
      _id: "64f0c2f1a5b8a77a12345678",
      id: "RWD-1",
      enabled: false,
      active: false,
      type: "Free Microfiber Towel",
      value: "Free Towel",
    }));
    expect(__testModels.Reward.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test("Marketing can change reward status and forged audit fields do not change the authenticated actor", async () => {
    const response = await patchStatus("RWD-1", { enabled: false, auditUser: admin.email, role: "Admin", userType: "admin" }, staff);

    expect(response.status).toBe(200);
    expect(rewards[0]).toEqual(expect.objectContaining({ enabled: false, active: false }));
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: staff.email,
      action: "Reward disabled",
    }));
  });

  test("Sales Associate cannot change reward status through the Marketing Engagement route", async () => {
    const before = clone(rewards);

    const response = await patchStatus("RWD-1", { enabled: false, auditUser: admin.email }, salesAssociate);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to perform this action.");
    expect(rewards).toEqual(before);
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("incomplete normal edit remains rejected after lifecycle route support", async () => {
    const response = await request("/api/admin/rewards/RWD-1", {
      token: auth(admin),
      method: "PUT",
      body: { active: false, auditUser: admin.email },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Reward name is required.");
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });
});
