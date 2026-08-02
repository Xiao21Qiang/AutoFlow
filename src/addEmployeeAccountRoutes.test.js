/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");
const mongoose = require("mongoose");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

jest.setTimeout(15000);

const adminUser = {
  id: "ADM-1",
  email: "admin@example.com",
  name: "Admin One",
  userType: "Admin",
  role: "Admin",
  status: "active",
  password: "AdminPass1!",
};

const staffUser = {
  id: "STF-AUTH",
  email: "staff@example.com",
  name: "Staff One",
  userType: "Staff",
  role: "General Manager",
  status: "active",
  password: "StaffPass1!",
};

const customerUser = {
  id: "CUS-AUTH",
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
  };
}

function stub(model, method, implementation) {
  originals.push([model, method, model[method]]);
  model[method] = implementation;
}

function auth(user = adminUser) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { method = "POST", token = auth(), body = {} } = {}) {
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

function resetData(extraUsers = []) {
  users = [clone(adminUser), clone(staffUser), clone(customerUser), ...extraUsers.map(clone)];
  auditLogs = [];
}

function validPayload(overrides = {}) {
  return {
    name: "Casey Staff",
    email: "casey.staff@example.com",
    phone: "09123456789",
    role: "Junior Detailer",
    password: "StaffPass1!",
    currentPassword: "AdminPass1!",
    auditUser: "spoofed@example.com",
    ...overrides,
  };
}

function successAuditLogs() {
  return auditLogs.filter((log) => log.action === "Created staff account");
}

async function postStaff(body, user = adminUser) {
  return request("/api/admin/users/staff", {
    token: auth(user),
    body,
  });
}

async function createUser(payload) {
  if (users.some((user) => user.email === payload.email)) {
    const error = new Error("Duplicate key");
    error.code = 11000;
    error.keyPattern = { email: 1 };
    throw error;
  }
  if (users.some((user) => user.phone === payload.phone)) {
    const error = new Error("Duplicate key");
    error.code = 11000;
    error.keyPattern = { phone: 1 };
    throw error;
  }
  const saved = clone(payload);
  users.push(saved);
  return doc(saved);
}

beforeAll(() => {
  readyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    get: () => 1,
  });

  stub(__testModels.User, "findOne", (query = {}) => {
    const found = users.find((user) => {
      if (query.id && user.id === query.id) return true;
      if (query.email && user.email === query.email) return true;
      if (query.phone && user.phone === query.phone) return true;
      return false;
    });
    return doc(found);
  });
  stub(__testModels.User, "create", jest.fn());
  stub(__testModels.AuditLog, "create", jest.fn());
  stub(__testModels.AuditLog, "countDocuments", async () => 0);
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
  __testModels.User.create.mockReset();
  __testModels.User.create.mockImplementation(createUser);
  __testModels.AuditLog.create.mockReset();
  __testModels.AuditLog.create.mockImplementation(async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
});

describe("Add Employee Account route validation", () => {
  test("valid employee creation creates exactly one Staff user and one success audit with a safe response", async () => {
    const response = await postStaff(validPayload({
      name: "  Casey  Staff  ",
      email: "Casey.Staff@Example.com",
    }));

    expect(response.status).toBe(201);
    const createdUsers = users.filter((user) => user.email === "casey.staff@example.com");
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]).toEqual(expect.objectContaining({
      name: "Casey Staff",
      first: "Casey",
      last: "Staff",
      userType: "Staff",
      role: "Junior Detailer",
      phone: "09123456789",
      status: "active",
      cars: [],
    }));
    expect(createdUsers[0].password).toMatch(/^scrypt\$/);
    expect(response.body).toEqual(expect.objectContaining({
      name: "Casey Staff",
      email: "casey.staff@example.com",
      userType: "Staff",
      role: "Junior Detailer",
      status: "active",
    }));
    expect(response.body).not.toHaveProperty("password");
    expect(response.body).not.toHaveProperty("adminSpecialPasswordHash");
    expect(response.body).not.toHaveProperty("staffSpecialPasswordHash");
    expect(__testModels.User.create).toHaveBeenCalledTimes(1);
    expect(successAuditLogs()).toHaveLength(1);
    expect(successAuditLogs()[0]).toEqual(expect.objectContaining({
      userId: adminUser.email,
      action: "Created staff account",
      targetId: createdUsers[0].id,
    }));
  });

  test.each([
    ["missing full name", { name: undefined }, "Full name is required."],
    ["whitespace-only full name", { name: "   " }, "Full name is required."],
    ["missing email", { email: undefined }, "Email is required."],
    ["whitespace-only email", { email: "   " }, "Email is required."],
    ["plain text email", { email: "plain-text" }, "Please enter a valid email address."],
    ["user at only", { email: "user@" }, "Please enter a valid email address."],
    ["missing local part", { email: "@example.com" }, "Please enter a valid email address."],
    ["missing top-level domain", { email: "user@example" }, "Please enter a valid email address."],
    ["space in email", { email: "user example@example.com" }, "Please enter a valid email address."],
    ["multiple at symbols", { email: "user@@example.com" }, "Please enter a valid email address."],
    ["unsupported Admin role", { role: "Admin" }, "Select a valid staff role. Admin cannot be created from this form."],
    ["arbitrary module permissions", { moduleAccess: ["module.userManagement"] }, "Module permissions are not configurable for employee creation."],
  ])("rejects %s before creating a user or success audit", async (_label, override, message) => {
    const body = validPayload(override);
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await postStaff(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(users.filter((user) => user.email === "casey.staff@example.com")).toHaveLength(0);
    expect(__testModels.User.create).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["missing password", { password: undefined }, "Password must be at least 8 characters."],
    ["weak password", { password: "password" }, "Password must include at least 1 uppercase letter."],
    ["invalid phone", { phone: "123" }, "Contact number must be 11 digits and start with 09."],
  ])("rejects %s without user, credential, or success-audit creation", async (_label, override, message) => {
    const body = validPayload(override);
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await postStaff(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(__testModels.User.create).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["Existing@Example.com"],
    [" existing@example.com "],
  ])("duplicate normalized email %s is rejected with no second account or success audit", async (email) => {
    resetData([employeeRecord({ id: "STF-EXISTING", email: "existing@example.com", phone: "09999999999" })]);

    const response = await postStaff(validPayload({ email }));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("That email is already registered.");
    expect(users.filter((user) => user.email === "existing@example.com")).toHaveLength(1);
    expect(__testModels.User.create).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test("duplicate contact number is rejected before creating or writing a success audit", async () => {
    resetData([employeeRecord({ id: "STF-EXISTING", email: "existing@example.com", phone: "09123456789" })]);

    const response = await postStaff(validPayload({ email: "new.staff@example.com" }));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("That contact number is already registered.");
    expect(__testModels.User.create).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test("incorrect current admin password creates no employee and no success audit", async () => {
    const response = await postStaff(validPayload({ currentPassword: "wrong-password" }));

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Current account password is incorrect.");
    expect(__testModels.User.create).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["Staff", staffUser],
    ["Customer", customerUser],
  ])("%s cannot create employee accounts through the Admin route", async (_label, actor) => {
    const response = await postStaff(validPayload({ auditUser: actor.email }), actor);

    expect(response.status).toBe(403);
    expect(__testModels.User.create).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test("repeated requests are stopped by normalized duplicate-email safeguards", async () => {
    const first = await postStaff(validPayload());
    const second = await postStaff(validPayload({ email: "Casey.Staff@Example.com", phone: "09999999999" }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.message).toBe("That email is already registered.");
    expect(users.filter((user) => user.email === "casey.staff@example.com")).toHaveLength(1);
    expect(successAuditLogs()).toHaveLength(1);
  });
});

function employeeRecord(overrides = {}) {
  return {
    id: "STF-1",
    name: "Existing Staff",
    email: "existing@example.com",
    phone: "09999999999",
    userType: "Staff",
    role: "Junior Detailer",
    status: "active",
    password: "StaffPass1!",
    ...overrides,
  };
}
