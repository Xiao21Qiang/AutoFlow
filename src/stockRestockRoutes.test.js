/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");
const bcrypt = require("bcryptjs");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { __testModels, app, filterBootstrapDataForRole, signJwt } = require("../server/server");

const UNIT_COST_ERROR = "Unit Cost must be greater than zero.";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  return {
    ...value,
    save: jest.fn(async function save() {
      return this;
    }),
    lean: async function lean() {
      return clone(this);
    },
    toObject: function toObject() {
      return clone(this);
    },
  };
}

function queryDoc(value) {
  const promise = Promise.resolve(value);
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    lean: async () => (value ? clone(value) : null),
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
    req.headers = {
      authorization: token,
    };
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

describe("stock restock route unit cost validation", () => {
  const originals = [];
  const admin = {
    id: "ADM-1",
    email: "admin@example.com",
    name: "Admin",
    userType: "Admin",
    role: "Admin",
    status: "active",
  };
  const inventoryClerk = {
    id: "INV-CLERK",
    email: "inventory@example.com",
    name: "Inventory Clerk",
    userType: "Staff",
    role: "Inventory Clerk",
    status: "active",
  };
  const generalManager = {
    id: "GM-1",
    email: "gm@example.com",
    name: "General Manager",
    userType: "Staff",
    role: "General Manager",
    status: "active",
  };
  const salesManager = {
    id: "SM-1",
    email: "sales-manager@example.com",
    name: "Sales Manager",
    userType: "Staff",
    role: "Sales Manager",
    status: "active",
  };
  const salesAssociate = {
    id: "SA-1",
    email: "sales@example.com",
    name: "Sales Associate",
    userType: "Staff",
    role: "Sales Associate",
    status: "active",
  };
  let item;
  let stockFindOneMock;
  let createdStockItems;
  let deletedStockItems;
  let securitySetting;

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = [admin, inventoryClerk, generalManager, salesManager, salesAssociate].find((candidate) => candidate.id === query.id || candidate.email === query.email) || admin;
      return { lean: async () => user };
    });
    stub(__testModels.AuditLog, "create", jest.fn(async (payload) => payload));
    stub(__testModels.Expense, "findOne", jest.fn(async () => null));
    stub(__testModels.Expense, "create", jest.fn(async (payload) => payload));
    stockFindOneMock = jest.fn();
    stub(__testModels.StockMonitoringItem, "findOne", stockFindOneMock);
    stub(__testModels.StockMonitoringItem, "create", jest.fn(async (payload) => {
      const saved = clone(payload);
      createdStockItems.push(saved);
      return doc(saved);
    }));
    stub(__testModels.StockMonitoringItem, "findOneAndUpdate", jest.fn(async (_query, payload) => {
      item = doc({ ...item.toObject(), ...payload });
      return item;
    }));
    stub(__testModels.StockMonitoringItem, "findOneAndDelete", jest.fn(async () => {
      const deleted = item ? doc(item.toObject()) : null;
      if (deleted) deletedStockItems.push(deleted.toObject());
      item = null;
      return deleted;
    }));
    securitySetting = {
      id: "autoflow-security",
      adminSpecialPinHash: bcrypt.hashSync("999999", 4),
      adminSpecialPasswordHash: bcrypt.hashSync("admin-password", 4),
      staffSpecialPinHash: bcrypt.hashSync("123456", 4),
      staffSpecialPasswordHash: bcrypt.hashSync("staff-password", 4),
      requiredDownPaymentAmount: 0,
      save: jest.fn(async function save() {
        return this;
      }),
    };
    stub(__testModels.SecuritySetting, "findOne", jest.fn(() => queryDoc(securitySetting)));
    stub(__testModels.SecuritySetting, "create", jest.fn(async () => securitySetting));
    originals.push([__testModels.SecuritySetting, "collection", __testModels.SecuritySetting.collection]);
    __testModels.SecuritySetting.collection = {
      findOne: jest.fn(async () => ({
        id: "autoflow-security",
        adminSpecialPinHash: securitySetting.adminSpecialPinHash,
        adminSpecialPasswordHash: securitySetting.adminSpecialPasswordHash,
        staffSpecialPinHash: securitySetting.staffSpecialPinHash,
        staffSpecialPasswordHash: securitySetting.staffSpecialPasswordHash,
        requiredDownPaymentAmount: 0,
      })),
      updateOne: jest.fn(async () => ({ modifiedCount: 0 })),
    };
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
  });

  beforeEach(() => {
    item = doc({
      id: "INV-1",
      name: "Ceramic Coating",
      currentStock: 5,
      maxStock: 100,
      reorderLevel: 10,
      pricePerUnit: 25,
      lastRestocked: "2026-08-01",
      restockHistory: [],
    });
    __testModels.AuditLog.create.mockClear();
    __testModels.Expense.findOne.mockClear();
    __testModels.Expense.create.mockClear();
    stockFindOneMock.mockReset();
    stockFindOneMock.mockImplementation(() => queryDoc(item));
    createdStockItems = [];
    __testModels.StockMonitoringItem.create.mockClear();
    __testModels.StockMonitoringItem.create.mockImplementation(async (payload) => {
      const saved = clone(payload);
      createdStockItems.push(saved);
      return doc(saved);
    });
    deletedStockItems = [];
    __testModels.StockMonitoringItem.findOneAndUpdate.mockClear();
    __testModels.StockMonitoringItem.findOneAndUpdate.mockImplementation(async (query, payload) => {
      item = doc({ ...item.toObject(), id: query.id || item.id, ...payload });
      return item;
    });
    __testModels.StockMonitoringItem.findOneAndDelete.mockClear();
    __testModels.StockMonitoringItem.findOneAndDelete.mockImplementation(async () => {
      const deleted = item ? doc(item.toObject()) : null;
      if (deleted) deletedStockItems.push(deleted.toObject());
      item = null;
      return deleted;
    });
    __testModels.SecuritySetting.findOne.mockClear();
    __testModels.SecuritySetting.findOne.mockImplementation(() => queryDoc(securitySetting));
    __testModels.SecuritySetting.create.mockClear();
    __testModels.SecuritySetting.create.mockImplementation(async () => securitySetting);
    __testModels.SecuritySetting.collection.findOne.mockClear();
    __testModels.SecuritySetting.collection.updateOne.mockClear();
  });

  async function postRestock(body) {
    return request("/api/admin/stock-monitoring/INV-1/restock", {
      token: auth(admin),
      body: {
        qtyToAdd: 2,
        date: "2026-08-02",
        restockedBy: "Admin",
        auditUser: "admin@example.com",
        ...body,
      },
    });
  }

  function auditPayloads() {
    return __testModels.AuditLog.create.mock.calls.map(([payload]) => payload);
  }

  function expectAuthenticatedActorAudit(payload, user, action, operation) {
    expect(payload).toEqual(expect.objectContaining({
      userId: user.email,
      action,
      targetId: "INV-1",
      meta: expect.objectContaining({
        actorUserId: user.id,
        actorRole: String(user.role || "").trim().toLowerCase(),
        actorUserType: String(user.userType || "").trim().toLowerCase(),
        targetType: "StockMonitoringItem",
        operation,
        stockItemId: "INV-1",
        name: expect.any(String),
      }),
    }));
    expect(payload.userId).not.toBe("Admin");
    expect(payload.meta.actorRole).not.toBe("Admin");
    expect(payload.meta.actorUserType).not.toBe("admin");
  }

  test.each([
    ["missing", {}],
    ["empty", { costPerUnit: "" }],
    ["zero", { costPerUnit: 0 }],
    ["zero decimal", { costPerUnit: "0.00" }],
    ["negative", { costPerUnit: -1 }],
    ["non-numeric", { costPerUnit: "abc" }],
    ["NaN string", { costPerUnit: "NaN" }],
    ["infinite string", { costPerUnit: "Infinity" }],
  ])("rejects %s Unit Cost before mutating stock", async (_label, body) => {
    const response = await postRestock(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(UNIT_COST_ERROR);
    expect(item.currentStock).toBe(5);
    expect(item.pricePerUnit).toBe(25);
    expect(item.restockHistory).toHaveLength(0);
    expect(item.save).not.toHaveBeenCalled();
    expect(__testModels.Expense.findOne).not.toHaveBeenCalled();
    expect(__testModels.Expense.create).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("accepts a valid positive Unit Cost and changes stock exactly once", async () => {
    const response = await postRestock({ costPerUnit: "12.50", qtyToAdd: 3 });

    expect(response.status).toBe(200);
    expect(item.currentStock).toBe(8);
    expect(item.pricePerUnit).toBe(12.5);
    expect(item.restockHistory).toHaveLength(1);
    expect(item.restockHistory[0]).toEqual(expect.objectContaining({ qtyToAdd: 3, costPerUnit: 12.5 }));
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(__testModels.Expense.create).toHaveBeenCalledTimes(1);
    expect(__testModels.Expense.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 37.5 }));
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "Restocked stock monitoring item",
      targetId: "INV-1",
      meta: expect.objectContaining({
        targetType: "StockMonitoringItem",
        operation: "restock",
        name: "Ceramic Coating",
        qtyToAdd: 3,
      }),
    }));
  });

  test("Inventory Clerk restock creates exactly one canonical AuditLog with authenticated actor despite forged fields", async () => {
    const response = await request("/api/admin/stock-monitoring/INV-1/restock", {
      token: auth(inventoryClerk),
      body: {
        qtyToAdd: 4,
        costPerUnit: 12,
        date: "2026-08-03",
        auditUser: "Admin",
        actor: "Admin",
        actorId: "ADM-1",
        role: "Admin",
        userType: "admin",
        employeeRole: "General Manager",
        scope: "admin",
      },
    });

    expect(response.status).toBe(200);
    expect(item.currentStock).toBe(9);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expectAuthenticatedActorAudit(auditPayloads()[0], inventoryClerk, "Restocked stock monitoring item", "restock");
    expect(auditPayloads()[0].meta).toEqual(expect.objectContaining({
      qtyToAdd: 4,
      currentStock: 9,
      stockStatusKey: "low",
    }));
  });

  test("Inventory Clerk edit creates exactly one canonical AuditLog with authenticated actor", async () => {
    const response = await request("/api/admin/stock-monitoring/INV-1", {
      token: auth(inventoryClerk),
      method: "PUT",
      body: {
        name: "Ceramic Coating Pro",
        category: "Coating",
        currentStock: 7,
        maxStock: 100,
        reorderLevel: 10,
        pricePerUnit: 30,
        auditUser: "Admin",
        role: "Admin",
        userType: "admin",
        employeeRole: "General Manager",
        scope: "admin",
      },
    });

    expect(response.status).toBe(200);
    expect(__testModels.StockMonitoringItem.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expectAuthenticatedActorAudit(auditPayloads()[0], inventoryClerk, "Updated stock monitoring item", "update");
    expect(auditPayloads()[0].meta).toEqual(expect.objectContaining({
      name: "Ceramic Coating Pro",
      previousName: "Ceramic Coating",
      currentStock: 7,
      previousCurrentStock: 5,
    }));
  });

  test("Inventory Clerk delete uses Staff Special PIN and creates exactly one canonical AuditLog", async () => {
    const response = await request("/api/admin/stock-monitoring/INV-1", {
      token: auth(inventoryClerk),
      method: "DELETE",
      body: {
        specialPin: "123456",
        auditUser: "Admin",
        role: "Admin",
        userType: "admin",
        employeeRole: "General Manager",
        scope: "admin",
      },
    });

    expect(response.status).toBe(204);
    expect(deletedStockItems).toHaveLength(1);
    expect(__testModels.StockMonitoringItem.findOneAndDelete).toHaveBeenCalledTimes(1);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expectAuthenticatedActorAudit(auditPayloads()[0], inventoryClerk, "Deleted stock monitoring item", "delete");
  });

  test("Inventory Clerk delete with incorrect Staff PIN is denied without a false success audit", async () => {
    const response = await request("/api/admin/stock-monitoring/INV-1", {
      token: auth(inventoryClerk),
      method: "DELETE",
      body: {
        specialPin: "999999",
        auditUser: "Admin",
        role: "Admin",
        userType: "admin",
        scope: "admin",
      },
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect staff special PIN.");
    expect(__testModels.StockMonitoringItem.findOneAndDelete).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("rejected Inventory Clerk edit does not generate a successful-action AuditLog", async () => {
    const response = await request("/api/admin/stock-monitoring/INV-1", {
      token: auth(inventoryClerk),
      method: "PUT",
      body: {
        currentStock: 101,
        maxStock: 100,
        reorderLevel: 10,
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Current stock quantity cannot exceed the max stock quantity of 100.");
    expect(__testModels.StockMonitoringItem.findOneAndUpdate).not.toHaveBeenCalled();
    expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
  });

  test("Admin stock create/edit/delete auditing still uses canonical labels and actor", async () => {
    const createResponse = await request("/api/admin/stock-monitoring", {
      token: auth(admin),
      body: {
        name: "Microfiber Towels",
        category: "Cleaning",
        currentStock: 10,
        maxStock: 100,
        reorderLevel: 20,
        pricePerUnit: 30,
        lastRestocked: "2026-08-02",
      },
    });
    expect(createResponse.status).toBe(201);

    const editResponse = await request("/api/admin/stock-monitoring/INV-1", {
      token: auth(admin),
      method: "PUT",
      body: {
        name: "Ceramic Coating Admin",
        category: "Coating",
        currentStock: 6,
        maxStock: 100,
        reorderLevel: 10,
        pricePerUnit: 25,
      },
    });
    expect(editResponse.status).toBe(200);

    const deleteResponse = await request("/api/admin/stock-monitoring/INV-1", {
      token: auth(admin),
      method: "DELETE",
      body: { specialPin: "999999" },
    });
    expect(deleteResponse.status).toBe(204);

    expect(auditPayloads().map((payload) => payload.action)).toEqual([
      "Created stock monitoring item",
      "Updated stock monitoring item",
      "Deleted stock monitoring item",
    ]);
    for (const payload of auditPayloads()) {
      expect(payload.userId).toBe(admin.email);
      expect(payload.meta).toEqual(expect.objectContaining({
        actorUserId: admin.id,
        actorUserType: "admin",
        actorRole: "admin",
        targetType: "StockMonitoringItem",
      }));
    }
  });

  test("General Manager approved stock restock behavior still logs canonically", async () => {
    const response = await request("/api/admin/stock-monitoring/INV-1/restock", {
      token: auth(generalManager),
      body: {
        qtyToAdd: 2,
        costPerUnit: 15,
        date: "2026-08-03",
      },
    });

    expect(response.status).toBe(200);
    expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
    expectAuthenticatedActorAudit(auditPayloads()[0], generalManager, "Restocked stock monitoring item", "restock");
  });

  test("Inventory Clerk stock AuditLog appears in canonical Admin bootstrap audit logs", async () => {
    await request("/api/admin/stock-monitoring/INV-1/restock", {
      token: auth(inventoryClerk),
      body: {
        qtyToAdd: 2,
        costPerUnit: 15,
        date: "2026-08-03",
      },
    });

    const scoped = filterBootstrapDataForRole({
      bookings: [],
      services: [],
      stockMonitoring: [],
      payments: [],
      users: [admin, inventoryClerk],
      auditLogs: auditPayloads(),
      archivedAuditLogs: [],
      reviews: [],
      promos: [],
      quoteRequests: [],
      expenses: [],
      commissions: [],
      rewards: [],
      customerRewards: [],
      alerts: [],
      settings: {},
      financialReport: {},
    }, admin);

    expect(scoped.auditLogs).toHaveLength(1);
    expect(scoped.auditLogs[0]).toEqual(expect.objectContaining({
      userId: inventoryClerk.email,
      action: "Restocked stock monitoring item",
      targetId: "INV-1",
    }));
  });

  describe("stock item creation validation", () => {
    async function postStockItem(body) {
      return request("/api/admin/stock-monitoring", {
        token: auth(admin),
        body: {
          name: "Microfiber Towels",
          category: "Cleaning",
          currentStock: 10,
          maxStock: 100,
          reorderLevel: 20,
          pricePerUnit: 30,
          lastRestocked: "2026-08-02",
          auditUser: "admin@example.com",
          ...body,
        },
      });
    }

    test.each([
      ["missing name", { name: "" }, "Item name is required."],
      ["whitespace name", { name: "   " }, "Item name is required."],
      ["invalid category", { category: "" }, "Please select a valid category."],
      ["blank current stock", { currentStock: "" }, "Current stock quantity is required."],
      ["non-numeric current stock", { currentStock: "abc" }, "Current stock quantity must be a valid number."],
      ["infinite current stock", { currentStock: "Infinity" }, "Current stock quantity must be a valid number."],
      ["negative current stock", { currentStock: "-5" }, "Current stock quantity cannot be negative."],
      ["blank max stock", { maxStock: "" }, "Max stock quantity is required."],
      ["negative max stock", { maxStock: "-1" }, "Max stock quantity cannot be negative."],
      ["blank reorder level", { reorderLevel: "" }, "Reorder level is required."],
      ["reorder above max", { maxStock: "5", reorderLevel: "6" }, "Reorder level cannot exceed max stock quantity."],
      ["current stock above max", { currentStock: "11", maxStock: "10", reorderLevel: "5" }, "Current stock quantity cannot exceed the max stock quantity of 10."],
      ["blank price per unit", { pricePerUnit: "" }, "Price per unit is required."],
      ["non-numeric price per unit", { pricePerUnit: "abc" }, "Price per unit must be a valid number."],
      ["negative price per unit", { pricePerUnit: "-1" }, "Price per unit cannot be negative."],
    ])("rejects %s before creating stock", async (_label, override, message) => {
      const response = await postStockItem(override);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(message);
      expect(createdStockItems).toHaveLength(0);
      expect(__testModels.StockMonitoringItem.create).not.toHaveBeenCalled();
      expect(__testModels.Expense.create).not.toHaveBeenCalled();
      expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
    });

    test("allows Inventory Clerk direct stock creation with canonical audit despite forged admin fields", async () => {
      const response = await request("/api/admin/stock-monitoring", {
        token: auth(inventoryClerk),
        body: {
          name: "Microfiber Towels",
          category: "Cleaning",
          currentStock: 10,
          maxStock: 100,
          reorderLevel: 20,
          pricePerUnit: 30,
          role: "Admin",
          userType: "admin",
          employeeRole: "General Manager",
          scope: "admin",
          auditUser: "Admin",
        },
      });

      expect(response.status).toBe(201);
      expect(createdStockItems).toHaveLength(1);
      expect(createdStockItems[0]).toEqual(expect.objectContaining({
        name: "Microfiber Towels",
        category: "Cleaning",
        currentStock: 10,
        maxStock: 100,
        reorderLevel: 20,
        pricePerUnit: 30,
      }));
      expect(__testModels.StockMonitoringItem.create).toHaveBeenCalledTimes(1);
      expect(__testModels.Expense.create).toHaveBeenCalledTimes(1);
      expect(__testModels.AuditLog.create).toHaveBeenCalledTimes(1);
      expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: inventoryClerk.email,
        action: "Created stock monitoring item",
        targetId: expect.stringMatching(/^INV-/),
        meta: expect.objectContaining({
          actorUserId: inventoryClerk.id,
          actorRole: "inventory clerk",
          actorUserType: "staff",
          targetType: "StockMonitoringItem",
          operation: "create",
          name: "Microfiber Towels",
        }),
      }));

      const scoped = filterBootstrapDataForRole({
        bookings: [],
        services: [],
        stockMonitoring: [],
        payments: [],
        users: [admin, inventoryClerk],
        auditLogs: auditPayloads(),
        archivedAuditLogs: [],
        reviews: [],
        promos: [],
        quoteRequests: [],
        expenses: [],
        commissions: [],
        rewards: [],
        customerRewards: [],
        alerts: [],
        settings: {},
        financialReport: {},
      }, inventoryClerk);
      expect(scoped.auditLogs.map((log) => log.action)).toEqual(["Created stock monitoring item"]);
    });

    test("General Manager stock creation remains allowed", async () => {
      const response = await request("/api/admin/stock-monitoring", {
        token: auth(generalManager),
        body: {
          name: "Glass Cleaner",
          category: "Cleaning",
          currentStock: 5,
          maxStock: 40,
          reorderLevel: 8,
          pricePerUnit: 12,
        },
      });

      expect(response.status).toBe(201);
      expect(__testModels.StockMonitoringItem.create).toHaveBeenCalledTimes(1);
      expect(__testModels.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: generalManager.email,
        action: "Created stock monitoring item",
      }));
    });

    test.each([
      ["Sales Manager", salesManager],
      ["Sales Associate", salesAssociate],
    ])("%s cannot create stock items", async (_label, actor) => {
      const response = await request("/api/admin/stock-monitoring", {
        token: auth(actor),
        body: {
          name: "Unauthorized Cleaner",
          category: "Cleaning",
          currentStock: 5,
          maxStock: 40,
          reorderLevel: 8,
          pricePerUnit: 12,
          role: "Admin",
          userType: "admin",
        },
      });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("You do not have permission to perform this action.");
      expect(__testModels.StockMonitoringItem.create).not.toHaveBeenCalled();
      expect(__testModels.AuditLog.create).not.toHaveBeenCalled();
    });
  });
});
