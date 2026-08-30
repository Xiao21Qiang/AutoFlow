import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

jest.mock("react-router-dom", () => jest.requireActual("../node_modules/react-router-dom/dist/index.js"), { virtual: true });
jest.mock("react-router/dom", () => jest.requireActual("../node_modules/react-router/dist/development/dom-export.js"), { virtual: true });

jest.mock("./screens/Home", () => () => <div data-testid="home-screen">Home</div>);
jest.mock("./screens/admin/AdminMain", () => () => <div data-testid="admin-main">Admin portal</div>);
jest.mock("./screens/staff/StaffMain", () => () => <div data-testid="staff-main">Staff portal</div>);
jest.mock("./screens/customer/CustomerMain", () => () => <div data-testid="customer-main">Customer portal</div>);
jest.mock("./screens/customer/CustomerTrackingView", () => () => <div data-testid="tracking-view">Tracking</div>);
jest.mock("./screens/customer/CustomerWarrantyView", () => () => <div data-testid="warranty-view">Warranty</div>);

function tokenWithExp(exp = Math.floor(Date.now() / 1000) + 3600) {
  const payload = window.btoa(JSON.stringify({ exp })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

function writeSession(user = { email: "customer@example.com", userType: "Customer" }) {
  const now = String(Date.now());
  localStorage.setItem("token", tokenWithExp());
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("authLoginAt", now);
  localStorage.setItem("authLastActivity", now);
}

function renderAt(path) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

function mockJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

test("/login renders the sign-in form", () => {
  renderAt("/login");

  expect(screen.getByRole("tab", { name: "Sign In" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Welcome back")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
});

test("/register renders the sign-up form when opened directly", () => {
  renderAt("/register");

  expect(screen.getByRole("tab", { name: "Sign Up" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
});

test("auth tabs navigate between canonical login and register URLs", async () => {
  renderAt("/login");

  await userEvent.click(screen.getByRole("tab", { name: "Sign Up" }));
  expect(window.location.pathname).toBe("/register");
  expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("tab", { name: "Sign In" }));
  expect(window.location.pathname).toBe("/login");
  expect(screen.getByText("Welcome back")).toBeInTheDocument();
});

test("browser history keeps tab state synchronized with the URL", async () => {
  renderAt("/login");

  await userEvent.click(screen.getByRole("tab", { name: "Sign Up" }));
  expect(window.location.pathname).toBe("/register");

  await act(async () => {
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => {
    expect(window.location.pathname).toBe("/login");
    expect(screen.getByRole("tab", { name: "Sign In" })).toHaveAttribute("aria-selected", "true");
  });
  expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();

  await act(async () => {
    window.history.forward();
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => {
    expect(window.location.pathname).toBe("/register");
    expect(screen.getByRole("tab", { name: "Sign Up" })).toHaveAttribute("aria-selected", "true");
  });
  expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
});

test("registration form still submits through the existing OTP request workflow", async () => {
  const fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(mockJsonResponse({
      verificationId: "OTP-1",
      destination: "new.customer@example.com",
      channel: "email",
      message: "OTP sent to your email address.",
    }));

  renderAt("/register");

  await userEvent.type(screen.getByPlaceholderText("Enter your first name"), "Angel");
  await userEvent.type(screen.getByPlaceholderText("Enter your last name"), "Santos");
  await userEvent.type(screen.getByPlaceholderText("Enter your email"), "new.customer@example.com");
  await userEvent.type(screen.getByPlaceholderText("09xx xxx xxxx"), "09171234567");
  await userEvent.type(screen.getByPlaceholderText("Enter your password"), "Password1!");
  await userEvent.type(screen.getByPlaceholderText("Confirm your password"), "Password1!");
  await userEvent.click(screen.getByRole("button", { name: "Create Account" }));

  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
    "http://localhost:4000/api/auth/signup/request-otp",
    expect.objectContaining({ method: "POST" })
  ));
  expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({
    firstName: "Angel",
    lastName: "Santos",
    email: "new.customer@example.com",
    phone: "09171234567",
    channel: "email",
  });
  expect(screen.getByText("Verify New Account")).toBeInTheDocument();
});

test("login form still authenticates and redirects customers to their portal", async () => {
  const token = tokenWithExp();
  jest.spyOn(global, "fetch").mockResolvedValue(mockJsonResponse({
    token,
    user: { email: "customer@example.com", userType: "Customer" },
  }));

  renderAt("/login");

  await userEvent.type(screen.getByPlaceholderText("Enter your email"), "customer@example.com");
  await userEvent.type(screen.getByPlaceholderText("Enter your password"), "Password1!");
  await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

  await screen.findByTestId("customer-main");
  expect(window.location.pathname).toBe("/client");
  expect(localStorage.getItem("token")).toBe(token);
});

test("forgot password flow remains available from /login", async () => {
  renderAt("/login");

  await userEvent.click(screen.getByRole("button", { name: "Forgot Password?" }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Please enter your email to search for your account.")).toBeInTheDocument();
});

test("authenticated users cannot remain on /login", async () => {
  writeSession();

  renderAt("/login");

  await screen.findByTestId("customer-main");
  expect(window.location.pathname).toBe("/client");
});

test("authenticated users cannot remain on /register", async () => {
  writeSession();

  renderAt("/register");

  await screen.findByTestId("customer-main");
  expect(window.location.pathname).toBe("/client");
});
