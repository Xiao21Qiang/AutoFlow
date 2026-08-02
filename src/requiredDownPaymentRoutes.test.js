/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

jest.setTimeout(15000);

const adminUser = {
  id: "ADM-1",
  email: "admin@example.com",
  name: "Admin One",
  first: "Admin",
  last: "One",
  phone: "09111111111",
  userType: "Admin",
  role: "Admin",
  status: "active",
  password: "AdminPass1!",
};

const staffUser = {
  id: "STF-1",
  email: "staff@example.com",
  name: "Staff One",
  userType: "Staff",
  role: "Junior Detailer",
  status: "active",
  password: "StaffPass1!",
};

const customerUser = {
  id: "CUS-1",
  email: "customer@example.com",
  name: "Customer One",
  userType: "Customer",
  role: "New",
  status: "active",
  password: "CustomerPass1!",
};

const originals = [];
let readyStateDescriptor;
let users;
let auditLogs;
let securitySetting;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  if (!value) return { lean: async () => null };
  return {
    ...value,
    lean: async () => clone(value),
    toObject: () => clone(value),
    save: async function save() {
      Object.assign(value, clone(this));
      return this;
    },
  };
}

function stub(model, method, implementation) {
  originals.push([model, method, model[method]]);
  model[method] = implementation;
}

function auth(user = adminUser) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { method = "PATCH", token = auth(), body = {} } = {}) {
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

function resetData() {
  users = [clone(adminUser), clone(staffUser), clone(customerUser)];
  auditLogs = [];
  securitySetting = {
    id: "security-settings",
    adminSpecialPinHash: bcrypt.hashSync("123456", 4),
    adminSpecialPasswordHash: bcrypt.hashSync("AdminSpecial1!", 4),
    staffSpecialPinHash: bcrypt.hashSync("654321", 4),
    staffSpecialPasswordHash: bcrypt.hashSync("StaffSpecial1!", 4),
    requiredDownPaymentAmount: 500,
    updatedBy: "system",
    updatedAt: "2026-08-02T00:00:00.000Z",
    save: jest.fn(async () => securitySetting),
  };
}

function successAuditLogs() {
  return auditLogs.filter((log) => log.action === "Updated required down payment amount");
}

function patchDownPayment(body, actor = adminUser) {
  return request("/api/admin/settings/down-payment", {
    token: auth(actor),
    body,
  });
}

beforeAll(() => {
  readyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    get: () => 1,
  });

  resetData();

  stub(__testModels.User, "findOne", (query = {}) => {
    const found = users.find((user) => {
      if (query.id && user.id === query.id) return true;
      if (query.email && user.email === query.email) return true;
      return false;
    });
    return doc(found);
  });
  stub(__testModels.AuditLog, "create", jest.fn());
  stub(__testModels.SecuritySetting, "findOne", async () => securitySetting);
  stub(__testModels.SecuritySetting, "create", async () => securitySetting);
  originals.push([__testModels.SecuritySetting, "collection", __testModels.SecuritySetting.collection]);
  __testModels.SecuritySetting.collection = {
    findOne: async () => securitySetting,
    updateOne: jest.fn(async () => ({})),
  };
});

afterAll(() => {
  originals.reverse().forEach(([model, method, original]) => {
    model[method] = original;
  });
  if (readyStateDescriptor) {
    Object.defineProperty(mongoose.connection, "readyState", readyStateDescriptor);
  }
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  resetData();
  __testModels.AuditLog.create.mockReset();
  __testModels.AuditLog.create.mockImplementation(async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
  __testModels.SecuritySetting.collection.updateOne.mockClear();
});

describe("Required down payment settings route", () => {
  test.each([
    ["positive integer", 750, 750],
    ["positive decimal", 125.55, 125.55],
  ])("valid %s saves once and creates exactly one success audit", async (_label, amount, expectedAmount) => {
    const response = await patchDownPayment({
      requiredDownPaymentAmount: amount,
      adminSpecialPassword: "AdminSpecial1!",
      auditUser: "spoofed@example.com",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      message: "Required down payment amount updated.",
      requiredDownPaymentAmount: expectedAmount,
    }));
    expect(response.body).not.toHaveProperty("adminSpecialPasswordHash");
    expect(response.body).not.toHaveProperty("adminSpecialPinHash");
    expect(response.body).not.toHaveProperty("staffSpecialPasswordHash");
    expect(response.body).not.toHaveProperty("staffSpecialPinHash");
    expect(securitySetting.requiredDownPaymentAmount).toBe(expectedAmount);
    expect(securitySetting.save).toHaveBeenCalledTimes(1);
    expect(successAuditLogs()).toHaveLength(1);
    expect(successAuditLogs()[0]).toEqual(expect.objectContaining({
      userId: adminUser.email,
      targetId: "autoflow-security",
      meta: { requiredDownPaymentAmount: expectedAmount },
    }));
  });

  test.each([
    ["missing amount", undefined, "Required down payment amount is required."],
    ["null amount", null, "Required down payment amount is required."],
    ["blank amount", "", "Required down payment amount is required."],
    ["whitespace-only amount", "   ", "Required down payment amount is required."],
    ["zero amount", 0, "Required down payment must be greater than zero."],
    ["zero decimal amount", "0.00", "Required down payment must be greater than zero."],
    ["negative amount", -1, "Required down payment must be greater than zero."],
    ["negative decimal amount", "-0.01", "Required down payment must be greater than zero."],
    ["non-numeric amount", "abc", "Required down payment must be greater than zero."],
    ["NaN amount", NaN, "Required down payment must be greater than zero."],
    ["Infinity amount", Infinity, "Required down payment must be greater than zero."],
  ])("%s rejects before mutation, credential validation side effects, or success audit", async (_label, amount, message) => {
    const body = { requiredDownPaymentAmount: amount, adminSpecialPassword: "AdminSpecial1!" };
    if (amount === undefined) delete body.requiredDownPaymentAmount;

    const response = await patchDownPayment(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(securitySetting.requiredDownPaymentAmount).toBe(500);
    expect(securitySetting.save).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["incorrect Admin Special Password", { requiredDownPaymentAmount: 700, adminSpecialPassword: "wrong-password" }, "Incorrect admin special password."],
    ["missing Admin Special Password", { requiredDownPaymentAmount: 700 }, "Admin special password is required."],
    ["blank Admin Special Password", { requiredDownPaymentAmount: 700, adminSpecialPassword: "   " }, "Admin special password is required."],
  ])("%s rejects without changing the existing setting", async (_label, body, message) => {
    const response = await patchDownPayment(body);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(message);
    expect(securitySetting.requiredDownPaymentAmount).toBe(500);
    expect(securitySetting.save).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["Staff", staffUser],
    ["Customer", customerUser],
  ])("unauthorized %s cannot update required down payment", async (_label, actor) => {
    const response = await patchDownPayment({
      requiredDownPaymentAmount: 700,
      adminSpecialPassword: "AdminSpecial1!",
    }, actor);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(securitySetting.requiredDownPaymentAmount).toBe(500);
    expect(securitySetting.save).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });
});
