import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminProfile from "./screens/admin/AdminProfile";
import { getSecurityControlStatus } from "./utils/reauth";

const mockUpdateRequiredDownPaymentAmount = jest.fn();
const mockUpdateProfile = jest.fn();
const mockRequestPasswordChangeOtp = jest.fn();
const mockVerifyPasswordChangeOtp = jest.fn();
const mockResetPasswordWithOtp = jest.fn();

let mockSettings;
let mockCurrentUser;

jest.mock("./utils/reauth", () => ({
  getSecurityControlStatus: jest.fn(() => new Promise(() => {})),
  getSpecialPasswordStatus: () => "Configured",
  getSpecialPinStatus: () => "Configured",
  updateSecurityControls: jest.fn(),
}));

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    currentUser: mockCurrentUser,
    settings: mockSettings,
    updateProfile: mockUpdateProfile,
    updateRequiredDownPaymentAmount: mockUpdateRequiredDownPaymentAmount,
    requestPasswordChangeOtp: mockRequestPasswordChangeOtp,
    verifyPasswordChangeOtp: mockVerifyPasswordChangeOtp,
    resetPasswordWithOtp: mockResetPasswordWithOtp,
  }),
}));

const session = {
  id: "ADM-1",
  email: "admin@example.com",
  name: "Admin One",
  first: "Admin",
  last: "One",
  phone: "09111111111",
  userType: "Admin",
  role: "Admin",
};

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderProfile(overrides = {}) {
  mockSettings = { requiredDownPaymentAmount: 500 };
  mockCurrentUser = { ...session, ...overrides };
  render(<AdminProfile session={session} />);
}

function openEditAccount() {
  fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
}

function input(name) {
  return screen.getByLabelText(name);
}

async function saveChanges() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/i }));
    await Promise.resolve();
  });
}

async function completeOtpVerification() {
  fireEvent.click(screen.getByRole("button", { name: "Change Password →" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await Promise.resolve();
  });
  "123456".split("").forEach((digit, index) => {
    fireEvent.change(input(`Password OTP digit ${index + 1}`), { target: { value: digit } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockUpdateRequiredDownPaymentAmount.mockReset();
  mockUpdateProfile.mockReset();
  mockUpdateProfile.mockImplementation(async (payload) => payload);
  mockRequestPasswordChangeOtp.mockReset();
  mockRequestPasswordChangeOtp.mockResolvedValue({ verificationId: "OTP-PW-1", destination: "a***@example.com" });
  mockVerifyPasswordChangeOtp.mockReset();
  mockVerifyPasswordChangeOtp.mockResolvedValue({ verified: true });
  mockResetPasswordWithOtp.mockReset();
  mockResetPasswordWithOtp.mockResolvedValue({ message: "Password updated successfully." });
  getSecurityControlStatus.mockReset();
  getSecurityControlStatus.mockReturnValue(new Promise(() => {}));
});

describe("Admin Profile Edit Account", () => {
  test("opens with current profile data", () => {
    renderProfile();
    openEditAccount();

    expect(input("Edit first name")).toHaveValue("Admin");
    expect(input("Edit last name")).toHaveValue("One");
    expect(input("Edit email")).toHaveValue("admin@example.com");
    expect(input("Edit phone")).toHaveValue("09111111111");
  });

  test.each([
    ["blank first name", "Edit first name", "", "First name is required."],
    ["whitespace first name", "Edit first name", "   ", "First name is required."],
    ["blank last name", "Edit last name", "", "Last name is required."],
    ["whitespace last name", "Edit last name", "   ", "Last name is required."],
    ["invalid email", "Edit email", "not-an-email", "Please enter a valid email address."],
    ["invalid phone", "Edit phone", "123", "Contact number must be 11 digits and start with 09."],
  ])("rejects %s inline without calling update", async (_label, field, value, message) => {
    renderProfile();
    openEditAccount();

    fireEvent.change(input(field), { target: { value } });
    await saveChanges();

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Update your personal information")).toBeInTheDocument();
  });

  test.each([
    ["first name", "Edit first name", "Updated", { first: "Updated", last: "One", email: "admin@example.com", phone: "09111111111" }],
    ["last name", "Edit last name", "Updated", { first: "Admin", last: "Updated", email: "admin@example.com", phone: "09111111111" }],
    ["email", "Edit email", "Updated.Admin@Example.com", { first: "Admin", last: "One", email: "updated.admin@example.com", phone: "09111111111" }],
    ["phone", "Edit phone", "09998887777", { first: "Admin", last: "One", email: "admin@example.com", phone: "09998887777" }],
  ])("valid %s change calls updateProfile", async (_label, field, value, expectedPayload) => {
    renderProfile();
    openEditAccount();

    fireEvent.change(input(field), { target: { value } });
    await saveChanges();

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith(expectedPayload);
    expect(mockUpdateProfile.mock.calls[0][0]).not.toHaveProperty("role");
    expect(mockUpdateProfile.mock.calls[0][0]).not.toHaveProperty("userType");
    expect(mockUpdateProfile.mock.calls[0][0]).not.toHaveProperty("status");
  });

  test("multiple valid profile fields update together and reflected values are shown", async () => {
    mockUpdateProfile.mockResolvedValueOnce({
      first: "Updated",
      last: "Admin",
      email: "updated@example.com",
      phone: "09998887777",
    });
    renderProfile();
    openEditAccount();

    fireEvent.change(input("Edit first name"), { target: { value: " Updated " } });
    fireEvent.change(input("Edit last name"), { target: { value: " Admin " } });
    fireEvent.change(input("Edit email"), { target: { value: " Updated@Example.com " } });
    fireEvent.change(input("Edit phone"), { target: { value: "09998887777" } });
    await saveChanges();

    await waitFor(() => expect(screen.queryByText("Update your personal information")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Updated")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Admin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("updated@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("09998887777")).toBeInTheDocument();
  });

  test("first-name update does not surface Admin role validation for legacy admin role data", async () => {
    mockUpdateProfile.mockImplementationOnce(async (payload) => {
      if (Object.prototype.hasOwnProperty.call(payload, "role")) {
        throw new Error("Admin accounts must use the Admin role.");
      }
      return { ...session, ...payload, role: "Owner" };
    });
    renderProfile({ role: "Owner" });
    openEditAccount();

    fireEvent.change(input("Edit first name"), { target: { value: "Updated Admin" } });
    await saveChanges();

    await waitFor(() => expect(screen.queryByText("Admin accounts must use the Admin role.")).not.toBeInTheDocument());
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      first: "Updated Admin",
      last: "One",
      email: "admin@example.com",
      phone: "09111111111",
    });
    await waitFor(() => expect(screen.queryByText("Update your personal information")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Updated Admin")).toBeInTheDocument();
  });

  test("backend error keeps modal open and shows the error", async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error("That email is already registered."));
    renderProfile();
    openEditAccount();

    fireEvent.change(input("Edit email"), { target: { value: "duplicate@example.com" } });
    await saveChanges();

    expect(await screen.findByText("That email is already registered.")).toBeInTheDocument();
    expect(screen.getByText("Update your personal information")).toBeInTheDocument();
  });

  test("rapid Save Changes only submits one profile update", async () => {
    const deferred = createDeferred();
    mockUpdateProfile.mockReturnValueOnce(deferred.promise);
    renderProfile();
    openEditAccount();

    fireEvent.change(input("Edit first name"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/i }));

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    await act(async () => {
      deferred.resolve({ first: "Updated", last: "One", email: "admin@example.com", phone: "09111111111" });
      await deferred.promise;
    });
  });

  test("profile-only update does not require or send a password", async () => {
    renderProfile();
    openEditAccount();

    fireEvent.change(input("Edit first name"), { target: { value: "Updated" } });
    await saveChanges();

    expect(mockResetPasswordWithOtp).not.toHaveBeenCalled();
    expect(mockUpdateProfile.mock.calls[0][0]).not.toHaveProperty("password");
  });

  test("OTP-verified password change calls final password reset and does not send blank password to profile update", async () => {
    renderProfile();
    openEditAccount();
    await completeOtpVerification();

    fireEvent.change(input("New password"), { target: { value: "NewPass1!" } });
    fireEvent.change(input("Confirm new password"), { target: { value: "NewPass1!" } });
    await saveChanges();

    expect(mockRequestPasswordChangeOtp).toHaveBeenCalledWith({ email: "admin@example.com", channel: "email" });
    expect(mockVerifyPasswordChangeOtp).toHaveBeenCalledWith({ verificationId: "OTP-PW-1", otp: "123456" });
    expect(mockResetPasswordWithOtp).toHaveBeenCalledWith({ verificationId: "OTP-PW-1", password: "NewPass1!" });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  test("password below policy is rejected after OTP verification", async () => {
    renderProfile();
    openEditAccount();
    await completeOtpVerification();

    fireEvent.change(input("New password"), { target: { value: "short" } });
    fireEvent.change(input("Confirm new password"), { target: { value: "short" } });
    await saveChanges();

    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(mockResetPasswordWithOtp).not.toHaveBeenCalled();
  });

  test("incorrect OTP blocks password update", async () => {
    mockVerifyPasswordChangeOtp.mockRejectedValueOnce(new Error("Incorrect OTP. Please try again."));
    renderProfile();
    openEditAccount();

    fireEvent.click(screen.getByRole("button", { name: "Change Password →" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
      await Promise.resolve();
    });
    "123456".split("").forEach((digit, index) => {
      fireEvent.change(input(`Password OTP digit ${index + 1}`), { target: { value: digit } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));
      await Promise.resolve();
    });

    expect(screen.getByText("Incorrect OTP. Please try again.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(mockResetPasswordWithOtp).not.toHaveBeenCalled();
  });

  test("failure after OTP verification remains visible instead of silently doing nothing", async () => {
    mockResetPasswordWithOtp.mockRejectedValueOnce(new Error("This OTP has expired. Please request a new code."));
    renderProfile();
    openEditAccount();
    await completeOtpVerification();

    fireEvent.change(input("New password"), { target: { value: "NewPass1!" } });
    fireEvent.change(input("Confirm new password"), { target: { value: "NewPass1!" } });
    await saveChanges();

    expect(await screen.findByText("This OTP has expired. Please request a new code.")).toBeInTheDocument();
    expect(screen.getByText("Update your personal information")).toBeInTheDocument();
  });
});
