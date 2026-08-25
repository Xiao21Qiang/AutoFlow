import { render, screen } from "@testing-library/react";
import { ProtectedRoute, PublicRoute } from "./components/AuthRoutes";

jest.mock("react-router-dom", () => ({
  Navigate: ({ to }) => <div>Navigate to {to}</div>,
  useLocation: () => ({ pathname: "/staff", state: null }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

function tokenWithExp(exp) {
  const payload = window.btoa(JSON.stringify({ exp })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

function writeSession({ exp = Math.floor(Date.now() / 1000) + 3600, user = { email: "junior@example.com", userType: "Staff", role: "Junior Detailer" } } = {}) {
  localStorage.setItem("token", tokenWithExp(exp));
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("authLoginAt", String(Date.now()));
  localStorage.setItem("authLastActivity", String(Date.now()));
}

beforeEach(() => {
  localStorage.clear();
});

test("post-logout browser back or direct Staff route requires login", () => {
  render(<ProtectedRoute allowedRoles={["staff"]}><div>Staff portal</div></ProtectedRoute>);

  expect(screen.getByText("Navigate to /login")).toBeInTheDocument();
  expect(screen.queryByText("Staff portal")).not.toBeInTheDocument();
});

test("authenticated Staff visiting login is routed back to Staff portal", () => {
  writeSession();
  render(<PublicRoute><div>Login page</div></PublicRoute>);

  expect(screen.getByText("Navigate to /staff")).toBeInTheDocument();
  expect(screen.queryByText("Login page")).not.toBeInTheDocument();
});

test("expired Staff token clears session and redirects protected route to login", () => {
  writeSession({ exp: Math.floor(Date.now() / 1000) - 60 });
  render(<ProtectedRoute allowedRoles={["staff"]}><div>Staff portal</div></ProtectedRoute>);

  expect(screen.getByText("Navigate to /login")).toBeInTheDocument();
  expect(localStorage.getItem("token")).toBeNull();
  expect(localStorage.getItem("user")).toBeNull();
  expect(localStorage.getItem("authMessage")).toBe("Session expired. Please log in again.");
});
