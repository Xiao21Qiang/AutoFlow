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
  const salesAssociate = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
  const inventoryClerk = { id: "INV-1", email: "inventory@example.com", name: "Inventory Clerk", userType: "Staff", role: "Inventory Clerk", status: "active" };
  const staff = { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Marketing", status: "active" };
  const customer = { id: "CUS-1", email: "customer@example.com", name: "Customer", userType: "Customer", role: "New", status: "active" };
  const users = [admin, generalManager, salesAssociate, inventoryClerk, staff, customer];

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

  const engagementManageRoutes = [
    ["promo create", "POST", "/api/admin/promos"],
    ["promo edit", "PUT", "/api/admin/promos/PRO-1"],
    ["promo archive", "PATCH", "/api/admin/promos/PRO-1/archive"],
    ["promo restore", "PATCH", "/api/admin/promos/PRO-1/restore"],
    ["review moderation", "PUT", "/api/admin/reviews/REV-1"],
    ["reward create", "POST", "/api/admin/rewards"],
    ["reward edit", "PUT", "/api/admin/rewards/RWD-1"],
    ["reward status", "PATCH", "/api/admin/rewards/RWD-1/status"],
    ["reward delete", "DELETE", "/api/admin/rewards/RWD-1"],
  ];

  const adminOnlyRoutes = [
    ["promo use", "POST", "/api/admin/promos/PRO-1/use"],
    ["manual reward generation", "POST", "/api/admin/rewards/generate"],
  ];

  test.each(engagementManageRoutes)("%s denies General Manager without Marketing Engagement management even with forged Admin body", async (_label, method, path) => {
    const response = await request(path, {
      method,
      token: auth(generalManager),
      body: forgedAdminBody,
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to perform this action.");
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each(engagementManageRoutes)("%s denies Sales Associate without Marketing Engagement management even with forged Admin body", async (_label, method, path) => {
    const response = await request(path, {
      method,
      token: auth(salesAssociate),
      body: forgedAdminBody,
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to perform this action.");
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each(adminOnlyRoutes)("%s remains Admin-only and denies Marketing", async (_label, method, path) => {
    const response = await request(path, {
      method,
      token: auth(staff),
      body: forgedAdminBody,
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(__testModels.Promo.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.create).not.toHaveBeenCalled();
    expect(__testModels.Reward.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    ["Inventory Clerk", inventoryClerk, 403, "You do not have permission to perform this action."],
    ["Customer", customer, 403, "You do not have permission to perform this action."],
    ["Unauthenticated", null, 401, "Authentication required."],
  ])("%s cannot call Marketing Engagement management mutations", async (_label, user, expectedStatus, expectedMessage) => {
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
