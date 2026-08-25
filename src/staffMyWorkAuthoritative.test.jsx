import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StaffMyWork from "./screens/staff/StaffMyWork";
import { apiRequest } from "./services/api";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "./utils/downloadExport";

jest.mock("./services/api", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("./utils/downloadExport", () => ({
  buildReportDownloadPath: jest.fn((reportType, format) => `/api/admin/reports/${reportType}/${format}`),
  downloadAuthenticatedFile: jest.fn(),
}));

const seniorSession = {
  id: "SR-A",
  email: "senior@example.com",
  name: "Senior Detailer",
  userType: "Staff",
  role: "Senior Detailer",
};

const juniorSession = {
  id: "JR-A",
  email: "junior@example.com",
  name: "Junior Detailer",
  userType: "Staff",
  role: "Junior Detailer",
};

const assignedWork = {
  id: "B-SENIOR",
  customer: "Senior Customer",
  service: "Ceramic Coating",
  vehicle: "Civic",
  plate: "AAA111",
  assigned: "Renamed Senior",
  date: "2099-12-31",
  time: "10:00",
  placeSlot: 1,
  status: "Scheduled",
  issueNote: "Initial issue note",
  warrantyReleased: false,
  commissionStatus: "Earned",
};

const juniorWork = {
  id: "B-JUNIOR",
  customer: "Junior Customer",
  service: "Interior Detail",
  vehicle: "City",
  plate: "JRA123",
  assigned: "Junior Detailer",
  date: "2099-12-30",
  status: "Scheduled",
  commissionStatus: "N/A",
};

function dto(patch = {}) {
  return {
    assignedWork: [assignedWork],
    juniorDetailerWork: [juniorWork],
    commissionAudit: [
      { id: "COM-SENIOR", bookingId: "B-SENIOR", service: "Ceramic Coating", rate: 5, earned: 100, status: "Earned", datePaid: "" },
    ],
    ...patch,
  };
}

function makeAssigned(index, patch = {}) {
  return {
    ...assignedWork,
    id: `B-A-${String(index).padStart(2, "0")}`,
    customer: `Assigned Customer ${index}`,
    service: index % 2 ? "Ceramic Coating" : "Interior Detail",
    vehicle: `Vehicle ${index}`,
    plate: `PLT${index}`,
    status: "Scheduled",
    commissionStatus: index % 2 ? "Earned" : "Paid",
    date: `2099-12-${String(Math.min(index, 28)).padStart(2, "0")}`,
    ...patch,
  };
}

function makeJunior(index, patch = {}) {
  return {
    ...juniorWork,
    id: `B-J-${String(index).padStart(2, "0")}`,
    customer: `Junior Customer ${index}`,
    service: index % 2 ? "Interior Detail" : "Paint Protection",
    assigned: index % 2 ? "Junior A" : "Junior B",
    status: index % 3 === 0 ? "Completed" : "Scheduled",
    commissionStatus: "N/A",
    date: `2099-11-${String(Math.min(index, 28)).padStart(2, "0")}`,
    ...patch,
  };
}

function makeCommission(index, patch = {}) {
  return {
    id: `COM-${String(index).padStart(2, "0")}`,
    bookingId: `B-A-${String(index).padStart(2, "0")}`,
    date: `2099-10-${String(Math.min(index, 28)).padStart(2, "0")}`,
    service: index % 2 ? "Ceramic Coating" : "Interior Detail",
    rate: 5,
    earned: index * 10,
    status: index % 2 ? "Earned" : "Paid",
    datePaid: index % 2 ? "" : `2100-01-${String(index).padStart(2, "0")}`,
    paidBy: index % 2 ? "" : "finance@example.com",
    remarks: index % 2 ? "" : "Paid by payroll",
    ...patch,
  };
}

function getSection(name) {
  return screen.getByRole("heading", { name }).closest("section");
}

async function renderLoaded(data = dto()) {
  apiRequest.mockResolvedValue(data);
  render(<StaffMyWork session={seniorSession} />);
  await screen.findByRole("heading", { name: "Assigned Work" });
}

function expectInSection(section, text) {
  expect(within(section).getByText(text)).toBeInTheDocument();
}

function expectNotInSection(section, text) {
  expect(within(section).queryByText(text)).not.toBeInTheDocument();
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue(dto());
  buildReportDownloadPath.mockClear();
  buildReportDownloadPath.mockImplementation((reportType, format) => `/api/admin/reports/${reportType}/${format}`);
  downloadAuthenticatedFile.mockReset();
  downloadAuthenticatedFile.mockResolvedValue(undefined);
});

test("loads My Work from the authoritative endpoint and does not fabricate junior commission Pending", async () => {
  render(<StaffMyWork session={seniorSession} />);

  expect((await screen.findAllByText("B-SENIOR")).length).toBeGreaterThan(0);
  expect(screen.getByText("B-JUNIOR")).toBeInTheDocument();
  const juniorRow = screen.getByText("B-JUNIOR").closest("tr");
  expect(within(juniorRow).getByText("N/A")).toBeInTheDocument();
  expect(screen.getByText("COM-SENIOR")).toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledWith("/api/admin/my-work");
});

test("searches assigned work by booking ID, customer, and service only with trimmed partial case-insensitive matching", async () => {
  await renderLoaded(dto({
    assignedWork: [
      makeAssigned(1, { id: "B-ALPHA", customer: "Juan Dela Cruz", service: "Ceramic Coating", vehicle: "Needle Vehicle", plate: "CARONLY" }),
      makeAssigned(2, { id: "B-BETA", customer: "Maria Santos", service: "Glass Polish", vehicle: "Sedan", plate: "PLATEONLY" }),
    ],
    juniorDetailerWork: [],
    commissionAudit: [],
  }));
  const assignedSection = getSection("Assigned Work");
  const search = within(assignedSection).getByPlaceholderText("Search booking ID, customer, service...");

  fireEvent.change(search, { target: { value: "  alpha " } });
  expectInSection(assignedSection, "B-ALPHA");
  expectNotInSection(assignedSection, "B-BETA");

  fireEvent.change(search, { target: { value: "juan" } });
  expectInSection(assignedSection, "B-ALPHA");
  expectNotInSection(assignedSection, "B-BETA");

  fireEvent.change(search, { target: { value: "GLASS" } });
  expectInSection(assignedSection, "B-BETA");
  expectNotInSection(assignedSection, "B-ALPHA");

  fireEvent.change(search, { target: { value: "Needle" } });
  expectInSection(assignedSection, "No assigned work found.");
  expectNotInSection(assignedSection, "B-ALPHA");

  fireEvent.change(search, { target: { value: "   " } });
  expectInSection(assignedSection, "B-ALPHA");
  expectInSection(assignedSection, "B-BETA");
});

test("combines status, commission, completed-only, and date filters with normalized comparisons", async () => {
  await renderLoaded(dto({
    assignedWork: [
      makeAssigned(1, { id: "B-MATCH", customer: "Juan", service: "Ceramic Coating", status: " completed ", commissionStatus: "Paid", date: "2026-08-10" }),
      makeAssigned(2, { id: "B-WRONG-COM", customer: "Juan", service: "Ceramic Coating", status: "Completed", commissionStatus: "Earned", date: "2026-08-11" }),
      makeAssigned(3, { id: "B-WRONG-STATUS", customer: "Juan", service: "Ceramic Coating", status: "Scheduled", commissionStatus: "Paid", date: "2026-08-12" }),
      makeAssigned(4, { id: "B-WRONG-DATE", customer: "Juan", service: "Ceramic Coating", status: "Completed", commissionStatus: "Paid", date: "2026-09-01" }),
    ],
    juniorDetailerWork: [],
    commissionAudit: [],
  }));
  const assignedSection = getSection("Assigned Work");

  fireEvent.change(within(assignedSection).getByPlaceholderText("Search booking ID, customer, service..."), { target: { value: "Juan" } });
  fireEvent.change(within(assignedSection).getByDisplayValue("All statuses"), { target: { value: "Completed" } });
  fireEvent.change(within(assignedSection).getByDisplayValue("All commissions"), { target: { value: "Paid" } });
  fireEvent.click(within(assignedSection).getByLabelText("Completed only"));
  fireEvent.change(within(assignedSection).getByLabelText("Start Date"), { target: { value: "2026-08-01" } });
  fireEvent.change(within(assignedSection).getByLabelText("End Date"), { target: { value: "2026-08-31" } });

  expectInSection(assignedSection, "B-MATCH");
  expectNotInSection(assignedSection, "B-WRONG-COM");
  expectNotInSection(assignedSection, "B-WRONG-STATUS");
  expectNotInSection(assignedSection, "B-WRONG-DATE");

  fireEvent.change(within(assignedSection).getByDisplayValue("Completed"), { target: { value: "" } });
  expectInSection(assignedSection, "B-MATCH");
});

test("date filtering supports start-only, end-only, inclusive ranges, same-day ranges, invalid ranges, and clearing", async () => {
  await renderLoaded(dto({
    assignedWork: [
      makeAssigned(1, { id: "B-DATE-05", date: "2026-08-05" }),
      makeAssigned(2, { id: "B-DATE-10", date: "2026-08-10" }),
      makeAssigned(3, { id: "B-DATE-20", date: "2026-08-20" }),
    ],
    juniorDetailerWork: [],
    commissionAudit: [],
  }));
  const assignedSection = getSection("Assigned Work");
  const start = within(assignedSection).getByLabelText("Start Date");
  const end = within(assignedSection).getByLabelText("End Date");

  fireEvent.change(start, { target: { value: "2026-08-10" } });
  expectNotInSection(assignedSection, "B-DATE-05");
  expectInSection(assignedSection, "B-DATE-10");
  expectInSection(assignedSection, "B-DATE-20");

  fireEvent.change(start, { target: { value: "" } });
  fireEvent.change(end, { target: { value: "2026-08-10" } });
  expectInSection(assignedSection, "B-DATE-05");
  expectInSection(assignedSection, "B-DATE-10");
  expectNotInSection(assignedSection, "B-DATE-20");

  fireEvent.change(start, { target: { value: "2026-08-10" } });
  fireEvent.change(end, { target: { value: "2026-08-20" } });
  expectNotInSection(assignedSection, "B-DATE-05");
  expectInSection(assignedSection, "B-DATE-10");
  expectInSection(assignedSection, "B-DATE-20");

  fireEvent.change(end, { target: { value: "2026-08-10" } });
  expectInSection(assignedSection, "B-DATE-10");
  expectNotInSection(assignedSection, "B-DATE-20");

  fireEvent.change(start, { target: { value: "2026-08-20" } });
  fireEvent.change(end, { target: { value: "2026-08-10" } });
  expectInSection(assignedSection, "End Date cannot be earlier than Start Date.");
  expectInSection(assignedSection, "No assigned work found.");
  expectNotInSection(assignedSection, "B-DATE-05");
  expectNotInSection(assignedSection, "B-DATE-10");
  expectNotInSection(assignedSection, "B-DATE-20");

  fireEvent.change(start, { target: { value: "" } });
  fireEvent.change(end, { target: { value: "" } });
  expectNotInSection(assignedSection, "End Date cannot be earlier than Start Date.");
  expectInSection(assignedSection, "B-DATE-05");
  expectInSection(assignedSection, "B-DATE-20");
});

test("assigned work pagination resets on filters and clamps when refreshed data shrinks", async () => {
  apiRequest
    .mockResolvedValueOnce(dto({
      assignedWork: Array.from({ length: 12 }, (_, index) => makeAssigned(index + 1)),
      juniorDetailerWork: [],
      commissionAudit: [],
    }))
    .mockResolvedValueOnce(dto({
      assignedWork: [makeAssigned(1)],
      juniorDetailerWork: [],
      commissionAudit: [],
    }));

  render(<StaffMyWork session={seniorSession} />);
  const assignedSection = await screen.findByRole("heading", { name: "Assigned Work" }).then((heading) => heading.closest("section"));

  expectInSection(assignedSection, "B-A-01");
  expectNotInSection(assignedSection, "B-A-11");
  fireEvent.click(within(assignedSection).getByRole("button", { name: "Next" }));
  expectInSection(assignedSection, "B-A-11");

  fireEvent.change(within(assignedSection).getByPlaceholderText("Search booking ID, customer, service..."), { target: { value: "B-A-01" } });
  expectInSection(assignedSection, "B-A-01");
  expect(within(assignedSection).getByRole("button", { name: "Previous" })).toBeDisabled();

  fireEvent.change(within(assignedSection).getByPlaceholderText("Search booking ID, customer, service..."), { target: { value: "" } });
  fireEvent.click(within(assignedSection).getByRole("button", { name: "Next" }));
  expectInSection(assignedSection, "B-A-11");

  fireEvent.focus(window);
  await waitFor(() => expectNotInSection(assignedSection, "B-A-11"));
  expectInSection(assignedSection, "B-A-01");
  expect(within(assignedSection).getByRole("button", { name: "Next" })).toBeDisabled();
});

test("junior detailer work filtering and pagination stay operational with N/A commission privacy", async () => {
  await renderLoaded(dto({
    assignedWork: [],
    juniorDetailerWork: Array.from({ length: 12 }, (_, index) => makeJunior(index + 1)),
    commissionAudit: [],
  }));
  const juniorSection = getSection("Junior Detailer Work View");

  expectInSection(juniorSection, "B-J-01");
  expectNotInSection(juniorSection, "B-J-11");
  fireEvent.click(within(juniorSection).getByRole("button", { name: "Next" }));
  expectInSection(juniorSection, "B-J-11");

  fireEvent.change(within(juniorSection).getByDisplayValue("All junior detailers"), { target: { value: "Junior B" } });
  expectInSection(juniorSection, "B-J-02");
  expectNotInSection(juniorSection, "B-J-01");
  expect(within(juniorSection).getAllByText("N/A").length).toBeGreaterThan(0);

  fireEvent.change(within(juniorSection).getByDisplayValue("All commissions"), { target: { value: "N/A" } });
  expectInSection(juniorSection, "B-J-02");
});

test("commission audit shows only authorized records with payment details and independent pagination", async () => {
  await renderLoaded(dto({
    assignedWork: [],
    juniorDetailerWork: [],
    commissionAudit: Array.from({ length: 12 }, (_, index) => makeCommission(index + 1)),
  }));
  const commissionSection = getSection("Commission Audit");

  expectInSection(commissionSection, "COM-01");
  expect(within(commissionSection).getAllByText("finance@example.com").length).toBeGreaterThan(0);
  expect(within(commissionSection).getAllByText("Paid by payroll").length).toBeGreaterThan(0);
  expectNotInSection(commissionSection, "COM-11");
  fireEvent.click(within(commissionSection).getByRole("button", { name: "Next" }));
  expectInSection(commissionSection, "COM-11");

  const assignedSection = getSection("Assigned Work");
  expect(within(assignedSection).getByRole("button", { name: "Previous" })).toBeDisabled();
});

test("Junior Detailer My Work hides the Senior-only junior work section while preserving own Commission Audit", async () => {
  apiRequest.mockResolvedValue(dto({
    assignedWork: [makeAssigned(1, { id: "B-JR-OWN", customer: "Junior Own Customer" })],
    juniorDetailerWork: [],
    commissionAudit: [makeCommission(1, { id: "COM-JR-OWN", bookingId: "B-JR-OWN" })],
  }));

  render(<StaffMyWork session={juniorSession} />);

  const assignedSection = await screen.findByRole("heading", { name: "Assigned Work" }).then((heading) => heading.closest("section"));
  expectInSection(assignedSection, "B-JR-OWN");
  expect(screen.queryByRole("heading", { name: "Junior Detailer Work View" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Commission Audit" })).toBeInTheDocument();
  expect(screen.getByText("COM-JR-OWN")).toBeInTheDocument();
});

test("details modal derives the selected record from refreshed DTO data", async () => {
  apiRequest
    .mockResolvedValueOnce(dto())
    .mockResolvedValueOnce(dto({
      assignedWork: [{
        ...assignedWork,
        status: "Completed",
        issueNote: "Updated issue note",
        warrantyChecklist: "Updated warranty checklist",
        warrantyReleased: true,
      }],
    }));

  render(<StaffMyWork session={seniorSession} />);

  const seniorRow = (await screen.findAllByText("B-SENIOR"))[0].closest("tr");
  fireEvent.click(within(seniorRow).getByRole("button", { name: "Details" }));
  expect(screen.getByText("Initial issue note")).toBeInTheDocument();

  fireEvent.focus(window);

  await waitFor(() => expect(screen.getByText("Updated issue note")).toBeInTheDocument());
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getAllByText("Completed").length).toBeGreaterThan(0);
  expect(within(dialog).getByText("Released")).toBeInTheDocument();
});

test("closes details when the selected record is no longer authorized after refresh", async () => {
  apiRequest
    .mockResolvedValueOnce(dto())
    .mockResolvedValueOnce(dto({ assignedWork: [] }));

  render(<StaffMyWork session={seniorSession} />);

  const seniorRow = (await screen.findAllByText("B-SENIOR"))[0].closest("tr");
  fireEvent.click(within(seniorRow).getByRole("button", { name: "Details" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  fireEvent.focus(window);

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("details can switch between records without stale values", async () => {
  await renderLoaded(dto({
    assignedWork: [
      makeAssigned(1, { id: "B-DETAIL-A", customer: "Alpha Customer", issueNote: "Alpha note" }),
      makeAssigned(2, { id: "B-DETAIL-B", customer: "Beta Customer", issueNote: "Beta note" }),
    ],
    juniorDetailerWork: [],
    commissionAudit: [],
  }));
  const assignedSection = getSection("Assigned Work");

  const rowA = within(assignedSection).getByText("B-DETAIL-A").closest("tr");
  fireEvent.click(within(rowA).getByRole("button", { name: "Details" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Alpha note");
  fireEvent.click(screen.getByRole("button", { name: "x" }));

  const rowB = within(assignedSection).getByText("B-DETAIL-B").closest("tr");
  fireEvent.click(within(rowB).getByRole("button", { name: "Details" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Beta note");
  expect(screen.getByRole("dialog")).not.toHaveTextContent("Alpha note");
});

test("shows clean loading and error states for the authoritative endpoint", async () => {
  let rejectLoad;
  apiRequest.mockReturnValue(new Promise((_, reject) => {
    rejectLoad = reject;
  }));

  render(<StaffMyWork session={seniorSession} />);
  expect(screen.getByText("Loading My Work...")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Assigned Work" })).not.toBeInTheDocument();

  rejectLoad(new Error("Could not reach My Work."));
  expect(await screen.findByText("Could not reach My Work.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Assigned Work" })).not.toBeInTheDocument();
});

test("PDF action still uses the authenticated My Work report path", async () => {
  render(<StaffMyWork session={seniorSession} />);

  await screen.findAllByText("B-SENIOR");
  fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

  expect(buildReportDownloadPath).toHaveBeenCalledWith("my-work", "pdf");
  expect(downloadAuthenticatedFile).toHaveBeenCalledWith("/api/admin/reports/my-work/pdf", "autoflow-my-work-report.pdf");
});
