/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");
const engagement = require("../server/domain/engagement");

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

describe("Add Reward route validation", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };
  let rewards;
  let auditLogs;

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = [admin, staff].find((item) => item.id === query.id || item.email === query.email);
      return user ? doc(user) : emptyDoc();
    });
    stub(__testModels.Reward, "findOne", (query = {}) => {
      const found = rewards.find((reward) => {
        if (query.code && reward.code === query.code) return true;
        if (query.id && reward.id === query.id) return true;
        return false;
      });
      return found ? doc(found) : emptyDoc();
    });
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
    rewards = [];
    auditLogs = [];
    __testModels.Reward.create.mockClear();
    __testModels.AuditLog.create.mockClear();
    __testModels.Reward.create.mockImplementation(async (payload) => {
      const saved = clone(payload);
      rewards.push(saved);
      return doc(saved);
    });
    __testModels.AuditLog.create.mockImplementation(async (payload) => {
      auditLogs.push(clone(payload));
      return clone(payload);
    });
  });

  function validPayload(overrides = {}) {
    return {
      name: "Loyalty Spark",
      type: "Discount",
      description: "Reward for loyal customers.",
      value: "10",
      rarity: "Common",
      weight: "10",
      stock: "8",
      expirationDays: "30",
      auditUser: admin.email,
      ...overrides,
    };
  }

  async function postReward(body, user = admin) {
    return request("/api/admin/rewards", {
      token: auth(user),
      body,
    });
  }

  test("creates exactly one valid reward and one success audit without requiring a Special PIN", async () => {
    const response = await postReward(validPayload({
      name: "  Loyalty Spark  ",
      description: "  Reward for loyal customers.  ",
      value: " 10 ",
    }));

    expect(response.status).toBe(201);
    expect(rewards).toHaveLength(1);
    expect(response.body).toEqual(expect.objectContaining({
      name: "Loyalty Spark",
      code: "LOYALTY-SPARK",
      type: "Percentage Discount",
      rewardType: "Percentage Discount",
      description: "Reward for loyal customers.",
      value: "10",
      discountType: "Percentage",
      discountValue: 10,
      stock: 8,
      quantity: 8,
      expirationDays: 30,
    }));
    expect(__testModels.Reward.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Reward definition created",
      targetId: rewards[0].id,
    }));
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
    ["missing expiration days", { expirationDays: undefined }, /Expiration days are required/],
    ["zero expiration days", { expirationDays: "0" }, /positive whole number/],
    ["negative expiration days", { expirationDays: "-1" }, /positive whole number/],
    ["fractional expiration days", { expirationDays: "1.5" }, /positive whole number/],
    ["non-numeric expiration days", { expirationDays: "abc" }, /positive whole number/],
    ["invalid weight", { weight: "0" }, /weight must be greater than zero/],
    ["invalid rarity", { rarity: "Legendary" }, /rarity is invalid/],
    ["malformed name", { name: { nested: "bad" } }, /Reward name is invalid/],
    ["malformed value", { value: { nested: "bad" } }, /Reward value is invalid/],
  ])("rejects %s before creating or writing a success audit", async (_label, override, messagePattern) => {
    const body = validPayload(override);
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await postReward(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(messagePattern);
    expect(rewards).toHaveLength(0);
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("accepts a non-numeric item value and persists canonical inventory fields", async () => {
    const response = await postReward(validPayload({
      type: "Item",
      value: "  Free Microfiber Towel  ",
      stock: "3",
      expirationDays: "14",
    }));

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({
      type: "Free Microfiber Towel",
      rewardType: "Free Microfiber Towel",
      value: "Free Microfiber Towel",
      stock: 3,
      quantity: 3,
      expirationDays: 14,
      discountValue: 0,
    }));
    expect(rewards).toHaveLength(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
  });

  test("rejects duplicate normalized reward codes before creating or writing a success audit", async () => {
    rewards.push({
      id: "RWD-EXISTING",
      name: "Existing",
      code: "LOYALTY-SPARK",
      type: "Percentage Discount",
      value: "10",
      stock: 10,
      quantity: 10,
      expirationDays: 30,
    });

    const response = await postReward(validPayload({ name: " loyalty spark " }));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Reward code already exists.");
    expect(rewards).toHaveLength(1);
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("staff cannot create rewards through the admin route", async () => {
    const response = await postReward(validPayload({ auditUser: staff.email }), staff);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(rewards).toHaveLength(0);
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Unauthorized admin route attempt",
    }));
  });
});

describe("Reward definition domain validation", () => {
  test("normalizes existing canonical reward types and trims textual values", () => {
    expect(engagement.normalizeRewardDefinitionPayload({
      name: " Service Reward ",
      type: "Service",
      description: "Free service.",
      value: " Free Car Wash ",
      stock: 5,
      expirationDays: 30,
      weight: 1,
    })).toEqual(expect.objectContaining({
      name: "Service Reward",
      code: "SERVICE-REWARD",
      type: "Free Car Wash",
      rewardType: "Free Car Wash",
      value: "Free Car Wash",
      stock: 5,
      quantity: 5,
      expirationDays: 30,
    }));
  });

  test("requires value, stock, and expiration days at the domain boundary", () => {
    expect(() => engagement.normalizeRewardDefinitionPayload({
      name: "No Value",
      type: "Item",
      description: "Bad.",
      stock: 1,
      expirationDays: 30,
      weight: 1,
    })).toThrow(/Reward value is required/);
    expect(() => engagement.normalizeRewardDefinitionPayload({
      name: "No Stock",
      type: "Item",
      description: "Bad.",
      value: "Free Microfiber Towel",
      expirationDays: 30,
      weight: 1,
    })).toThrow(/Reward stock is required/);
    expect(() => engagement.normalizeRewardDefinitionPayload({
      name: "No Expiration",
      type: "Item",
      description: "Bad.",
      value: "Free Microfiber Towel",
      stock: 1,
      weight: 1,
    })).toThrow(/Expiration days are required/);
  });
});
