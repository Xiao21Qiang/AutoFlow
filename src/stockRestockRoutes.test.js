/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { __testModels, app, signJwt } = require("../server/server");

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
    lean: async () => clone(value),
    toObject: () => clone(value),
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
  let item;
  let stockFindOneMock;
  let createdStockItems;

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", () => ({ lean: async () => admin }));
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
    stockFindOneMock.mockImplementation(async () => item);
    createdStockItems = [];
    __testModels.StockMonitoringItem.create.mockClear();
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
  });
});
