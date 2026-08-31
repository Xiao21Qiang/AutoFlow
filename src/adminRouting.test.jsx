import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

jest.mock("react-router-dom", () => jest.requireActual("../node_modules/react-router-dom/dist/index.js"), { virtual: true });
jest.mock("react-router/dom", () => jest.requireActual("../node_modules/react-router/dist/development/dom-export.js"), { virtual: true });

jest.mock("./context/AdminDataContext", () => ({
  AdminDataProvider: ({ children }) => <>{children}</>,
  useAdminData: () => ({
    loading: false,
    error: "",
    notifications: [],
    unreadNotificationCount: 0,
    notificationPermission: "default",
    requestNotificationPermission: () => {},
    markNotificationsRead: () => {},
  }),
}));

jest.mock("./screens/Home", () => () => <div data-testid="home-screen">Home</div>);
jest.mock("./screens/Login", () => () => <div data-testid="login-screen">Login</div>);
jest.mock("./screens/staff/StaffMain", () => () => <div data-testid="staff-main">Staff portal</div>);
jest.mock("./screens/customer/CustomerMain", () => () => <div data-testid="customer-main">Customer portal</div>);
jest.mock("./screens/customer/CustomerTrackingView", () => () => <div data-testid="tracking-view">Tracking</div>);
jest.mock("./screens/customer/CustomerWarrantyView", () => () => <div data-testid="warranty-view">Warranty</div>);

jest.mock("./screens/admin/AdminDashboard", () => ({ goTo }) => (
  <div data-testid="module-dashboard">
    Dashboard module
    <button type="button" onClick={() => goTo("bookings", { action: "open-add-booking" })}>Create Booking</button>
    <button type="button" onClick={() => goTo("stock-monitoring", { action: "open-add-stock-item" })}>Add stock item</button>
    <button type="button" onClick={() => goTo("services", { action: "open-add-service" })}>Add Service</button>
    <button type="button" onClick={() => goTo("users")}>User Management quick action</button>
    <button type="button" onClick={() => goTo("tracking")}>Tracking alert</button>
    <button type="button" onClick={() => goTo("payments")}>Payment alert</button>
  </div>
));
jest.mock("./screens/admin/AdminAnalytics", () => () => <div data-testid="module-analytics">Analytics module</div>);
jest.mock("./screens/admin/AdminAuditLogs", () => () => <div data-testid="module-audit">Audit Logs module</div>);
jest.mock("./screens/admin/AdminBookings", () => ({ initialAction }) => <div data-testid="module-bookings">Bookings module {initialAction}</div>);
jest.mock("./screens/admin/AdminServices", () => ({ initialAction }) => <div data-testid="module-services">Services module {initialAction}</div>);
jest.mock("./screens/admin/AdminTracking", () => () => <div data-testid="module-tracking">Service Tracking module</div>);
jest.mock("./screens/admin/AdminStockMonitoring", () => ({ initialAction }) => <div data-testid="module-stock-monitoring">Stock Monitoring module {initialAction}</div>);
jest.mock("./screens/admin/AdminPayments", () => () => <div data-testid="module-payments">Payment Tracking module</div>);
jest.mock("./screens/admin/AdminFinancialTracker", () => () => <div data-testid="module-financial-tracker">Financial Tracker module</div>);
jest.mock("./screens/admin/AdminEngagement", () => () => <div data-testid="module-engagement">Engagement module</div>);
jest.mock("./screens/admin/AdminUsers", () => () => <div data-testid="module-users">User Management module</div>);
jest.mock("./screens/admin/AdminDetailerManagement", () => () => <div data-testid="module-detailer-management">Detailer Management module</div>);
jest.mock("./screens/admin/AdminProfile", () => () => <div data-testid="module-profile">Profile module</div>);

function tokenWithExp(exp = Math.floor(Date.now() / 1000) + 3600) {
  const payload = window.btoa(JSON.stringify({ exp })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

function writeSession(user = { id: "ADM-1", email: "admin@example.com", userType: "Admin", role: "Admin" }) {
  const now = String(Date.now());
  localStorage.setItem("token", tokenWithExp());
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("authLoginAt", now);
  localStorage.setItem("authLastActivity", now);
}

function renderAt(path, user) {
  window.history.pushState({}, "", path);
  if (user !== null) writeSession(user);
  return render(<App />);
}

function activeSidebarLabel() {
  return document.querySelector(".sideItem.active span")?.textContent;
}

const canonicalRoutes = [
  ["/admin", "module-dashboard", "Dashboard"],
  ["/admin/analytics", "module-analytics", "Analytics"],
  ["/admin/audit-logs", "module-audit", "Audit Logs"],
  ["/admin/bookings", "module-bookings", "Bookings"],
  ["/admin/services", "module-services", "Services"],
  ["/admin/service-tracking", "module-tracking", "Service Tracking"],
  ["/admin/stock-monitoring", "module-stock-monitoring", "Stock Monitoring"],
  ["/admin/payment-tracking", "module-payments", "Payment Tracking"],
  ["/admin/financial-tracker", "module-financial-tracker", "Financial Tracker"],
  ["/admin/engagement", "module-engagement", "Engagement"],
  ["/admin/user-management", "module-users", "User Management"],
  ["/admin/detailer-management", "module-detailer-management", "Detailer Management"],
  ["/admin/profile", "module-profile", "Profile"],
];

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

test.each(canonicalRoutes)("%s renders the canonical Admin module and active sidebar item", async (path, moduleTestId, label) => {
  renderAt(path);

  expect(await screen.findByTestId(moduleTestId)).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe(label);
  expect(window.location.pathname).toBe(path);
});

test("sidebar navigation updates the URL and derives active state from location", async () => {
  renderAt("/admin");

  await userEvent.click(screen.getByText("Payment Tracking"));

  expect(window.location.pathname).toBe("/admin/payment-tracking");
  expect(await screen.findByTestId("module-payments")).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe("Payment Tracking");
});

test("browser back and forward keep the displayed Admin module synchronized", async () => {
  renderAt("/admin");

  await userEvent.click(screen.getByText("Bookings"));
  await userEvent.click(screen.getByText("Payment Tracking"));

  await act(async () => {
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(window.location.pathname).toBe("/admin/bookings"));
  expect(screen.getByTestId("module-bookings")).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe("Bookings");

  await act(async () => {
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(window.location.pathname).toBe("/admin"));
  expect(screen.getByTestId("module-dashboard")).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe("Dashboard");

  await act(async () => {
    window.history.forward();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(window.location.pathname).toBe("/admin/bookings"));
  expect(screen.getByTestId("module-bookings")).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe("Bookings");
});

test.each([
  ["Create Booking", "/admin/bookings", "module-bookings", "open-add-booking"],
  ["Add stock item", "/admin/stock-monitoring", "module-stock-monitoring", "open-add-stock-item"],
  ["Add Service", "/admin/services", "module-services", "open-add-service"],
  ["User Management quick action", "/admin/user-management", "module-users", ""],
  ["Tracking alert", "/admin/service-tracking", "module-tracking", ""],
  ["Payment alert", "/admin/payment-tracking", "module-payments", ""],
])("dashboard quick action %s uses the canonical Admin URL", async (buttonName, expectedPath, moduleTestId, expectedAction) => {
  renderAt("/admin");

  await userEvent.click(screen.getByRole("button", { name: buttonName }));

  expect(window.location.pathname).toBe(expectedPath);
  const module = await screen.findByTestId(moduleTestId);
  expect(module).toBeInTheDocument();
  if (expectedAction) {
    expect(module).toHaveTextContent(expectedAction);
  }
});

test("legacy /admin/dashboard redirects to the canonical dashboard route", async () => {
  renderAt("/admin/dashboard");

  await waitFor(() => expect(window.location.pathname).toBe("/admin"));
  expect(screen.getByTestId("module-dashboard")).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe("Dashboard");
});

test("invalid Admin child routes safely fall back to the dashboard", async () => {
  renderAt("/admin/not-a-real-module");

  await waitFor(() => expect(window.location.pathname).toBe("/admin"));
  expect(screen.getByTestId("module-dashboard")).toBeInTheDocument();
  expect(activeSidebarLabel()).toBe("Dashboard");
});

test("unauthenticated Admin deep links are denied by the existing protected route", async () => {
  renderAt("/admin/bookings", null);

  await waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(screen.getByTestId("login-screen")).toBeInTheDocument();
});

test.each([
  [{ id: "STF-1", email: "staff@example.com", userType: "Staff", role: "General Manager" }, "/staff", "staff-main"],
  [{ id: "CUS-1", email: "customer@example.com", userType: "Customer", role: "Customer" }, "/client", "customer-main"],
])("non-Admin users cannot access Admin deep links", async (user, expectedPath, testId) => {
  renderAt("/admin/services", user);

  await waitFor(() => expect(window.location.pathname).toBe(expectedPath));
  expect(screen.getByTestId(testId)).toBeInTheDocument();
});

test.each([
  ["/staff", { id: "STF-1", email: "staff@example.com", userType: "Staff", role: "General Manager" }, "staff-main"],
  ["/client", { id: "CUS-1", email: "customer@example.com", userType: "Customer", role: "Customer" }, "customer-main"],
])("%s remains registered outside the Admin route tree", async (path, user, testId) => {
  renderAt(path, user);
  expect(await screen.findByTestId(testId)).toBeInTheDocument();
  expect(window.location.pathname).toBe(path);
});
