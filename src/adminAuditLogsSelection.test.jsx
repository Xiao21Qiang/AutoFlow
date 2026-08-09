import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminAuditLogs from "./screens/admin/AdminAuditLogs";

let mockAdminData;
const mockArchiveAuditLogs = jest.fn();
const mockUnarchiveAuditLogs = jest.fn();
const mockGetActiveAuditLogIds = jest.fn();

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => mockAdminData,
}));

function buildLogs(count) {
  return Array.from({ length: count }, (_value, index) => {
    const number = index + 1;
    return {
      id: `AUD-${number}`,
      userId: `user-${number}@example.com`,
      action: number === 3 ? "Special searched action" : "Viewed dashboard",
      ts: `2026-08-${String(number).padStart(2, "0")} 10:00 AM`,
      meta: {},
    };
  });
}

function renderAuditLogs(overrides = {}) {
  mockAdminData = {
    auditLogs: buildLogs(12),
    archivedAuditLogs: [],
    archiveAuditLogs: mockArchiveAuditLogs,
    unarchiveAuditLogs: mockUnarchiveAuditLogs,
    getActiveAuditLogIds: mockGetActiveAuditLogIds,
    currentUser: { userType: "Admin" },
    ...overrides,
  };
  render(<AdminAuditLogs />);
}

beforeEach(() => {
  mockArchiveAuditLogs.mockReset();
  mockArchiveAuditLogs.mockResolvedValue(undefined);
  mockUnarchiveAuditLogs.mockReset();
  mockGetActiveAuditLogIds.mockReset();
  mockGetActiveAuditLogIds.mockResolvedValue({ ids: buildLogs(80).map((log) => log.id) });
});

describe("AdminAuditLogs selection", () => {
  test("archives only IDs selected across pages", async () => {
    renderAuditLogs();

    fireEvent.click(screen.getByLabelText("Select audit log AUD-1"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByText("›"));
    fireEvent.click(screen.getByLabelText("Select audit log AUD-11"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive Logs" }));
    });

    expect(mockArchiveAuditLogs).toHaveBeenCalledTimes(1);
    expect(mockArchiveAuditLogs).toHaveBeenCalledWith(["AUD-1", "AUD-11"]);
  });

  test("global Select All uses every active ID, not the current search results", async () => {
    renderAuditLogs();

    fireEvent.change(screen.getByPlaceholderText("Search Logs..."), { target: { value: "Special searched action" } });
    expect(screen.getByText("AUD-3")).toBeInTheDocument();
    expect(screen.queryByText("AUD-4")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    });

    await waitFor(() => expect(screen.getByText("80 selected")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive Logs" }));
    });

    expect(mockGetActiveAuditLogIds).toHaveBeenCalledTimes(1);
    expect(mockArchiveAuditLogs).toHaveBeenCalledWith(buildLogs(80).map((log) => log.id));
  });

  test("does not call archive when no audit logs are selected", () => {
    renderAuditLogs();

    const archiveButton = screen.getByRole("button", { name: "Archive Logs" });
    expect(archiveButton).toBeDisabled();

    fireEvent.click(archiveButton);
    expect(mockArchiveAuditLogs).not.toHaveBeenCalled();
  });
});
