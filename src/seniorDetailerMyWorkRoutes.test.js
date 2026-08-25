/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

const seniorA = { id: "SR-A", email: "senior-a-new@example.com", name: "Renamed Senior A", userType: "Staff", role: "Senior Detailer", status: "active" };
const seniorB = { id: "SR-B", email: "senior-b@example.com", name: "Senior B", userType: "Staff", role: "Senior Detailer", status: "active" };
const juniorA = { id: "JR-A", email: "junior-a@example.com", name: "Junior A", userType: "Staff", role: "Junior Detailer", status: "active" };
const juniorB = { id: "JR-B", email: "junior-b@example.com", name: "Junior B", userType: "Staff", role: "Junior Detailer", status: "active" };
const salesAssociate = { id: "SA-1", email: "sales@example.com", name: "Sales", userType: "Staff", role: "Sales Associate", status: "active" };
const legacySenior = { id: "SR-LEG", email: "legacy@example.com", name: "Legacy Senior", userType: "Staff", role: "Senior Detailer", status: "active" };
const duplicateOne = { id: "SR-DUP-1", email: "dup1@example.com", name: "Duplicate Detailer", userType: "Staff", role: "Senior Detailer", status: "active" };
const duplicateTwo = { id: "SR-DUP-2", email: "dup2@example.com", name: "Duplicate Detailer", userType: "Staff", role: "Senior Detailer", status: "active" };

let users;
let bookings;
let commissions;
let auditLogs;
const originals = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  return {
    lean: async () => (value ? clone(value) : null),
  };
}

function chain(value) {
  return {
    sort() {
      return this;
    },
    lean: async () => clone(value),
  };
}

function stub(model, method, implementation) {
  originals.push([model, method, model[method]]);
  model[method] = implementation;
}

function findUser(query = {}) {
  if (query.id) return users.find((user) => user.id === query.id);
  if (query.email) return users.find((user) => user.email === query.email);
  return null;
}

function auth(user) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { token = auth(seniorA), method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = token ? { authorization: token } : {};
    req.body = {};
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
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString("utf8");
      const contentType = String(res.getHeader("content-type") || "");
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: contentType.includes("application/json") && text ? JSON.parse(text) : text,
        rawBody: buffer,
      });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function resetData() {
  users = [seniorA, seniorB, juniorA, juniorB, salesAssociate, legacySenior, duplicateOne, duplicateTwo];
  bookings = [
    {
      id: "B-SR-A",
      customer: "Senior Customer",
      service: "Ceramic Coating",
      vehicle: "Civic",
      plate: "AAA111",
      assigned: "Old Senior A",
      assignedDetailerId: "SR-A",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
      status: "In Progress",
      issueNote: "Fresh issue note",
      warrantyChecklist: "Fresh warranty note",
      warrantyReleased: true,
    },
    {
      id: "B-SR-B",
      customer: "Other Senior Customer",
      service: "Paint Protection",
      vehicle: "Accord",
      plate: "BBB222",
      assigned: "Senior B",
      assignedDetailerId: "SR-B",
      date: "2099-12-31",
      status: "Scheduled",
    },
    {
      id: "B-JR-A",
      customer: "Junior Customer",
      service: "Interior Detail",
      vehicle: "City",
      plate: "JRA123",
      assigned: "Junior A",
      assignedDetailerId: "JR-A",
      date: "2099-12-30",
      status: "Scheduled",
    },
  ];
  commissions = [
    { id: "COM-SR-A", bookingId: "B-SR-A", employeeId: "SR-A", worker: "Old Senior A", service: "Ceramic Coating", rate: 5, earned: 100, status: "Paid", datePaid: "2100-01-01", paidBy: "admin@example.com" },
    { id: "COM-JR-A", bookingId: "B-JR-A", employeeId: "JR-A", worker: "Junior A", service: "Interior Detail", rate: 5, earned: 50, status: "Earned" },
    { id: "COM-SR-B", bookingId: "B-SR-B", employeeId: "SR-B", worker: "Senior B", service: "Paint Protection", rate: 5, earned: 75, status: "Earned" },
  ];
  auditLogs = [];
}

beforeAll(() => {
  stub(__testModels.User, "findOne", (query = {}) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain(users));
  stub(__testModels.Booking, "find", () => chain(bookings));
  stub(__testModels.Commission, "find", () => chain(commissions));
  stub(__testModels.AuditLog, "create", async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
});

beforeEach(() => {
  resetData();
});

afterAll(() => {
  originals.reverse().forEach(([model, method, original]) => {
    model[method] = original;
  });
  consoleErrorSpy.mockRestore();
});

describe("Senior Detailer authoritative My Work endpoint", () => {
  test("uses authenticated stable identity and ignores forged query identity", async () => {
    const response = await request("/api/admin/my-work?employeeId=SR-B&email=senior-b@example.com&role=Admin&auditUser=admin@example.com");

    expect(response.status).toBe(200);
    expect(response.body.assignedWork.map((item) => item.id)).toEqual(["B-SR-A"]);
    expect(response.body.assignedWork[0]).toMatchObject({
      assigned: "Renamed Senior A",
      assignedDetailerId: "SR-A",
      issueNote: "Fresh issue note",
      warrantyReleased: true,
      commissionStatus: "Paid",
    });
    expect(JSON.stringify(response.body)).not.toContain("Other Senior Customer");
  });

  test("shows Junior Detailer operational work without junior private commissions", async () => {
    const response = await request("/api/admin/my-work");

    expect(response.status).toBe(200);
    expect(response.body.juniorDetailerWork).toEqual([
      expect.objectContaining({
        id: "B-JR-A",
        assigned: "Junior A",
        assignedDetailerId: "JR-A",
        commissionStatus: "N/A",
      }),
    ]);
    expect(response.body.commissionAudit.map((item) => item.id)).toEqual(["COM-SR-A"]);
    expect(JSON.stringify(response.body.commissionAudit)).not.toContain("COM-JR-A");
    expect(JSON.stringify(response.body)).not.toContain("\"earned\":50");
  });

  test("reflects canonical assignment, status, issue, warranty, and commission changes on refetch", async () => {
    bookings[0].assignedDetailerId = "SR-B";
    bookings[0].assigned = "Senior B";
    bookings[0].status = "Completed";
    bookings[0].issueNote = "Updated issue note";
    bookings[0].warrantyChecklist = "Updated warranty checklist";
    commissions[0].status = "Paid";
    commissions[0].datePaid = "2100-02-01";

    const seniorAResponse = await request("/api/admin/my-work", { token: auth(seniorA) });
    const seniorBResponse = await request("/api/admin/my-work", { token: auth(seniorB) });

    expect(seniorAResponse.status).toBe(200);
    expect(seniorAResponse.body.assignedWork.map((item) => item.id)).toEqual([]);
    expect(seniorBResponse.body.assignedWork).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "B-SR-A",
        status: "Completed",
        issueNote: "Updated issue note",
        warrantyChecklist: "Updated warranty checklist",
      }),
    ]));
  });

  test("Junior Detailer My Work remains scoped to authenticated stable assignment after profile rename", async () => {
    users = users.map((user) => user.id === "JR-A" ? { ...user, name: "Renamed Junior A", email: "junior-a-new@example.com" } : user);
    bookings = [
      {
        id: "B-JR-A",
        customer: "Junior A Customer",
        service: "Interior Detail",
        vehicle: "City",
        plate: "JRA123",
        assigned: "Old Junior A",
        assignedDetailerId: "JR-A",
        date: "2099-12-30",
        status: "Scheduled",
      },
      {
        id: "B-JR-B",
        customer: "Junior B Customer",
        service: "Ceramic Coating",
        vehicle: "Vios",
        plate: "JRB123",
        assigned: "Junior B",
        assignedDetailerId: "JR-B",
        date: "2099-12-31",
        status: "Scheduled",
      },
    ];

    const response = await request("/api/admin/my-work?employeeId=JR-B&role=Admin", { token: auth({ ...juniorA, email: "junior-a-new@example.com" }) });

    expect(response.status).toBe(200);
    expect(response.body.assignedWork.map((item) => item.id)).toEqual(["B-JR-A"]);
    expect(response.body.assignedWork[0]).toMatchObject({
      assignedDetailerId: "JR-A",
      assigned: "Renamed Junior A",
    });
    expect(JSON.stringify(response.body)).not.toContain("Junior B Customer");
  });

  test("Junior Detailer My Work and Commission Audit are own stable-ID only", async () => {
    bookings = [
      {
        id: "B-JR-A",
        customer: "Junior A Customer",
        service: "Interior Detail",
        vehicle: "City",
        assigned: "Junior A",
        assignedDetailerId: "JR-A",
        date: "2099-12-30",
        status: "Completed",
        issueNote: "Junior A note",
        warrantyReleased: true,
      },
      {
        id: "B-JR-B",
        customer: "Junior B Customer",
        service: "Ceramic Coating",
        vehicle: "Vios",
        assigned: "Junior B",
        assignedDetailerId: "JR-B",
        date: "2099-12-31",
        status: "Scheduled",
      },
      {
        id: "B-SR-A",
        customer: "Senior Customer",
        service: "Paint Protection",
        assigned: "Senior A",
        assignedDetailerId: "SR-A",
        date: "2099-12-29",
        status: "Scheduled",
      },
      {
        id: "B-UNASSIGNED",
        customer: "Unassigned Customer",
        service: "Glass Polish",
        assigned: "",
        date: "2099-12-28",
        status: "Scheduled",
      },
    ];
    commissions = [
      { id: "COM-JR-A", bookingId: "B-JR-A", employeeId: "JR-A", worker: "Junior A", service: "Interior Detail", rate: 5, earned: 50, status: "Paid", datePaid: "2100-01-01", paidBy: "finance@example.com", remarks: "Own payout" },
      { id: "COM-JR-B", bookingId: "B-JR-B", employeeId: "JR-B", worker: "Junior B", service: "Ceramic Coating", rate: 5, earned: 80, status: "Earned" },
      { id: "COM-SR-A", bookingId: "B-SR-A", employeeId: "SR-A", worker: "Senior A", service: "Paint Protection", rate: 5, earned: 120, status: "Paid" },
    ];

    const response = await request("/api/admin/my-work?employeeId=JR-B&userId=JR-B&email=junior-b@example.com&role=Admin", {
      token: auth(juniorA),
    });

    expect(response.status).toBe(200);
    expect(response.body.assignedWork.map((item) => item.id)).toEqual(["B-JR-A"]);
    expect(response.body.assignedWork[0]).toMatchObject({
      customer: "Junior A Customer",
      status: "Completed",
      issueNote: "Junior A note",
      warrantyReleased: true,
      commissionStatus: "Paid",
    });
    expect(response.body.juniorDetailerWork).toEqual([]);
    expect(response.body.includeJuniorDetailerWorkView).toBe(false);
    expect(response.body.commissionAudit).toEqual([
      expect.objectContaining({
        id: "COM-JR-A",
        bookingId: "B-JR-A",
        status: "Paid",
        paidBy: "finance@example.com",
        remarks: "Own payout",
      }),
    ]);
    expect(response.body.commissionAudit[0]).not.toHaveProperty("employeeId");
    expect(JSON.stringify(response.body)).not.toContain("Junior B Customer");
    expect(JSON.stringify(response.body)).not.toContain("Senior Customer");
    expect(JSON.stringify(response.body)).not.toContain("Unassigned Customer");
    expect(JSON.stringify(response.body)).not.toContain("COM-JR-B");
    expect(JSON.stringify(response.body)).not.toContain("COM-SR-A");
    expect(JSON.stringify(response.body)).not.toContain("\"earned\":80");
    expect(JSON.stringify(response.body)).not.toContain("\"earned\":120");
  });

  test("Junior Detailer commission ownership survives profile rename through Commission.employeeId", async () => {
    users = users.map((user) => user.id === "JR-A" ? { ...user, name: "Renamed Junior A", email: "junior-a-new@example.com" } : user);
    commissions = [
      { id: "COM-JR-A", bookingId: "B-JR-A", employeeId: "JR-A", worker: "Old Junior A", service: "Interior Detail", rate: 5, earned: 50, status: "Earned" },
      { id: "COM-JR-B", bookingId: "B-JR-B", employeeId: "JR-B", worker: "Junior B", service: "Ceramic Coating", rate: 5, earned: 80, status: "Earned" },
    ];

    const response = await request("/api/admin/my-work?employeeId=JR-B&email=junior-b@example.com", {
      token: auth({ ...juniorA, email: "junior-a-new@example.com" }),
    });

    expect(response.status).toBe(200);
    expect(response.body.commissionAudit.map((item) => item.id)).toEqual(["COM-JR-A"]);
    expect(JSON.stringify(response.body.commissionAudit)).not.toContain("COM-JR-B");
  });

  test("supports unique legacy assignment and excludes ambiguous legacy assignment", async () => {
    bookings = [
      { id: "B-LEGACY", customer: "Legacy Customer", assigned: "Legacy Senior", service: "Coating", status: "Scheduled" },
      { id: "B-AMBIG", customer: "Ambiguous Customer", assigned: "Duplicate Detailer", service: "Coating", status: "Scheduled" },
    ];

    const legacyResponse = await request("/api/admin/my-work", { token: auth(legacySenior) });
    const duplicateResponse = await request("/api/admin/my-work", { token: auth(duplicateOne) });

    expect(legacyResponse.status).toBe(200);
    expect(legacyResponse.body.assignedWork.map((item) => item.id)).toEqual(["B-LEGACY"]);
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body.assignedWork).toEqual([]);
  });

  test("supports unique legacy commission worker and excludes ambiguous legacy worker", async () => {
    commissions = [
      { id: "COM-LEGACY", bookingId: "B-LEGACY", worker: "Legacy Senior", service: "Coating", rate: 5, earned: 40, status: "Earned" },
      { id: "COM-AMBIG", bookingId: "B-AMBIG", worker: "Duplicate Detailer", service: "Coating", rate: 5, earned: 60, status: "Earned" },
    ];

    const legacyResponse = await request("/api/admin/my-work", { token: auth(legacySenior) });
    const duplicateResponse = await request("/api/admin/my-work", { token: auth(duplicateOne) });

    expect(legacyResponse.status).toBe(200);
    expect(legacyResponse.body.commissionAudit.map((item) => item.id)).toEqual(["COM-LEGACY"]);
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body.commissionAudit).toEqual([]);
  });

  test("denies roles without My Work authorization", async () => {
    const response = await request("/api/admin/my-work", { token: auth(salesAssociate) });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to view My Work.");
  });

  test("My Work PDF export uses the same authenticated resolver", async () => {
    const response = await request("/api/admin/reports/my-work/pdf?employeeId=SR-B&email=senior-b@example.com");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.rawBody.length).toBeGreaterThan(100);
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "senior-a-new@example.com",
        action: "Report exported",
        targetId: "my-work",
      }),
    ]));
  });

  test("My Work report content includes own payment details without leaking junior or other senior commissions", async () => {
    const response = await request("/api/admin/reports/my-work/csv?employeeId=SR-B&email=senior-b@example.com");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/csv");
    expect(response.body).toContain("Commission Audit");
    expect(response.body).toContain("COM-SR-A");
    expect(response.body).toContain("admin@example.com");
    expect(response.body).toContain("Junior Detailer Work View");
    expect(response.body).toContain("B-JR-A");
    expect(response.body).toContain("N/A");
    expect(response.body).not.toContain("COM-JR-A");
    expect(response.body).not.toContain("COM-SR-B");
    expect(response.body).not.toContain("Other Senior Customer");
    expect(response.body).not.toContain("P50");
    expect(response.body).not.toContain("P75");
  });

  test("Junior My Work report excludes Senior-only Junior Work View and ignores forged PDF identity", async () => {
    bookings = [
      { id: "B-JR-A", customer: "Junior A Customer", service: "Interior Detail", vehicle: "City", plate: "JRA123", assigned: "Junior A", assignedDetailerId: "JR-A", date: "2099-12-30", status: "Completed", issueNote: "Own issue note", warrantyReleased: true },
      { id: "B-JR-B", customer: "Junior B Customer", service: "Ceramic Coating", vehicle: "Vios", plate: "JRB123", assigned: "Junior B", assignedDetailerId: "JR-B", date: "2099-12-31", status: "Scheduled" },
      { id: "B-SR-A", customer: "Senior Customer", service: "Paint Protection", assigned: "Senior A", assignedDetailerId: "SR-A", date: "2099-12-29", status: "Scheduled" },
    ];
    commissions = [
      { id: "COM-JR-A", bookingId: "B-JR-A", employeeId: "JR-A", worker: "Junior A", service: "Interior Detail", rate: 5, earned: 50, status: "Paid", datePaid: "2100-01-01", paidBy: "finance@example.com", remarks: "Own payout" },
      { id: "COM-JR-B", bookingId: "B-JR-B", employeeId: "JR-B", worker: "Junior B", service: "Ceramic Coating", rate: 5, earned: 80, status: "Earned" },
      { id: "COM-SR-A", bookingId: "B-SR-A", employeeId: "SR-A", worker: "Senior A", service: "Paint Protection", rate: 5, earned: 120, status: "Paid" },
    ];

    const forgedQuery = "employeeId=JR-B&userId=JR-B&email=junior-b@example.com&role=Senior%20Detailer";
    const csvResponse = await request(`/api/admin/reports/my-work/csv?${forgedQuery}`, { token: auth(juniorA) });
    const pdfResponse = await request(`/api/admin/reports/my-work/pdf?${forgedQuery}`, { token: auth(juniorA) });

    expect(csvResponse.status).toBe(200);
    expect(String(csvResponse.headers["content-type"])).toContain("text/csv");
    expect(csvResponse.body).toContain("Assigned Work");
    expect(csvResponse.body).toContain("B-JR-A");
    expect(csvResponse.body).toContain("COM-JR-A");
    expect(csvResponse.body).toContain("finance@example.com");
    expect(csvResponse.body).toContain("Own payout");
    expect(csvResponse.body).not.toContain("Junior Detailer Work View");
    expect(csvResponse.body).not.toContain("B-JR-B");
    expect(csvResponse.body).not.toContain("B-SR-A");
    expect(csvResponse.body).not.toContain("COM-JR-B");
    expect(csvResponse.body).not.toContain("COM-SR-A");
    expect(csvResponse.body).not.toContain("P80");
    expect(csvResponse.body).not.toContain("P120");
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers["content-type"]).toBe("application/pdf");
    expect(pdfResponse.rawBody.length).toBeGreaterThan(100);
  });
});
