import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

jest.mock("react-router-dom", () => jest.requireActual("../node_modules/react-router-dom/dist/index.js"), { virtual: true });
jest.mock("react-router/dom", () => jest.requireActual("../node_modules/react-router/dist/development/dom-export.js"), { virtual: true });

jest.mock("./screens/Home", () => () => <div data-testid="home-screen">Home</div>);
jest.mock("./screens/admin/AdminMain", () => () => <div data-testid="admin-main">Admin portal</div>);
jest.mock("./screens/staff/StaffMain", () => () => <div data-testid="staff-main">Staff portal</div>);
jest.mock("./screens/customer/CustomerMain", () => {
  const Navbar = require("./components/Navbar").default;
  return () => (
    <>
      <Navbar />
      <div data-testid="customer-main">Customer portal</div>
    </>
  );
});
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

async function requestPasswordResetOtp(fetchSpy) {
  fetchSpy.mockResolvedValueOnce(mockJsonResponse({
    verificationId: "OTP-PW-1",
    destination: "customer@example.com",
    channel: "email",
    message: "OTP sent to your email address.",
  }));

  await userEvent.type(screen.getByPlaceholderText("Enter your email"), "customer@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Send OTP" }));

  await waitFor(() => {
    expect(window.location.pathname).toBe("/forgot-password/verify");
    expect(screen.getByText("Enter Security Code")).toBeInTheDocument();
  });
}

async function enterForgotPasswordOtp(code = "123456") {
  for (const [index, digit] of [...code].entries()) {
    await userEvent.type(screen.getByLabelText(`Forgot password OTP digit ${index + 1}`), digit);
  }
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

test("/forgot-password renders the password-reset request screen", () => {
  renderAt("/forgot-password");

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Forgot Password")).toBeInTheDocument();
  expect(screen.getByText("Please enter your email to search for your account.")).toBeInTheDocument();
});

test("forgot password from /login navigates to /forgot-password", async () => {
  renderAt("/login");

  await userEvent.click(screen.getByRole("button", { name: "Forgot Password?" }));

  expect(window.location.pathname).toBe("/forgot-password");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Please enter your email to search for your account.")).toBeInTheDocument();
});

test("successful password-reset request transitions to /forgot-password/verify", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  renderAt("/forgot-password");

  await requestPasswordResetOtp(fetchSpy);

  expect(fetchSpy).toHaveBeenCalledWith(
    "http://localhost:4000/api/auth/password-change/request-otp",
    expect.objectContaining({ method: "POST" })
  );
  expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
    email: "customer@example.com",
    channel: "email",
  });
  expect(screen.getByText("Enter Security Code")).toBeInTheDocument();
});

test("/forgot-password/verify requires an active recovery request", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  renderAt("/forgot-password/verify");

  await waitFor(() => expect(window.location.pathname).toBe("/forgot-password"));
  expect(screen.getByText("Forgot Password")).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("successful reset OTP verification transitions to /reset-password", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  renderAt("/forgot-password");
  await requestPasswordResetOtp(fetchSpy);

  fetchSpy.mockResolvedValueOnce(mockJsonResponse({
    verified: true,
    message: "OTP verified successfully.",
  }));
  await enterForgotPasswordOtp();
  await userEvent.click(screen.getByRole("button", { name: "Verify OTP" }));

  await waitFor(() => expect(window.location.pathname).toBe("/reset-password"));
  expect(fetchSpy).toHaveBeenLastCalledWith(
    "http://localhost:4000/api/auth/password-change/verify-otp",
    expect.objectContaining({ method: "POST" })
  );
  expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toEqual({
    verificationId: "OTP-PW-1",
    otp: "123456",
  });
  expect(screen.getByText("Reset Password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save Password" })).toBeInTheDocument();
});

test("successful password reset uses the existing endpoint and returns to /login", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  renderAt("/forgot-password");
  await requestPasswordResetOtp(fetchSpy);

  fetchSpy.mockResolvedValueOnce(mockJsonResponse({ verified: true }));
  await enterForgotPasswordOtp();
  await userEvent.click(screen.getByRole("button", { name: "Verify OTP" }));
  await waitFor(() => expect(window.location.pathname).toBe("/reset-password"));

  fetchSpy.mockResolvedValueOnce(mockJsonResponse({ message: "Password updated successfully." }));
  await userEvent.type(screen.getByPlaceholderText("Enter password"), "Password1");
  await userEvent.type(screen.getByPlaceholderText("Confirm password"), "Password1");
  await userEvent.click(screen.getByRole("button", { name: "Save Password" }));

  await waitFor(() => {
    expect(window.location.pathname).toBe("/login");
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });
  expect(fetchSpy).toHaveBeenLastCalledWith(
    "http://localhost:4000/api/auth/password-change/reset",
    expect.objectContaining({ method: "POST" })
  );
  expect(JSON.parse(fetchSpy.mock.calls[2][1].body)).toEqual({
    verificationId: "OTP-PW-1",
    password: "Password1",
  });
});

test("/reset-password requires verified recovery state and cannot submit directly", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  renderAt("/reset-password");

  await waitFor(() => expect(window.location.pathname).toBe("/forgot-password"));
  expect(screen.queryByRole("button", { name: "Save Password" })).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("stale reset authorization is handled by the backend and returns to recovery request", async () => {
  const fetchSpy = jest.spyOn(global, "fetch");

  renderAt("/forgot-password");
  await requestPasswordResetOtp(fetchSpy);

  fetchSpy.mockResolvedValueOnce(mockJsonResponse({ verified: true }));
  await enterForgotPasswordOtp();
  await userEvent.click(screen.getByRole("button", { name: "Verify OTP" }));
  await waitFor(() => expect(window.location.pathname).toBe("/reset-password"));

  fetchSpy.mockResolvedValueOnce(mockJsonResponse({
    message: "This OTP session has expired. Please request a new code.",
  }, 410));
  await userEvent.type(screen.getByPlaceholderText("Enter password"), "Password1");
  await userEvent.type(screen.getByPlaceholderText("Confirm password"), "Password1");
  await userEvent.click(screen.getByRole("button", { name: "Save Password" }));

  await waitFor(() => expect(window.location.pathname).toBe("/forgot-password"));
  expect(screen.queryByRole("button", { name: "Save Password" })).not.toBeInTheDocument();
  expect(screen.getByText("Forgot Password")).toBeInTheDocument();
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

test.each(["/forgot-password", "/forgot-password/verify", "/reset-password"])(
  "authenticated users cannot remain on %s",
  async (path) => {
    writeSession();

    renderAt(path);

    await screen.findByTestId("customer-main");
    expect(window.location.pathname).toBe("/client");
  }
);

test("logout still clears the session and returns to /login", async () => {
  writeSession();

  renderAt("/client");

  await screen.findByTestId("customer-main");
  await userEvent.click(screen.getByRole("button", { name: "Logout" }));

  expect(window.location.pathname).toBe("/login");
  expect(localStorage.getItem("token")).toBeNull();
  expect(localStorage.getItem("user")).toBeNull();
});
