import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminAuditLogs, { formatAuditTimestamp } from "./screens/admin/AdminAuditLogs";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "./utils/downloadExport";

let mockAdminData;
const mockArchiveAuditLogs = jest.fn();
const mockUnarchiveAuditLogs = jest.fn();
const mockGetActiveAuditLogIds = jest.fn();
const mockGetArchivedAuditLogIds = jest.fn();

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => mockAdminData,
}));

jest.mock("./utils/downloadExport", () => ({
  buildReportDownloadPath: jest.fn(() => "/api/admin/reports/audit-logs/pdf"),
  downloadAuthenticatedFile: jest.fn(),
}));

function buildLogs(count, prefix = "AUD", action = "Viewed dashboard") {
  return Array.from({ length: count }, (_value, index) => {
    const number = index + 1;
    return {
      id: `${prefix}-${number}`,
      userId: `user-${number}@example.com`,
      action: number === 3 ? "Special searched action" : action,
      ts: `2026-08-${String(number).padStart(2, "0")}T02:00:00.000Z`,
      meta: {},
    };
  });
}

function renderAuditLogs(overrides = {}) {
  mockAdminData = {
    auditLogs: buildLogs(12),
    archivedAuditLogs: buildLogs(12, "AUD-ARCH", "Archived action"),
    archiveAuditLogs: mockArchiveAuditLogs,
    unarchiveAuditLogs: mockUnarchiveAuditLogs,
    getActiveAuditLogIds: mockGetActiveAuditLogIds,
    getArchivedAuditLogIds: mockGetArchivedAuditLogIds,
    currentUser: { userType: "Admin" },
    ...overrides,
  };
  render(<AdminAuditLogs />);
}

beforeEach(() => {
  mockArchiveAuditLogs.mockReset();
  mockArchiveAuditLogs.mockResolvedValue(undefined);
  mockUnarchiveAuditLogs.mockReset();
  mockUnarchiveAuditLogs.mockResolvedValue(undefined);
  mockGetActiveAuditLogIds.mockReset();
  mockGetActiveAuditLogIds.mockResolvedValue({ ids: buildLogs(80).map((log) => log.id) });
  mockGetArchivedAuditLogIds.mockReset();
  mockGetArchivedAuditLogIds.mockResolvedValue({ ids: buildLogs(42, "AUD-ARCH").map((log) => log.id) });
  buildReportDownloadPath.mockClear();
  buildReportDownloadPath.mockReturnValue("/api/admin/reports/audit-logs/pdf");
  downloadAuthenticatedFile.mockReset();
  downloadAuthenticatedFile.mockResolvedValue(undefined);
});

describe("AdminAuditLogs selection", () => {
  test("shows Select All and Deselect All controls on the active tab", () => {
    renderAuditLogs();

    expect(screen.getByRole("button", { name: "Select All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deselect All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deselect All" })).toBeDisabled();
  });

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

  test("header checkbox selects only the current visible page", async () => {
    renderAuditLogs();

    fireEvent.click(screen.getByLabelText("Select all visible logs"));
    expect(screen.getByText("10 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByText("›"));
    expect(screen.getByLabelText("Select audit log AUD-11")).not.toBeChecked();
    expect(screen.getByText("10 selected")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive Logs" }));
    });

    expect(mockArchiveAuditLogs).toHaveBeenCalledWith(buildLogs(10).map((log) => log.id));
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

  test("Deselect All clears active selections across pages", () => {
    renderAuditLogs();

    fireEvent.click(screen.getByLabelText("Select audit log AUD-1"));
    fireEvent.click(screen.getByText("›"));
    fireEvent.click(screen.getByLabelText("Select audit log AUD-11"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deselect All" }));

    expect(screen.getByText("Select logs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Logs" })).toBeDisabled();
    expect(screen.getByLabelText("Select audit log AUD-11")).not.toBeChecked();
  });

  test("does not call archive when no audit logs are selected", () => {
    renderAuditLogs();

    const archiveButton = screen.getByRole("button", { name: "Archive Logs" });
    expect(archiveButton).toBeDisabled();

    fireEvent.click(archiveButton);
    expect(mockArchiveAuditLogs).not.toHaveBeenCalled();
  });

  test("shows archived Select All and Deselect All controls and restores selected archived IDs", async () => {
    renderAuditLogs();

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));

    expect(screen.getByRole("button", { name: "Select All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deselect All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Select audit log AUD-ARCH-1"));
    fireEvent.click(screen.getByText("›"));
    fireEvent.click(screen.getByLabelText("Select audit log AUD-ARCH-11"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    });

    expect(mockUnarchiveAuditLogs).toHaveBeenCalledWith(["AUD-ARCH-1", "AUD-ARCH-11"]);
  });

  test("archived Select All is global and Deselect All clears hidden archived selections", async () => {
    renderAuditLogs();

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    fireEvent.change(screen.getByPlaceholderText("Search Logs..."), { target: { value: "Special searched action" } });
    expect(screen.getByText("AUD-ARCH-3")).toBeInTheDocument();
    expect(screen.queryByText("AUD-ARCH-4")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    });

    await waitFor(() => expect(screen.getByText("42 selected")).toBeInTheDocument());
    expect(mockGetArchivedAuditLogIds).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Deselect All" }));

    expect(screen.getByText("Select logs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
  });

  test("tab changes clear selection so active and archived IDs cannot contaminate each other", () => {
    renderAuditLogs();

    fireEvent.click(screen.getByLabelText("Select audit log AUD-1"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));

    expect(screen.getByText("Select logs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
  });

  test("Inventory Clerk can select active and archived logs for export without archive controls", async () => {
    renderAuditLogs({
      currentUser: { userType: "Staff", role: "Inventory Clerk" },
      auditLogs: [{ id: "AUD-STOCK-1", userId: "admin@example.com", action: "Restocked stock monitoring item", ts: "2026-08-01T02:00:00.000Z" }],
      archivedAuditLogs: [{ id: "AUD-STOCK-ARCH-1", userId: "gm@example.com", action: "Deleted stock monitoring item", ts: "2026-08-02T02:00:00.000Z" }],
    });

    expect(screen.getByRole("button", { name: "Archived" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select All" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive Logs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select audit log AUD-STOCK-1"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));
    });
    expect(downloadAuthenticatedFile).toHaveBeenCalledWith(
      "/api/admin/reports/audit-logs/pdf",
      "autoflow-audit-log-report.pdf"
    );
    expect(buildReportDownloadPath).toHaveBeenLastCalledWith("audit-logs", "pdf", {
      archived: false,
      auditLogIds: ["AUD-STOCK-1"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    fireEvent.click(screen.getByLabelText("Select audit log AUD-STOCK-ARCH-1"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as PDF" }));
    });
    expect(buildReportDownloadPath).toHaveBeenLastCalledWith("audit-logs", "pdf", {
      archived: true,
      auditLogIds: ["AUD-STOCK-ARCH-1"],
    });
  });

  test("Inventory Clerk search, filters, table columns, and pagination operate on Stock Monitoring logs", () => {
    const stockLogs = Array.from({ length: 12 }, (_value, index) => ({
      id: `AUD-STOCK-${index + 1}`,
      userId: index === 10 ? "gm@example.com" : "admin@example.com",
      action: index === 10 ? "Updated stock monitoring item" : "Restocked stock monitoring item",
      ts: `2026-08-${String(index + 1).padStart(2, "0")}T02:00:00.000Z`,
      meta: {
        targetType: "StockMonitoringItem",
        operation: index === 10 ? "update" : "restock",
        name: index === 2 ? "Foam Shampoo" : `Stock Item ${index + 1}`,
        category: index === 10 ? "Coating" : "Cleaning",
        stockStatus: index === 2 ? "Low Stock" : "Healthy",
      },
    }));

    renderAuditLogs({
      currentUser: { userType: "Staff", role: "Inventory Clerk" },
      auditLogs: stockLogs,
      archivedAuditLogs: [],
    });

    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("User ID")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByLabelText("Select all visible logs")).toBeInTheDocument();
    expect(screen.getByText("AUD-STOCK-1")).toBeInTheDocument();
    expect(screen.queryByText("AUD-STOCK-11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("›"));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("AUD-STOCK-11")).toBeInTheDocument();
    fireEvent.click(screen.getByText("‹"));
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search Logs..."), { target: { value: "Foam Shampoo" } });
    expect(screen.getByText("AUD-STOCK-3")).toBeInTheDocument();
    expect(screen.getByText("Foam Shampoo / Cleaning / Low Stock")).toBeInTheDocument();
    expect(screen.queryByText("AUD-STOCK-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("User"), { target: { value: "gm@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.queryByText("AUD-STOCK-3")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search Logs..."), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "Updated stock monitoring item" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("AUD-STOCK-11")).toBeInTheDocument();
    expect(screen.queryByText("AUD-STOCK-1")).not.toBeInTheDocument();
  });
});

describe("formatAuditTimestamp", () => {
  test("formats a stored UTC ISO instant through the user's local formatter exactly once", () => {
    const formatterSpy = jest.spyOn(Date.prototype, "toLocaleString").mockImplementation(function mockFormatter(locale, options) {
      expect(this.toISOString()).toBe("2026-08-09T19:45:00.000Z");
      expect(locale).toBe("en-PH");
      expect(options).toEqual(expect.objectContaining({
        hour12: true,
        second: "2-digit",
      }));
      return "8/10/2026, 3:45:00 AM";
    });

    expect(formatAuditTimestamp("2026-08-09T19:45:00.000Z")).toBe("8/10/2026, 3:45:00 AM");
    expect(formatterSpy).toHaveBeenCalledTimes(1);

    formatterSpy.mockRestore();
  });

  test("preserves legacy timezone-less timestamp strings as readable text", () => {
    expect(formatAuditTimestamp("8/10/2026, 3:45:00 AM")).toBe("8/10/2026, 3:45:00 AM");
  });
});
