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

describe("Add Promo route validation", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };
  let promos;
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
    stub(__testModels.Promo, "findOne", (query = {}) => {
      const found = promos.find((promo) => {
        if (query.code && promo.code === query.code) return true;
        if (query.id && promo.id === query.id) return true;
        return false;
      });
      return found ? doc(found) : emptyDoc();
    });
    stub(__testModels.Promo, "create", jest.fn());
    stub(__testModels.AuditLog, "create", jest.fn());
    stub(__testModels.Service, "find", () => ({ lean: async () => [] }));
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    promos = [];
    auditLogs = [];
    __testModels.Promo.create.mockClear();
    __testModels.AuditLog.create.mockClear();
    __testModels.Promo.create.mockImplementation(async (payload) => {
      const saved = clone(payload);
      promos.push(saved);
      return doc(saved);
    });
    __testModels.AuditLog.create.mockImplementation(async (payload) => {
      auditLogs.push(clone(payload));
      return clone(payload);
    });
  });

  function validPayload(overrides = {}) {
    return {
      title: "Summer Shine",
      code: "summer 10",
      status: "Active",
      message: "Save on detailing.",
      discountType: "Percentage",
      discountValue: "10",
      maxUsagePerUser: "1",
      expiryMode: "none",
      auditUser: admin.email,
      ...overrides,
    };
  }

  async function postPromo(body, user = admin) {
    return request("/api/admin/promos", {
      token: auth(user),
      body,
    });
  }

  test("creates exactly one valid promo and one success audit without requiring a Special PIN", async () => {
    const response = await postPromo(validPayload({ message: "  Trimmed message.  " }));

    expect(response.status).toBe(201);
    expect(promos).toHaveLength(1);
    expect(response.body).toEqual(expect.objectContaining({
      title: "Summer Shine",
      code: "SUMMER-10",
      status: "Active",
      message: "Trimmed message.",
      description: "Trimmed message.",
      discountType: "Percentage",
      discountValue: 10,
      maxUsagePerUser: 1,
    }));
    expect(__testModels.Promo.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Promotion created",
      targetId: promos[0].id,
    }));
  });

  test.each([
    ["missing title", { title: undefined }, /Promotion name is required/],
    ["whitespace-only title", { title: "   " }, /Promotion name is required/],
    ["missing code", { code: undefined }, /Promotion code is required/],
    ["whitespace-only code", { code: "   " }, /Promotion code is required/],
    ["missing discount", { discountValue: undefined }, /discount value is required/i],
    ["zero discount", { discountValue: "0" }, /greater than zero/i],
    ["negative discount", { discountValue: "-1" }, /greater than zero/i],
    ["non-numeric discount", { discountValue: "abc" }, /greater than zero/i],
    ["NaN discount", { discountValue: "NaN" }, /greater than zero/i],
    ["Infinity discount", { discountValue: "Infinity" }, /greater than zero/i],
    ["percentage above 100", { discountValue: "101" }, /100/],
    ["missing max usage per user", { maxUsagePerUser: undefined }, /Max usage per user is required/],
    ["zero max usage per user", { maxUsagePerUser: "0" }, /positive whole number/],
    ["negative max usage per user", { maxUsagePerUser: "-1" }, /positive whole number/],
    ["fractional max usage per user", { maxUsagePerUser: "1.5" }, /positive whole number/],
    ["non-numeric max usage per user", { maxUsagePerUser: "abc" }, /positive whole number/],
    ["malformed message", { message: { nested: "bad" } }, /Promotion message is invalid/],
  ])("rejects %s before creating or writing a success audit", async (_label, override, messagePattern) => {
    const body = validPayload(override);
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await postPromo(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(messagePattern);
    expect(promos).toHaveLength(0);
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("rejects duplicate normalized codes before creating or writing a success audit", async () => {
    promos.push({
      id: "PRO-EXISTING",
      title: "Existing",
      code: "SAVE-10",
      message: "",
      discountType: "Percentage",
      discountValue: 10,
      maxUsagePerUser: 1,
    });

    const response = await postPromo(validPayload({ code: " save 10 " }));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Promotion code already exists.");
    expect(promos).toHaveLength(1);
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("allows an optional empty message and persists it as blank copy", async () => {
    const response = await postPromo(validPayload({ message: "   " }));

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("");
    expect(response.body.description).toBe("");
    expect(promos).toHaveLength(1);
    expect(__testModels.Promo.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
  });

  test("staff cannot create promos through the admin route", async () => {
    const response = await postPromo(validPayload({ auditUser: staff.email }), staff);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(promos).toHaveLength(0);
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Unauthorized admin route attempt",
    }));
  });
});
