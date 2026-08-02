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

describe("Edit Reward route validation", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };
  let rewards;
  let auditLogs;

  const matchesRewardQuery = (reward, query = {}) => {
    if (Array.isArray(query.$or)) {
      return query.$or.some((candidate) => matchesRewardQuery(reward, candidate));
    }
    if (query.id && typeof query.id === "object" && query.id.$ne && reward.id === query.id.$ne) return false;
    if (query.id && typeof query.id !== "object" && reward.id !== query.id) return false;
    if (query._id && reward._id !== query._id) return false;
    if (query.code && reward.code !== query.code) return false;
    return Boolean(query.id || query._id || query.code);
  };

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  function existingReward(overrides = {}) {
    return {
      id: "RWD-1",
      name: "Loyalty Spark",
      code: "LOYALTY-SPARK",
      type: "Percentage Discount",
      rewardType: "Percentage Discount",
      description: "Reward for loyal customers.",
      value: "10",
      discountType: "Percentage",
      discountValue: 10,
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

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = [admin, staff].find((item) => item.id === query.id || item.email === query.email);
      return user ? doc(user) : emptyDoc();
    });
    stub(__testModels.Reward, "findOne", (query = {}) => {
      const found = rewards.find((reward) => matchesRewardQuery(reward, query));
      return found ? doc(found) : query.code ? emptyDoc() : null;
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
      const index = rewards.findIndex((reward) => matchesRewardQuery(reward, query));
      if (index < 0) return null;
      rewards[index] = { ...rewards[index], ...clone(payload), id: rewards[index].id };
      return doc(rewards[index]);
    });
    __testModels.AuditLog.create.mockImplementation(async (payload) => {
      auditLogs.push(clone(payload));
      return clone(payload);
    });
  });

  function validPayload(overrides = {}) {
    return {
      name: "Loyalty Glow",
      type: "Percentage Discount",
      description: "Updated reward.",
      value: "15",
      rarity: "Rare",
      weight: "12",
      stock: "9",
      expirationDays: "45",
      active: true,
      auditUser: admin.email,
      ...overrides,
    };
  }

  async function putReward(body, user = admin, id = "RWD-1") {
    return request(`/api/admin/rewards/${id}`, {
      token: auth(user),
      body,
    });
  }

  test("updates exactly one existing reward and one success audit", async () => {
    const response = await putReward(validPayload());

    expect(response.status).toBe(200);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toEqual(expect.objectContaining({
      id: "RWD-1",
      name: "Loyalty Glow",
      code: "LOYALTY-SPARK",
      type: "Percentage Discount",
      rewardType: "Percentage Discount",
      value: "15",
      discountValue: 15,
      stock: 9,
      quantity: 9,
      weight: 12,
      expirationDays: 45,
      rarity: "Rare",
    }));
    expect(__testModels.Reward.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Reward definition updated",
      targetId: "RWD-1",
    }));
  });

  test("preserves Fixed Discount with a value above 100", async () => {
    rewards = [existingReward({
      type: "Fixed Discount",
      rewardType: "Fixed Discount",
      discountType: "Fixed",
      discountValue: 150,
      value: "150",
    })];

    const response = await putReward(validPayload({
      type: "Fixed Discount",
      value: "150",
      discountType: "Fixed",
    }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: "RWD-1",
      type: "Fixed Discount",
      rewardType: "Fixed Discount",
      discountType: "Fixed",
      discountValue: 150,
      value: "150",
    }));
    expect(__testModels.Reward.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["missing reward name", { name: undefined }, /Reward name is required/],
    ["whitespace-only reward name", { name: "   " }, /Reward name is required/],
    ["missing type", { type: undefined }, /Reward type is required/],
    ["unsupported type", { type: "Mystery Box" }, /Reward type is invalid/],
    ["missing value", { value: undefined }, /Reward value is required/],
    ["blank value", { value: "   " }, /Reward value is required/],
    ["zero percentage value", { value: "0" }, /greater than zero/],
    ["negative percentage value", { value: "-1" }, /greater than zero/],
    ["non-numeric percentage value", { value: "abc" }, /greater than zero/],
    ["NaN percentage value", { value: "NaN" }, /greater than zero/],
    ["Infinity percentage value", { value: "Infinity" }, /greater than zero/],
    ["percentage over 100", { value: "101" }, /100/],
    ["zero fixed value", { type: "Fixed Discount", value: "0" }, /greater than zero/],
    ["negative fixed value", { type: "Fixed Discount", value: "-1" }, /greater than zero/],
    ["non-numeric fixed value", { type: "Fixed Discount", value: "abc" }, /greater than zero/],
    ["missing stock", { stock: undefined }, /Reward stock is required/],
    ["zero stock", { stock: "0" }, /positive whole number/],
    ["negative stock", { stock: "-1" }, /positive whole number/],
    ["fractional stock", { stock: "1.5" }, /positive whole number/],
    ["non-numeric stock", { stock: "abc" }, /positive whole number/],
    ["missing weight", { weight: undefined }, /weight must be greater than zero/],
    ["zero weight", { weight: "0" }, /weight must be greater than zero/],
    ["negative weight", { weight: "-1" }, /weight must be greater than zero/],
    ["non-numeric weight", { weight: "abc" }, /weight must be greater than zero/],
    ["missing expiration days", { expirationDays: undefined }, /Expiration days are required/],
    ["zero expiration days", { expirationDays: "0" }, /positive whole number/],
    ["negative expiration days", { expirationDays: "-1" }, /positive whole number/],
    ["fractional expiration days", { expirationDays: "1.5" }, /positive whole number/],
    ["non-numeric expiration days", { expirationDays: "abc" }, /positive whole number/],
    ["invalid rarity", { rarity: "Legendary" }, /rarity is invalid/],
    ["malformed name", { name: { nested: "bad" } }, /Reward name is invalid/],
    ["malformed value", { value: { nested: "bad" } }, /Reward value is invalid/],
  ])("rejects %s without mutating data or writing a success audit", async (_label, override, messagePattern) => {
    const before = clone(rewards);
    const body = validPayload(override);
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await putReward(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(messagePattern);
    expect(rewards).toEqual(before);
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("rejects duplicate normalized reward codes without mutating data or writing a success audit", async () => {
    rewards.push(existingReward({ id: "RWD-2", name: "Existing Glow", code: "DUPLICATE-CODE" }));
    const before = clone(rewards);

    const response = await putReward(validPayload({ code: " duplicate code " }));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Reward code already exists.");
    expect(rewards).toEqual(before);
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("returns 404 without mutation or audit when the reward is missing", async () => {
    const response = await putReward(validPayload(), admin, "RWD-MISSING");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Reward not found.");
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("staff cannot update rewards through the admin route", async () => {
    const before = clone(rewards);

    const response = await putReward(validPayload({ auditUser: staff.email }), staff);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(rewards).toEqual(before);
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Unauthorized admin route attempt",
    }));
  });
});
