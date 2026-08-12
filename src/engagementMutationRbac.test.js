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

describe("Engagement mutation RBAC", () => {
  const originals = [];
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const generalManager = { id: "GM-1", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };
  const customer = { id: "CUS-1", email: "customer@example.com", name: "Customer", userType: "Customer", role: "New", status: "active" };
  const users = [admin, generalManager, staff, customer];

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = users.find((item) => item.id === query.id || item.email === query.email);
      return user ? doc(user) : emptyDoc();
    });
    stub(__testModels.Promo, "create", jest.fn());
    stub(__testModels.Promo, "findOneAndUpdate", jest.fn());
    stub(__testModels.Review, "findOne", jest.fn());
    stub(__testModels.Reward, "create", jest.fn());
    stub(__testModels.Reward, "findOneAndUpdate", jest.fn());
    stub(__testModels.Reward, "findOneAndDelete", jest.fn());
    stub(__testModels.CustomerReward, "countDocuments", jest.fn());
    stub(__testModels.AuditLog, "create", jest.fn(async (payload) => payload));
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    [
      __testModels.Promo.create,
      __testModels.Promo.findOneAndUpdate,
      __testModels.Review.findOne,
      __testModels.Reward.create,
      __testModels.Reward.findOneAndUpdate,
      __testModels.Reward.findOneAndDelete,
      __testModels.CustomerReward.countDocuments,
      __testModels.AuditLog.create,
    ].forEach((mock) => mock.mockClear());
  });

  const forgedAdminBody = {
    role: "Admin",
    userType: "admin",
    auditUser: "admin@example.com",
    permission: "engagement.manage",
    specialPin: "654321",
    specialPassword: "StaffSpecial1!",
    title: "Forged Promo",
    code: "FORGED",
    message: "Nope.",
    discountType: "Percentage",
    discountValue: 10,
    maxUsagePerUser: 1,
    name: "Forged Reward",
    type: "Discount",
    description: "Nope.",
    value: "10",
    rarity: "Common",
    weight: 1,
    stock: 1,
    expirationDays: 30,
    enabled: false,
    status: "Published",
  };

  const mutationRoutes = [
    ["promo create", "POST", "/api/admin/promos"],
    ["promo edit", "PUT", "/api/admin/promos/PRO-1"],
    ["promo archive", "PATCH", "/api/admin/promos/PRO-1/archive"],
    ["review moderation", "PUT", "/api/admin/reviews/REV-1"],
    ["reward create", "POST", "/api/admin/rewards"],
    ["reward edit", "PUT", "/api/admin/rewards/RWD-1"],
    ["reward status", "PATCH", "/api/admin/rewards/RWD-1/status"],
    ["reward delete", "DELETE", "/api/admin/rewards/RWD-1"],
    ["manual reward generation", "POST", "/api/admin/rewards/generate"],
  ];

  test.each(mutationRoutes)("%s denies General Manager even with forged Admin body and Staff credentials", async (_label, method, path) => {
    const response = await request(path, {
      method,
      token: auth(generalManager),
      body: forgedAdminBody,
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    ["other Staff", staff, 403, "Admin access required."],
    ["Customer", customer, 403, "Admin access required."],
    ["Unauthenticated", null, 401, "Authentication required."],
  ])("%s cannot call administrative Engagement mutations", async (_label, user, expectedStatus, expectedMessage) => {
    const response = await request("/api/admin/rewards/RWD-1/status", {
      method: "PATCH",
      token: user ? auth(user) : "",
      body: forgedAdminBody,
    });

    expect(response.status).toBe(expectedStatus);
    expect(response.body.message).toBe(expectedMessage);
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
