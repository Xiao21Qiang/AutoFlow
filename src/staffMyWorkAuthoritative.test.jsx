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

test("PDF action still uses the authenticated My Work report path", async () => {
  render(<StaffMyWork session={seniorSession} />);

  await screen.findAllByText("B-SENIOR");
  fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

  expect(buildReportDownloadPath).toHaveBeenCalledWith("my-work", "pdf");
  expect(downloadAuthenticatedFile).toHaveBeenCalledWith("/api/admin/reports/my-work/pdf", "autoflow-my-work-report.pdf");
});
