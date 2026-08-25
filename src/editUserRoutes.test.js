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

const { __testModels, __testPasswordChangeOtpStore, app, signJwt } = require("../server/server");

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

const secondAdminUser = {
  id: "ADM-2",
  email: "admin.two@example.com",
  name: "Admin Two",
  first: "Admin",
  last: "Two",
  phone: "09222222222",
  userType: "Admin",
  role: "Admin",
  status: "active",
  password: "AdminPass1!",
};

const legacyOwnerAdminUser = {
  id: "ADM-LEGACY",
  email: "owner@example.com",
  name: "Owner Admin",
  first: "Owner",
  last: "Admin",
  phone: "09444444444",
  userType: "",
  role: "Owner",
  status: "active",
  password: "AdminPass1!",
};

const staffUser = {
  id: "STF-1",
  email: "casey.staff@example.com",
  name: "Casey Staff",
  first: "Casey",
  last: "Staff",
  phone: "09123456789",
  userType: "Staff",
  role: "Junior Detailer",
  status: "active",
  password: "existing-hash",
};

const otherStaffUser = {
  id: "STF-2",
  email: "other.staff@example.com",
  name: "Other Staff",
  first: "Other",
  last: "Staff",
  phone: "09999999999",
  userType: "Staff",
  role: "Marketing",
  status: "active",
  password: "other-hash",
};

const salesAssociateUser = {
  id: "SA-1",
  email: "sales@example.com",
  name: "Sales Associate",
  first: "Sales",
  last: "Associate",
  phone: "09170000001",
  userType: "Staff",
  role: "Sales Associate",
  status: "active",
  password: "sales-hash",
};

const customerUser = {
  id: "CUS-1",
  email: "customer@example.com",
  name: "Customer One",
  first: "Customer",
  last: "One",
  phone: "09333333333",
  userType: "Customer",
  role: "New",
  status: "active",
  password: "CustomerPass1!",
};

const originals = [];
let readyStateDescriptor;
let users;
let auditLogs;
let duplicateRaceField = "";
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

function chain(value) {
  return {
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

async function request(path, { method = "PUT", token = auth(), body = {} } = {}) {
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
  users = [clone(adminUser), clone(staffUser), clone(otherStaffUser), clone(customerUser), ...extraUsers.map(clone)];
  auditLogs = [];
  duplicateRaceField = "";
}

function validPayload(overrides = {}) {
  return {
    id: "STF-1",
    name: "Casey Updated",
    userType: "Staff",
    role: "Senior Detailer",
    email: "casey.updated@example.com",
    phone: "09876543210",
    status: "active",
    specialPassword: "AdminSpecial1!",
    auditUser: "spoofed@example.com",
    ...overrides,
  };
}

function successAuditLogs() {
  return auditLogs.filter((log) => ["Updated user", "Updated user password", "Activated user", "Deactivated user"].includes(log.action));
}

function deleteSuccessAuditLogs() {
  return auditLogs.filter((log) => ["Soft deleted user", "Hard deleted user"].includes(log.action));
}

async function putUser(id, body, actor = adminUser) {
  return request(`/api/admin/users/${id}`, {
    token: auth(actor),
    body,
  });
}

async function deleteUser(id, body = { specialPassword: "AdminSpecial1!" }, actor = adminUser) {
  return request(`/api/admin/users/${id}`, {
    method: "DELETE",
    token: auth(actor),
    body,
  });
}

async function updateUser(query, payload) {
  if (duplicateRaceField) {
    const error = new Error("Duplicate key");
    error.code = 11000;
    error.keyPattern = { [duplicateRaceField]: 1 };
    throw error;
  }
  const index = users.findIndex((user) => user.id === query.id);
  if (index === -1) return null;
  users[index] = { ...users[index], ...clone(payload) };
  return doc(users[index]);
}

beforeAll(() => {
  readyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    get: () => 1,
  });

  securitySetting = {
    id: "security-settings",
    adminSpecialPinHash: bcrypt.hashSync("123456", 4),
    adminSpecialPasswordHash: bcrypt.hashSync("AdminSpecial1!", 4),
    staffSpecialPinHash: bcrypt.hashSync("654321", 4),
    staffSpecialPasswordHash: bcrypt.hashSync("StaffSpecial1!", 4),
    requiredDownPaymentAmount: 0,
    updatedBy: "system",
    save: jest.fn(async () => securitySetting),
  };

  stub(__testModels.User, "findOne", (query = {}) => {
    const found = users.find((user) => {
      if (query.id && user.id === query.id) return true;
      if (query.email && user.email === query.email) return true;
      if (query.phone && user.phone === query.phone) return true;
      return false;
    });
    if (!found && query.id === "STF-MISSING") return null;
    return doc(found);
  });
  stub(__testModels.User, "find", () => chain(users));
  stub(__testModels.User, "findOneAndUpdate", jest.fn());
  stub(__testModels.User, "findOneAndDelete", jest.fn());
  stub(__testModels.AuditLog, "create", jest.fn());
  stub(__testModels.AuditLog, "countDocuments", async () => 0);
  stub(__testModels.Booking, "countDocuments", async () => 0);
  stub(__testModels.Payment, "countDocuments", async () => 0);
  stub(__testModels.Review, "countDocuments", async () => 0);
  stub(__testModels.CustomerReward, "countDocuments", async () => 0);
  stub(__testModels.Commission, "countDocuments", async () => 0);
  stub(__testModels.SecuritySetting, "findOne", async () => securitySetting);
  stub(__testModels.SecuritySetting, "create", async () => securitySetting);
  originals.push([__testModels.SecuritySetting, "collection", __testModels.SecuritySetting.collection]);
  __testModels.SecuritySetting.collection = {
    findOne: async () => securitySetting,
    updateOne: async () => ({}),
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
  __testPasswordChangeOtpStore.clear();
  __testModels.User.findOneAndUpdate.mockReset();
  __testModels.User.findOneAndUpdate.mockImplementation(updateUser);
  __testModels.User.findOneAndDelete.mockReset();
  __testModels.User.findOneAndDelete.mockImplementation(async (query) => {
    const index = users.findIndex((user) => user.id === query.id);
    if (index === -1) return null;
    const [removed] = users.splice(index, 1);
    return doc(removed);
  });
  __testModels.AuditLog.create.mockReset();
  __testModels.AuditLog.create.mockImplementation(async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
});

describe("Edit User route validation", () => {
  test("authenticated Admin can update own first name and receive refreshed auth payload without role payload", async () => {
    const response = await request("/api/admin/users/ADM-1?refreshSession=1", {
      token: auth(adminUser),
      body: {
        first: "  Updated  ",
        auditUser: "spoofed@example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toEqual(expect.objectContaining({
      id: "ADM-1",
      first: "Updated",
      last: "One",
      name: "Updated One",
      email: "admin@example.com",
      phone: "09111111111",
      userType: "admin",
      role: "admin",
    }));
    expect(users.find((user) => user.id === "ADM-1")).toEqual(expect.objectContaining({
      first: "Updated",
      last: "One",
      email: "admin@example.com",
      phone: "09111111111",
      userType: "Admin",
      role: "Admin",
    }));
    expect(__testModels.User.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty("role");
    expect(__testModels.User.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty("userType");
    expect(__testModels.User.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty("status");
  });

  test("authenticated Admin can update own last name only", async () => {
    const response = await request("/api/admin/users/ADM-1?refreshSession=1", {
      token: auth(adminUser),
      body: { last: "  Updated  " },
    });

    expect(response.status).toBe(200);
    expect(users.find((user) => user.id === "ADM-1")).toEqual(expect.objectContaining({
      first: "Admin",
      last: "Updated",
      name: "Admin Updated",
      role: "Admin",
    }));
  });

  test("authenticated Admin can update own valid unique email only", async () => {
    const response = await request("/api/admin/users/ADM-1?refreshSession=1", {
      token: auth(adminUser),
      body: { email: " Updated.Admin@Example.com " },
    });

    expect(response.status).toBe(200);
    expect(users.find((user) => user.id === "ADM-1")).toEqual(expect.objectContaining({
      email: "updated.admin@example.com",
      role: "Admin",
    }));
    expect(response.body.token).toEqual(expect.any(String));
  });

  test("authenticated Admin can update own valid phone only", async () => {
    const response = await request("/api/admin/users/ADM-1?refreshSession=1", {
      token: auth(adminUser),
      body: { phone: "09998887777" },
    });

    expect(response.status).toBe(200);
    expect(users.find((user) => user.id === "ADM-1")).toEqual(expect.objectContaining({
      phone: "09998887777",
      role: "Admin",
    }));
  });

  test("authenticated Admin can update all normal profile fields while preserving Admin role", async () => {
    const response = await request("/api/admin/users/ADM-1?refreshSession=1", {
      token: auth(adminUser),
      body: {
        first: "  Updated  ",
        last: " Admin ",
        email: "Updated.Admin@Example.com",
        phone: "09998887777",
      },
    });

    expect(response.status).toBe(200);
    expect(users.find((user) => user.id === "ADM-1")).toEqual(expect.objectContaining({
      first: "Updated",
      last: "Admin",
      name: "Updated Admin",
      email: "updated.admin@example.com",
      phone: "09998887777",
      userType: "Admin",
      role: "Admin",
    }));
  });

  test("legacy Owner Admin can update profile without being rejected by canonical Admin role validation", async () => {
    resetData([legacyOwnerAdminUser]);
    const response = await request("/api/admin/users/ADM-LEGACY?refreshSession=1", {
      token: auth(legacyOwnerAdminUser),
      body: {
        first: "Updated Owner",
        email: "updated.owner@example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(expect.objectContaining({
      id: "ADM-LEGACY",
      first: "Updated Owner",
      email: "updated.owner@example.com",
      userType: "admin",
      role: "owner",
    }));
    expect(users.find((user) => user.id === "ADM-LEGACY")).toEqual(expect.objectContaining({
      first: "Updated Owner",
      email: "updated.owner@example.com",
      userType: "",
      role: "Owner",
    }));
  });

  test("crafted self-profile request cannot change role or protected account fields", async () => {
    const response = await request("/api/admin/users/ADM-1?refreshSession=1", {
      token: auth(adminUser),
      body: {
        first: "Updated",
        role: "Staff",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Profile updates cannot change protected account fields.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(users.find((user) => user.id === "ADM-1")).toEqual(expect.objectContaining({
      role: "Admin",
      userType: "Admin",
    }));
  });

  test("Admin cannot use profile refresh endpoint to spoof another user's identity", async () => {
    resetData([secondAdminUser]);
    const response = await request("/api/admin/users/ADM-2?refreshSession=1", {
      token: auth(adminUser),
      body: {
        first: "Spoofed",
        last: "Admin",
        email: "spoofed@example.com",
        phone: "09998887777",
      },
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Special password is required.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(users.find((user) => user.id === "ADM-2")).toEqual(expect.objectContaining({
      first: "Admin",
      email: "admin.two@example.com",
    }));
  });

  test("User Management still rejects invalid Admin role mutation", async () => {
    resetData([secondAdminUser]);
    const response = await putUser("ADM-2", {
      id: "ADM-2",
      name: "Admin Two",
      first: "Admin",
      last: "Two",
      userType: "Admin",
      role: "Owner",
      email: "admin.two@example.com",
      phone: "09222222222",
      status: "active",
      specialPassword: "AdminSpecial1!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Admin accounts must use the Admin role.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    ["blank first name", { first: "   ", last: "Admin" }, "First name is required."],
    ["blank last name", { first: "Updated", last: "   " }, "Last name is required."],
    ["invalid first name", { first: "Admin123", last: "Admin" }, "Name can only contain letters, spaces, hyphens, apostrophes, and periods."],
    ["invalid last name", { first: "Updated", last: "Admin123" }, "Name can only contain letters, spaces, hyphens, apostrophes, and periods."],
  ])("self profile rejects %s", async (_label, override, message) => {
    const response = await putUser("ADM-1", {
      ...adminUser,
      ...override,
      email: "admin@example.com",
      phone: "09111111111",
      userType: "Admin",
      role: "Admin",
      status: "active",
    }, adminUser);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("unauthenticated profile update is rejected", async () => {
    const response = await request("/api/admin/users/ADM-1", {
      token: null,
      body: { ...adminUser, first: "Updated" },
    });

    expect(response.status).toBe(401);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("Admin cannot spoof an immutable ID while updating profile", async () => {
    const response = await putUser("ADM-1", {
      ...adminUser,
      id: "ADM-2",
      first: "Updated",
      last: "Admin",
      email: "admin@example.com",
      phone: "09111111111",
    }, adminUser);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("User ID cannot be changed.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("valid update changes exactly one user, preserves ID, and returns a safe DTO", async () => {
    const response = await putUser("STF-1", validPayload({ name: "  Casey  Updated  ", email: "Casey.Updated@Example.com" }));

    expect(response.status).toBe(200);
    expect(users.filter((user) => user.id === "STF-1")).toHaveLength(1);
    expect(users.find((user) => user.id === "STF-1")).toEqual(expect.objectContaining({
      id: "STF-1",
      name: "Casey Updated",
      userType: "Staff",
      role: "Senior Detailer",
      email: "casey.updated@example.com",
      phone: "09876543210",
      status: "active",
    }));
    expect(__testModels.User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(successAuditLogs()).toHaveLength(1);
    expect(successAuditLogs()[0].userId).toBe(adminUser.email);
    expect(response.body).not.toHaveProperty("password");
    expect(response.body).not.toHaveProperty("adminSpecialPasswordHash");
    expect(response.body).not.toHaveProperty("staffSpecialPasswordHash");
  });

  test.each([
    ["missing name", { name: undefined }, "Full name is required."],
    ["blank name", { name: "" }, "Full name is required."],
    ["whitespace-only name", { name: "   " }, "Full name is required."],
    ["missing email", { email: undefined }, "Email is required."],
    ["blank email", { email: "   " }, "Email is required."],
    ["invalid email", { email: "invalid-email" }, "Please enter a valid email address."],
    ["invalid email user@", { email: "user@" }, "Please enter a valid email address."],
    ["invalid email @example.com", { email: "@example.com" }, "Please enter a valid email address."],
    ["invalid email no tld", { email: "user@example" }, "Please enter a valid email address."],
    ["invalid email with space", { email: "user example@example.com" }, "Please enter a valid email address."],
    ["invalid phone", { phone: "123" }, "Please enter a valid phone number."],
    ["unsupported role", { role: "Admin" }, "Select a valid staff role. Admin cannot be created from this form."],
    ["invalid status", { status: "suspended" }, "Select a valid account status."],
    ["arbitrary module permissions", { moduleAccess: ["module.userManagement"] }, "Module permissions are not configurable from Edit User."],
    ["changed immutable id", { id: "STF-99" }, "User ID cannot be changed."],
    ["weak new password", { password: "password" }, "Password must include at least 1 uppercase letter."],
  ])("rejects %s before mutation or success audit", async (_label, override, message) => {
    const body = validPayload(override);
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) delete body[key];
    });

    const response = await putUser("STF-1", body);

    expect(response.status).toBe(message.includes("already") ? 409 : 400);
    expect(response.body.message).toBe(message);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
    expect(users.find((user) => user.id === "STF-1").name).toBe("Casey Staff");
  });

  test("duplicate normalized email is rejected while unchanged own email is allowed", async () => {
    const ownEmailResponse = await putUser("STF-1", validPayload({ email: " Casey.Staff@Example.com " }));
    expect(ownEmailResponse.status).toBe(200);

    resetData();
    __testModels.User.findOneAndUpdate.mockClear();
    auditLogs = [];
    const duplicateResponse = await putUser("STF-1", validPayload({ email: " Other.Staff@Example.com " }));
    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.message).toBe("That email is already registered.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test("duplicate phone is rejected while unchanged own phone is allowed", async () => {
    const ownPhoneResponse = await putUser("STF-1", validPayload({ phone: "09123456789" }));
    expect(ownPhoneResponse.status).toBe(200);

    resetData();
    __testModels.User.findOneAndUpdate.mockClear();
    auditLogs = [];
    const duplicateResponse = await putUser("STF-1", validPayload({ phone: "09999999999" }));
    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.message).toBe("That contact number is already registered.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test("invalid special password prevents role update and creates no success audit", async () => {
    const response = await putUser("STF-1", validPayload({ role: "Senior Detailer", specialPassword: "wrong-password" }));

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect admin special password.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
    expect(users.find((user) => user.id === "STF-1").role).toBe("Junior Detailer");
  });

  test("valid status deactivation and activation update one user and preserve unrelated fields", async () => {
    const deactivate = await putUser("STF-1", validPayload({ status: "deactivated" }));
    expect(deactivate.status).toBe(200);
    expect(users.find((user) => user.id === "STF-1")).toEqual(expect.objectContaining({
      status: "deactivated",
      email: "casey.updated@example.com",
      deactivatedBy: adminUser.email,
    }));

    const activate = await putUser("STF-1", validPayload({ status: "active" }));
    expect(activate.status).toBe(200);
    expect(users.find((user) => user.id === "STF-1")).toEqual(expect.objectContaining({
      status: "active",
      deactivatedAt: "",
      deactivatedBy: "",
    }));
  });

  test("final active Admin deactivation and self-demotion are protected", async () => {
    resetData([]);
    const finalAdminResponse = await putUser("ADM-1", {
      ...validPayload({
        id: "ADM-1",
        name: "Admin One",
        userType: "Admin",
        role: "Admin",
        email: "admin@example.com",
        phone: "09111111111",
        status: "deactivated",
      }),
    });
    expect(finalAdminResponse.status).toBe(403);
    expect(finalAdminResponse.body.message).toBe("Admins cannot deactivate or remove their own admin access here.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();

    resetData([secondAdminUser]);
    const selfDemotionResponse = await putUser("ADM-1", {
      ...validPayload({
        id: "ADM-1",
        name: "Admin One",
        userType: "Staff",
        role: "General Manager",
        email: "admin@example.com",
        phone: "09111111111",
      }),
    });
    expect(selfDemotionResponse.status).toBe(403);
    expect(selfDemotionResponse.body.message).toBe("Admins cannot deactivate or remove their own admin access here.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("blank or absent new password preserves existing hash, valid new password is hashed", async () => {
    const existingHash = users.find((user) => user.id === "STF-1").password;
    const blankPasswordResponse = await putUser("STF-1", validPayload({ password: "   " }));
    expect(blankPasswordResponse.status).toBe(200);
    expect(users.find((user) => user.id === "STF-1").password).toBe(existingHash);

    resetData();
    const validPasswordResponse = await putUser("STF-1", validPayload({ password: "NewPass1!" }));
    expect(validPasswordResponse.status).toBe(200);
    const savedPassword = users.find((user) => user.id === "STF-1").password;
    expect(savedPassword).toMatch(/^scrypt\$/);
    expect(savedPassword).not.toBe("NewPass1!");
    expect(validPasswordResponse.body).not.toHaveProperty("password");
  });

  test("password reset requires verified server-side OTP and ignores forgeable client booleans", async () => {
    __testPasswordChangeOtpStore.set("OTP-PW-UNVERIFIED", {
      userId: "ADM-1",
      email: adminUser.email,
      otp: "123456",
      expiresAt: Date.now() + 60000,
      attempts: 0,
      verified: false,
    });

    const response = await request("/api/auth/password-change/reset", {
      method: "POST",
      token: null,
      body: { verificationId: "OTP-PW-UNVERIFIED", password: "NewPass1!", otpVerified: true },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Please verify the OTP first.");
    expect(users.find((user) => user.id === "ADM-1").password).toBe(adminUser.password);
  });

  test("expired password reset verification is rejected", async () => {
    __testPasswordChangeOtpStore.set("OTP-PW-EXPIRED", {
      userId: "ADM-1",
      email: adminUser.email,
      otp: "123456",
      expiresAt: Date.now() - 1,
      attempts: 0,
      verified: true,
    });

    const response = await request("/api/auth/password-change/reset", {
      method: "POST",
      token: null,
      body: { verificationId: "OTP-PW-EXPIRED", password: "NewPass1!" },
    });

    expect(response.status).toBe(410);
    expect(response.body.message).toBe("This OTP has expired. Please request a new code.");
    expect(users.find((user) => user.id === "ADM-1").password).toBe(adminUser.password);
  });

  test("verified password reset hashes new login password and consumes verification", async () => {
    __testPasswordChangeOtpStore.set("OTP-PW-VERIFIED", {
      userId: "ADM-1",
      email: adminUser.email,
      otp: "123456",
      expiresAt: Date.now() + 60000,
      attempts: 0,
      verified: true,
    });

    const response = await request("/api/auth/password-change/reset", {
      method: "POST",
      token: null,
      body: { verificationId: "OTP-PW-VERIFIED", password: "NewPass1!" },
    });

    expect(response.status).toBe(200);
    const savedPassword = users.find((user) => user.id === "ADM-1").password;
    expect(savedPassword).toMatch(/^scrypt\$/);
    expect(savedPassword).not.toBe("NewPass1!");
    expect(__testPasswordChangeOtpStore.has("OTP-PW-VERIFIED")).toBe(false);
  });

  test.each([
    ["Staff arbitrary user", staffUser, "STF-2", validPayload({ id: "STF-2" })],
    ["Customer arbitrary user", customerUser, "STF-1", validPayload()],
  ])("%s update is rejected", async (_label, actor, targetId, body) => {
    const response = await putUser(targetId, body, actor);

    expect(response.status).toBe(403);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
  });

  test("non-admin self update cannot change role, status, or password through this route", async () => {
    const roleResponse = await putUser("STF-1", { ...staffUser, role: "Senior Detailer" }, staffUser);
    expect(roleResponse.status).toBe(403);

    const statusResponse = await putUser("STF-1", { ...staffUser, status: "deactivated" }, staffUser);
    expect(statusResponse.status).toBe(403);

    const passwordResponse = await putUser("STF-1", { ...staffUser, password: "NewPass1!" }, staffUser);
    expect(passwordResponse.status).toBe(403);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("Sales Associate can update own allowed profile fields and refresh session without role drift", async () => {
    resetData([salesAssociateUser]);
    const response = await request("/api/admin/users/SA-1?refreshSession=1", {
      token: auth(salesAssociateUser),
      body: {
        first: "  Sasha  ",
        last: " Associate ",
        email: "Sasha@Example.com",
        phone: "0917-999-8888",
        auditUser: "spoofed@example.com",
        actor: "Admin",
        actorId: "ADM-1",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toEqual(expect.objectContaining({
      id: "SA-1",
      first: "Sasha",
      last: "Associate",
      name: "Sasha Associate",
      email: "sasha@example.com",
      phone: "09179998888",
      userType: "staff",
      role: "sales associate",
    }));
    expect(users.find((user) => user.id === "SA-1")).toEqual(expect.objectContaining({
      first: "Sasha",
      last: "Associate",
      email: "sasha@example.com",
      phone: "09179998888",
      userType: "Staff",
      role: "Sales Associate",
      status: "active",
    }));
    expect(__testModels.User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.User.findOneAndUpdate.mock.calls[0][1]).toEqual({
      first: "Sasha",
      last: "Associate",
      name: "Sasha Associate",
      email: "sasha@example.com",
      phone: "09179998888",
    });
    expect(successAuditLogs()).toHaveLength(1);
    expect(successAuditLogs()[0]).toEqual(expect.objectContaining({
      userId: "sales@example.com",
      targetId: "SA-1",
      meta: expect.objectContaining({
        actorId: "SA-1",
        actorRole: "sales associate",
        result: "allowed",
      }),
    }));
  });

  test("Junior Detailer can update own allowed profile fields and refresh session without role drift", async () => {
    const response = await request("/api/admin/users/STF-1?refreshSession=1", {
      token: auth(staffUser),
      body: {
        first: "  Jules  ",
        last: " Detailer ",
        email: "Jules.Detailer@Example.com",
        phone: "0918-111-2222",
        auditUser: "admin@example.com",
        actor: "Admin",
        role: "Admin",
        userType: "Admin",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Profile updates cannot change protected account fields.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();

    const allowedResponse = await request("/api/admin/users/STF-1?refreshSession=1", {
      token: auth(staffUser),
      body: {
        first: "  Jules  ",
        last: " Detailer ",
        email: "Jules.Detailer@Example.com",
        phone: "0918-111-2222",
        auditUser: "admin@example.com",
        actor: "Admin",
      },
    });

    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.body.token).toEqual(expect.any(String));
    expect(allowedResponse.body.user).toEqual(expect.objectContaining({
      id: "STF-1",
      first: "Jules",
      last: "Detailer",
      name: "Jules Detailer",
      email: "jules.detailer@example.com",
      phone: "09181112222",
      userType: "staff",
      role: "junior detailer",
    }));
    expect(__testModels.User.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(__testModels.User.findOneAndUpdate.mock.calls[0][1]).toEqual({
      first: "Jules",
      last: "Detailer",
      name: "Jules Detailer",
      email: "jules.detailer@example.com",
      phone: "09181112222",
    });
    expect(successAuditLogs()[0]).toEqual(expect.objectContaining({
      userId: "casey.staff@example.com",
      targetId: "STF-1",
      meta: expect.objectContaining({
        actorId: "STF-1",
        actorRole: "junior detailer",
        result: "allowed",
      }),
    }));
  });

  test.each([
    ["blank first name", { first: "   " }, 400, "First name is required."],
    ["whitespace-only last name", { last: "   " }, 400, "Last name is required."],
    ["malformed email", { email: "sales@" }, 400, "Please enter a valid email address."],
    ["blank phone", { phone: "   " }, 400, "Contact number is required."],
    ["duplicate email", { email: "other.staff@example.com" }, 409, "That email is already registered."],
    ["duplicate phone", { phone: "09999999999" }, 409, "That contact number is already registered."],
  ])("Sales Associate profile rejects %s before mutation", async (_label, override, status, message) => {
    resetData([salesAssociateUser]);
    const response = await request("/api/admin/users/SA-1?refreshSession=1", {
      token: auth(salesAssociateUser),
      body: {
        first: "Sales",
        last: "Associate",
        email: "sales@example.com",
        phone: "09170000001",
        ...override,
      },
    });

    expect(response.status).toBe(status);
    expect(response.body.message).toBe(message);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(successAuditLogs()).toHaveLength(0);
    expect(users.find((user) => user.id === "SA-1")).toEqual(expect.objectContaining({
      first: "Sales",
      last: "Associate",
      role: "Sales Associate",
      status: "active",
    }));
  });

  test.each([
    ["role escalation", { role: "Admin", userType: "Admin", employeeRole: "General Manager" }, "Profile updates cannot change protected account fields."],
    ["status change", { status: "deactivated", isActive: false }, "Profile updates cannot change protected account fields."],
    ["password injection", { password: "NewPass1!" }, "Profile updates cannot change protected account fields."],
    ["hash injection", { passwordHash: "forged-hash", isAdmin: true }, "Profile updates cannot change protected account fields."],
    ["security settings injection", { securitySettings: { staffSpecialPinHash: "forged" } }, "Profile updates cannot change protected account fields."],
  ])("Sales Associate profile rejects crafted %s payload", async (_label, protectedPayload, message) => {
    resetData([salesAssociateUser]);
    const response = await request("/api/admin/users/SA-1?refreshSession=1", {
      token: auth(salesAssociateUser),
      body: {
        first: "Sasha",
        last: "Associate",
        email: "sasha@example.com",
        phone: "09179998888",
        ...protectedPayload,
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(message);
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(users.find((user) => user.id === "SA-1")).toEqual(expect.objectContaining({
      role: "Sales Associate",
      userType: "Staff",
      status: "active",
      password: "sales-hash",
    }));
  });

  test.each([
    ["another Staff account", "STF-2"],
    ["Admin account", "ADM-1"],
  ])("Sales Associate cannot update %s by changing the route id", async (_label, targetId) => {
    resetData([salesAssociateUser]);
    const response = await request(`/api/admin/users/${targetId}?refreshSession=1`, {
      token: auth(salesAssociateUser),
      body: {
        first: "Sasha",
        last: "Associate",
        email: "sasha@example.com",
        phone: "09179998888",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You can only update your own profile.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("duplicate-key race returns a safe conflict without success audit", async () => {
    duplicateRaceField = "email";
    const response = await putUser("STF-1", validPayload({ email: "race@example.com" }));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("That email is already registered.");
    expect(successAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["name", { name: "Deleted Rename" }],
    ["email", { email: "deleted.rename@example.com" }],
    ["phone", { phone: "09777777777" }],
    ["role", { role: "Marketing" }],
    ["password", { password: "NewPass1!" }],
    ["module access", { moduleAccess: ["module.userManagement"] }],
    ["status active", { status: "active" }],
    ["status deactivated", { status: "deactivated" }],
  ])("deleted user %s update is terminally rejected", async (_label, override) => {
    users = users.map((user) => user.id === "STF-1" ? { ...user, status: "deleted", deletedAt: "2026-08-02T00:00:00.000Z" } : user);

    const response = await putUser("STF-1", validPayload(override));

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Deleted accounts cannot be edited.");
    expect(__testModels.User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(users.find((user) => user.id === "STF-1")).toEqual(expect.objectContaining({
      status: "deleted",
      name: "Casey Staff",
      email: "casey.staff@example.com",
      phone: "09123456789",
      role: "Junior Detailer",
      password: "existing-hash",
    }));
    expect(successAuditLogs()).toHaveLength(0);
  });
});

describe("Delete User route terminal-state validation", () => {
  test("correct Admin Special Password soft deletes exactly one user and returns a safe DTO", async () => {
    const response = await deleteUser("STF-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: "STF-1",
      status: "deleted",
      deletionMode: "soft",
    }));
    expect(response.body).not.toHaveProperty("password");
    expect(users.filter((user) => user.id === "STF-1")).toHaveLength(1);
    expect(users.find((user) => user.id === "STF-1")).toEqual(expect.objectContaining({
      id: "STF-1",
      status: "deleted",
      deletionMode: "soft",
      deletedBy: adminUser.email,
    }));
    expect(deleteSuccessAuditLogs()).toHaveLength(1);
    expect(deleteSuccessAuditLogs()[0].userId).toBe(adminUser.email);
  });

  test("incorrect Admin Special Password rejects deletion without mutation or success audit", async () => {
    const response = await deleteUser("STF-1", { specialPassword: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect admin special password.");
    expect(users.find((user) => user.id === "STF-1").status).toBe("active");
    expect(deleteSuccessAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["missing password", {}],
    ["blank password", { specialPassword: "   " }],
  ])("%s rejects deletion without mutation or success audit", async (_label, body) => {
    const response = await deleteUser("STF-1", body);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Special password is required.");
    expect(users.find((user) => user.id === "STF-1").status).toBe("active");
    expect(deleteSuccessAuditLogs()).toHaveLength(0);
  });

  test.each([
    ["Staff", staffUser],
    ["Customer", customerUser],
  ])("unauthorized %s cannot delete arbitrary users", async (_label, actor) => {
    const response = await deleteUser("STF-2", { specialPassword: "AdminSpecial1!" }, actor);

    expect(response.status).toBe(403);
    expect(users.find((user) => user.id === "STF-2").status).toBe("active");
    expect(deleteSuccessAuditLogs()).toHaveLength(0);
  });

  test("missing user returns 404 without audit", async () => {
    const response = await deleteUser("STF-MISSING");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User not found.");
    expect(auditLogs).toHaveLength(0);
  });

  test("repeated deletion is safely rejected without another success audit", async () => {
    users = users.map((user) => user.id === "STF-1" ? { ...user, status: "deleted", deletedAt: "2026-08-02T00:00:00.000Z" } : user);

    const response = await deleteUser("STF-1");

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Deleted accounts cannot be edited.");
    expect(users.find((user) => user.id === "STF-1").status).toBe("deleted");
    expect(deleteSuccessAuditLogs()).toHaveLength(0);
  });

  test("active and deactivated status transitions remain allowed through Edit User", async () => {
    const deactivate = await putUser("STF-1", validPayload({ status: "deactivated" }));
    expect(deactivate.status).toBe(200);
    expect(users.find((user) => user.id === "STF-1").status).toBe("deactivated");

    const activate = await putUser("STF-1", validPayload({ status: "active" }));
    expect(activate.status).toBe(200);
    expect(users.find((user) => user.id === "STF-1").status).toBe("active");
  });

  test("final active Admin delete protection remains enforced", async () => {
    resetData([]);
    const response = await deleteUser("ADM-1", { specialPassword: "AdminSpecial1!" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admins cannot delete or deactivate their own account here.");
    expect(users.find((user) => user.id === "ADM-1").status).toBe("active");
    expect(deleteSuccessAuditLogs()).toHaveLength(0);
  });
});
