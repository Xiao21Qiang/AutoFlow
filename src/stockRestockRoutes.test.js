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
});
