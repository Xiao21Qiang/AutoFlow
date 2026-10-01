import fs from "fs";
import path from "path";
import { fireEvent, render, screen } from "@testing-library/react";
import CustomerDashboard, { buildCustomerDashboardViewModel } from "./screens/customer/CustomerDashboard";

jest.mock("./assets/IMAGE/all-pro-tec-customer-dashboard-promo.png", () => "all-pro-tec-customer-dashboard-promo.png");
jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({ bookings: [], payments: [] }),
}));

describe("Customer Phase 2 dashboard synchronization calculations", () => {
  test("uses server-scoped bookings/payments directly so profile name changes do not hide metrics", () => {
    const viewModel = buildCustomerDashboardViewModel({
      todayKey: "2026-08-27",
      bookings: [
        { id: "B-OLD-NAME", customer: "Juan Santos", customerEmail: "juan@example.com", status: "Scheduled", date: "2026-08-30", time: "13:00", service: "Wash", vehicle: "Civic" },
        { id: "B-NEW-NAME", customer: "Juan Dela Cruz", customerEmail: "juan@example.com", status: "In Progress", date: "2026-08-29", time: "09:00", service: "Coating", vehicle: "City" },
      ],
      payments: [
        { id: "PAY-DP", customer: "Juan Santos", customerEmail: "juan@example.com", totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "Paid", finalPaymentStatus: "Pending" },
        { id: "PAY-REVIEW", customer: "Juan Dela Cruz", customerEmail: "juan@example.com", totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "For Verification", finalPaymentStatus: "Pending" },
        { id: "PAY-REJECTED", customer: "Juan Dela Cruz", customerEmail: "juan@example.com", totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "Rejected", finalPaymentStatus: "Pending" },
      ],
    });

    expect(viewModel.stats).toEqual({
      totalBookings: 2,
      inProgress: 1,
      totalPaid: 300,
    });
  });

  test("orders upcoming bookings by date and time while excluding completed and cancelled records", () => {
    const viewModel = buildCustomerDashboardViewModel({
      todayKey: "2026-08-27",
      bookings: [
        { id: "B-LATE", status: "Scheduled", date: "2026-08-28", time: "15:00", service: "Late", vehicle: "Car" },
        { id: "B-EARLY", status: "Pending", date: "2026-08-28", time: "08:00", service: "Early", vehicle: "Car" },
        { id: "B-TOMORROW", status: "In Progress", date: "2026-08-27", time: "16:00", service: "Today", vehicle: "Car" },
        { id: "B-COMPLETE", status: "Completed", date: "2026-08-27", time: "09:00", service: "Done", vehicle: "Car" },
        { id: "B-CANCEL", status: "Cancelled", date: "2026-08-29", time: "09:00", service: "Cancel", vehicle: "Car" },
      ],
      payments: [],
    });

    expect(viewModel.upcomingBookings.map((booking) => booking.id)).toEqual(["B-TOMORROW", "B-EARLY", "B-LATE"]);
  });

  test("refreshing scoped data recalculates dashboard totals without local cached copies", () => {
    const initial = buildCustomerDashboardViewModel({
      todayKey: "2026-08-27",
      bookings: [{ id: "B-1", status: "Scheduled", date: "2026-08-28", time: "09:00" }],
      payments: [],
    });
    const refreshed = buildCustomerDashboardViewModel({
      todayKey: "2026-08-27",
      bookings: [
        { id: "B-1", status: "In Progress", date: "2026-08-28", time: "09:00" },
        { id: "B-2", status: "Scheduled", date: "2026-08-29", time: "09:00" },
      ],
      payments: [{ id: "PAY-1", totalAmount: 750, finalPaymentStatus: "Paid" }],
    });

    expect(initial.stats).toMatchObject({ totalBookings: 1, inProgress: 0, totalPaid: 0 });
    expect(refreshed.stats).toMatchObject({ totalBookings: 2, inProgress: 1, totalPaid: 750 });
  });

  test("keeps the empty upcoming state available when no scoped appointment is upcoming", () => {
    const viewModel = buildCustomerDashboardViewModel({
      todayKey: "2026-08-27",
      bookings: [
        { id: "B-DONE", status: "Completed", date: "2026-08-28", time: "09:00" },
        { id: "B-OLD", status: "Scheduled", date: "2026-08-26", time: "09:00" },
      ],
      payments: [],
    });

    expect(viewModel.upcomingBookings).toEqual([]);
  });
});

describe("Customer Dashboard promotional banner", () => {
  test("renders the supplied promotion below the existing dashboard cards and preserves quick actions", () => {
    const goTo = jest.fn();
    render(<CustomerDashboard goTo={goTo} />);

    const banner = screen.getByRole("img", {
      name: "All Pro-Tec Car Care premium protection and advanced car care services",
    });
    expect(banner).toHaveClass("clDashPromoImage");
    expect(banner).toHaveAttribute("src", "all-pro-tec-customer-dashboard-promo.png");
    expect(screen.getByText("Total Bookings")).toBeInTheDocument();
    expect(screen.getByText("Upcoming bookings")).toBeInTheDocument();
    expect(screen.getByText("Quick actions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create Booking/i }));
    expect(goTo).toHaveBeenCalledWith("bookings", { action: "open-add-booking" });
    fireEvent.click(screen.getByRole("button", { name: /Add Review/i }));
    expect(goTo).toHaveBeenCalledWith("engagement", { action: "open-add-review" });
  });

  test("keeps the customer promotional asset out of Admin and Staff dashboards", () => {
    const dashboardSources = [
      "screens/admin/AdminDashboard.jsx",
      "screens/staff/StaffDashboard.jsx",
    ].map((file) => fs.readFileSync(path.join(__dirname, file), "utf8"));

    dashboardSources.forEach((source) => {
      expect(source).not.toContain("all-pro-tec-customer-dashboard-promo.png");
    });
  });
});
