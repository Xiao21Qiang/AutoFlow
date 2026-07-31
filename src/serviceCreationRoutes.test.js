/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

jest.setTimeout(15000);

const adminUser = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
const customerUser = { id: "CUS-1", email: "customer@example.com", name: "Customer", userType: "Customer", role: "New", status: "active" };

const stockItems = [
  { id: "STK-1", name: "Soap", category: "Chemical", currentStock: 10 },
  { id: "STK-2", name: "Wax", category: "Chemical", currentStock: 5 },
];

let services;
let auditLogs;
const originals = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  if (!value) {
    return {
      lean: async () => null,
    };
  }
  return {
    ...value,
    lean: async () => clone(value),
    toObject: () => clone(value),
    set: (key, nextValue) => {
      value[key] = nextValue;
    },
    markModified: () => {},
    save: async () => value,
  };
}

function chain(value) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    lean: async () => clone(value),
  };
}

function stub(model, method, implementation) {
  originals.push([model, method, model[method]]);
  model[method] = implementation;
}

function auth(user = adminUser) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { method = "GET", token = auth(), body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = {
      ...(token ? { authorization: token } : {}),
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
      resolve({
        status: res.statusCode,
        body: text ? JSON.parse(text) : {},
      });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function resetData(seedServices = []) {
  services = seedServices.map(clone);
  auditLogs = [];
}

function basePayload(overrides = {}) {
  return {
    name: "Premium Wash",
    desc: "",
    serviceType: "Basic Service",
    category: "Wash",
    price: 500,
    priceBySize: {
      sedanSmallCar: 500,
      midsizePickupMpv: 600,
      suv: 700,
      xlVanSemiTruck: 800,
    },
    mins: 60,
    allowedArrivalTimes: ["08:00", "09:00"],
    enabled: true,
    consumablesBySize: {
      Soap: {
        sedanSmallCar: 1,
        midsizePickupMpv: 1,
        suv: 1,
        xlVanSemiTruck: 1,
      },
    },
    auditUser: "admin@example.com",
    ...overrides,
  };
}

beforeAll(async () => {
  stub(__testModels.User, "findOne", (query = {}) => {
    if (query.id === adminUser.id || query.email === adminUser.email) return doc(adminUser);
    if (query.id === customerUser.id || query.email === customerUser.email) return doc(customerUser);
    return doc(null);
  });
  stub(__testModels.User, "find", () => chain([adminUser, customerUser]));
  stub(__testModels.Service, "find", () => chain(services));
  stub(__testModels.Service, "findOne", (query = {}) => doc(services.find((service) => service.id === query.id || service.name === query.name)));
  stub(__testModels.Service, "create", async (payload) => {
    const saved = clone(payload);
    services.push(saved);
    return saved;
  });
  stub(__testModels.StockMonitoringItem, "find", () => chain(stockItems));
  stub(__testModels.AuditLog, "create", async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
  stub(__testModels.AuditLog, "countDocuments", async () => 0);
});

afterAll(async () => {
  originals.reverse().forEach(([model, method, original]) => {
    model[method] = original;
  });
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  resetData();
});

describe("Admin service creation route validation", () => {
  test("a valid unique service with at least one valid consumable creates exactly one record", async () => {
    const response = await request("/api/admin/services", { method: "POST", body: basePayload({ name: " New  Wash " }) });
    expect(response.status).toBe(201);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      name: "New Wash",
      category: "Wash",
      enabled: true,
      consumablesBySize: {
        Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 },
      },
    });
    expect(auditLogs).toHaveLength(1);
  });

  test.each(["Car Wash", "car wash", " Car  Wash "])("duplicate service name %s is rejected with a clear conflict response", async (name) => {
    resetData([{ id: "SVC-1", name: "Car Wash", enabled: true }]);
    const response = await request("/api/admin/services", { method: "POST", body: basePayload({ name }) });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("A service with this name already exists.");
    expect(services).toHaveLength(1);
    expect(auditLogs).toHaveLength(0);
  });

  test.each([
    ["missing consumables field", { consumablesBySize: undefined, consumables: undefined }, "Please select at least one consumable."],
    ["empty consumables array", { consumablesBySize: {}, consumables: [] }, "Please select at least one consumable."],
    ["malformed consumables value", { consumablesBySize: "Soap", consumables: "Soap" }, "Please select at least one consumable."],
    [
      "unknown consumable IDs",
      { consumablesBySize: { Unknown: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } } },
      "Please select at least one valid consumable.",
    ],
    [
      "validated consumable list becomes empty",
      { consumablesBySize: { "": { sedanSmallCar: 1 }, Missing: { sedanSmallCar: 1 } } },
      "Please select at least one valid consumable.",
    ],
  ])("%s is rejected without a partial Service record", async (_label, override, message) => {
    const response = await request("/api/admin/services", { method: "POST", body: basePayload(override) });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(services).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
  });

  test("unauthenticated creation is rejected", async () => {
    const response = await request("/api/admin/services", { method: "POST", token: "", body: basePayload() });
    expect(response.status).toBe(401);
    expect(services).toHaveLength(0);
  });

  test("customer creation is rejected by role checks", async () => {
    const response = await request("/api/admin/services", { method: "POST", token: auth(customerUser), body: basePayload() });
    expect(response.status).toBe(403);
    expect(services).toHaveLength(0);
  });

  test("existing valid service creation remains functional after invalid attempts", async () => {
    await request("/api/admin/services", { method: "POST", body: basePayload({ consumablesBySize: {} }) });
    expect(services).toHaveLength(0);
    const response = await request("/api/admin/services", { method: "POST", body: basePayload({ name: "Interior Detail" }) });
    expect(response.status).toBe(201);
    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("Interior Detail");
  });

  test("existing service update behavior remains functional", async () => {
    resetData([
      {
        id: "SVC-1",
        name: "Car Wash",
        desc: "Exterior wash",
        serviceType: "Basic Service",
        category: "Wash",
        enabled: true,
        price: 500,
        priceBySize: { sedanSmallCar: 500, midsizePickupMpv: 600, suv: 700, xlVanSemiTruck: 800 },
        mins: 60,
        allowedArrivalTimes: ["08:00"],
        consumablesBySize: { Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } },
      },
    ]);
    const response = await request("/api/admin/services/SVC-1", {
      method: "PUT",
      body: basePayload({
        name: "Car Wash",
        enabled: false,
        allowedArrivalTimes: ["09:00"],
      }),
    });
    expect(response.status).toBe(200);
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ id: "SVC-1", name: "Car Wash", enabled: false, allowedArrivalTimes: ["09:00"] });
  });
});

describe("Admin service update route validation", () => {
  function seedServices() {
    resetData([
      {
        id: "SVC-1",
        name: "Car Wash",
        desc: "Exterior wash",
        serviceType: "Basic Service",
        category: "Wash",
        enabled: true,
        price: 500,
        priceBySize: { sedanSmallCar: 500, midsizePickupMpv: 600, suv: 700, xlVanSemiTruck: 800 },
        mins: 60,
        allowedArrivalTimes: ["08:00"],
        consumablesBySize: { Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } },
        consumables: ["Soap: 1"],
      },
      {
        id: "SVC-2",
        name: "Motor Coating",
        desc: "Gloss protection",
        serviceType: "Package",
        category: "Coating",
        enabled: true,
        price: 1500,
        priceBySize: { sedanSmallCar: 1500, midsizePickupMpv: 1700, suv: 1900, xlVanSemiTruck: 2100 },
        mins: 120,
        allowedArrivalTimes: ["08:00"],
        consumablesBySize: { Wax: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } },
        consumables: ["Wax: 1"],
      },
    ]);
  }

  test("a valid update modifies exactly one existing service and records an audit event", async () => {
    seedServices();
    const response = await request("/api/admin/services/SVC-1", {
      method: "PUT",
      body: basePayload({ name: "Premium Wash", desc: "Updated wash", consumablesBySize: { Soap: { sedanSmallCar: 2, midsizePickupMpv: 2, suv: 2, xlVanSemiTruck: 2 } } }),
    });
    expect(response.status).toBe(200);
    expect(services).toHaveLength(2);
    expect(services[0]).toMatchObject({ id: "SVC-1", name: "Premium Wash", desc: "Updated wash" });
    expect(services[1].name).toBe("Motor Coating");
    expect(auditLogs).toHaveLength(1);
  });

  test.each(["Car Wash", "car wash", " Car  Wash "])("keeping the same service name %s is allowed and excludes itself", async (name) => {
    seedServices();
    const response = await request("/api/admin/services/SVC-1", {
      method: "PUT",
      body: basePayload({ name }),
    });
    expect(response.status).toBe(200);
    expect(services[0].id).toBe("SVC-1");
    expect(auditLogs).toHaveLength(1);
  });

  test.each(["Motor Coating", "motor coating", " Motor  Coating "])("renaming to duplicate %s is rejected safely", async (name) => {
    seedServices();
    const original = clone(services[0]);
    const response = await request("/api/admin/services/SVC-1", {
      method: "PUT",
      body: basePayload({ name, desc: "Should not save" }),
    });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("A service with this name already exists.");
    expect(services[0]).toEqual(original);
    expect(auditLogs).toHaveLength(0);
  });

  test.each([
    ["missing consumables", (payload) => {
      delete payload.consumablesBySize;
      delete payload.consumables;
      return payload;
    }, "Please select at least one consumable."],
    ["empty consumables", (payload) => ({ ...payload, consumablesBySize: {}, consumables: [] }), "Please select at least one consumable."],
    ["malformed consumables", (payload) => ({ ...payload, consumablesBySize: "Soap", consumables: "Soap" }), "Please select at least one consumable."],
    [
      "unknown consumables",
      (payload) => ({ ...payload, consumablesBySize: { Unknown: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } } }),
      "Please select at least one valid consumable.",
    ],
    [
      "validated consumable list becomes empty",
      (payload) => ({ ...payload, consumablesBySize: { Missing: { sedanSmallCar: 1 }, "": { sedanSmallCar: 1 } } }),
      "Please select at least one valid consumable.",
    ],
  ])("%s is rejected and leaves the stored service unchanged", async (_label, mutatePayload, message) => {
    seedServices();
    const original = clone(services[0]);
    const response = await request("/api/admin/services/SVC-1", {
      method: "PUT",
      body: mutatePayload(basePayload({ name: "Updated Wash" })),
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(services[0]).toEqual(original);
    expect(auditLogs).toHaveLength(0);
  });

  test("unauthenticated update is rejected", async () => {
    seedServices();
    const response = await request("/api/admin/services/SVC-1", { method: "PUT", token: "", body: basePayload() });
    expect(response.status).toBe(401);
    expect(services[0].name).toBe("Car Wash");
  });

  test("customer update is rejected", async () => {
    seedServices();
    const response = await request("/api/admin/services/SVC-1", { method: "PUT", token: auth(customerUser), body: basePayload() });
    expect(response.status).toBe(403);
    expect(services[0].name).toBe("Car Wash");
  });

  test("existing enable and disable action remains functional without service detail edits", async () => {
    resetData([{ id: "SVC-1", name: "Legacy Wash", enabled: true, consumablesBySize: {}, consumables: [] }]);
    const response = await request("/api/admin/services/SVC-1", {
      method: "PUT",
      body: { enabled: false, auditUser: "admin@example.com" },
    });
    expect(response.status).toBe(200);
    expect(services[0]).toMatchObject({ id: "SVC-1", name: "Legacy Wash", enabled: false });
    expect(auditLogs).toHaveLength(1);
  });
});
