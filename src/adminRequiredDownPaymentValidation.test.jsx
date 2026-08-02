import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminProfile from "./screens/admin/AdminProfile";
import { getSecurityControlStatus, validateSpecialCredential } from "./utils/reauth";

const mockUpdateRequiredDownPaymentAmount = jest.fn();
const mockUpdateProfile = jest.fn();
const mockRequestPasswordChangeOtp = jest.fn();
const mockVerifyPasswordChangeOtp = jest.fn();
const mockResetPasswordWithOtp = jest.fn();

let mockSettings;
let mockCurrentUser;

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user) => String(user?.name || user?.email || "").trim(),
  getSecurityControlStatus: jest.fn(() => Promise.resolve({
    adminSpecialPinConfigured: true,
    adminSpecialPasswordConfigured: true,
    staffSpecialPinConfigured: true,
    staffSpecialPasswordConfigured: true,
    requiredDownPaymentAmount: 500,
  })),
  getSpecialPasswordStatus: () => "Configured",
  getSpecialPinStatus: () => "Configured",
  updateSecurityControls: jest.fn(),
  validateSpecialCredential: jest.fn(),
  verifyCurrentPassword: jest.fn(),
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

function renderProfile() {
  render(<AdminProfile session={session} />);
}

function amountInput() {
  return screen.getByLabelText("Required Down Payment Amount");
}

function saveAmountButton() {
  return screen.getByRole("button", { name: /Save Amount|Saving/i });
}

function downPaymentForm() {
  return saveAmountButton().closest("form");
}

function expectCurrentAmount(amount) {
  expect(screen.getByText((_content, element) =>
    element?.tagName.toLowerCase() === "span" &&
    element.textContent === `Current: ₱${amount}`
  )).toBeInTheDocument();
}

async function openPasswordConfirmation(amount = "750") {
  fireEvent.change(amountInput(), { target: { value: amount } });
  fireEvent.submit(downPaymentForm());
  return screen.findByRole("dialog", { name: "Update Required Down Payment" });
}

async function confirmPassword(value = "AdminSpecial1!") {
  const dialog = screen.getByRole("dialog", { name: "Update Required Down Payment" });
  fireEvent.change(within(dialog).getByLabelText("Special Password"), { target: { value } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Password" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockSettings = { requiredDownPaymentAmount: 500 };
  mockCurrentUser = session;
  mockUpdateRequiredDownPaymentAmount.mockReset();
  mockUpdateProfile.mockReset();
  mockRequestPasswordChangeOtp.mockReset();
  mockVerifyPasswordChangeOtp.mockReset();
  mockResetPasswordWithOtp.mockReset();
  getSecurityControlStatus.mockReset();
  getSecurityControlStatus.mockReturnValue(new Promise(() => {}));
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
});

describe("Admin required down payment validation", () => {
  test("valid positive amount and correct Admin Special Password saves once and displays the new value", async () => {
    mockUpdateRequiredDownPaymentAmount.mockResolvedValueOnce({ requiredDownPaymentAmount: 750 });
    renderProfile();

    expect(amountInput()).toHaveValue("500");
    expect(saveAmountButton()).toBeEnabled();

    await openPasswordConfirmation("750");
    await confirmPassword();

    await waitFor(() => expect(mockUpdateRequiredDownPaymentAmount).toHaveBeenCalledTimes(1));
    expect(mockUpdateRequiredDownPaymentAmount).toHaveBeenCalledWith(750, "AdminSpecial1!");
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Required down payment amount updated.")).toBeInTheDocument();
    expectCurrentAmount(750);
    expect(screen.queryByRole("dialog", { name: "Update Required Down Payment" })).not.toBeInTheDocument();
  });

  test("valid amount and incorrect Admin Special Password leaves the modal open without updating", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special password."));
    renderProfile();

    await openPasswordConfirmation("700");
    await confirmPassword("wrong-password");

    expect(await screen.findByText("Incorrect admin special password.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Update Required Down Payment" })).toBeInTheDocument();
    expect(mockUpdateRequiredDownPaymentAmount).not.toHaveBeenCalled();
    expectCurrentAmount(500);
  });

  test.each([
    ["blank amount", "", "Required down payment is required."],
    ["whitespace-only amount", "   ", "Required down payment is required."],
    ["zero amount", "0", "Required down payment must be greater than zero."],
    ["zero decimal amount", "0.00", "Required down payment must be greater than zero."],
    ["negative one", "-1", "Required down payment must be greater than zero."],
    ["negative cent", "-0.01", "Required down payment must be greater than zero."],
    ["negative amount", "-100", "Required down payment must be greater than zero."],
    ["non-numeric amount", "abc", "Required down payment must be greater than zero."],
    ["NaN amount", "NaN", "Required down payment must be greater than zero."],
    ["Infinity amount", "Infinity", "Required down payment must be greater than zero."],
  ])("%s is rejected before password confirmation or update", (_label, value, message) => {
    renderProfile();

    fireEvent.change(amountInput(), { target: { value } });
    fireEvent.blur(amountInput());

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(amountInput()).toHaveAttribute("aria-invalid", "true");
    expect(saveAmountButton()).toBeDisabled();

    fireEvent.submit(downPaymentForm());

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Update Required Down Payment" })).not.toBeInTheDocument();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockUpdateRequiredDownPaymentAmount).not.toHaveBeenCalled();
    expectCurrentAmount(500);
  });

  test("amount error clears after entering a valid positive amount", () => {
    renderProfile();

    fireEvent.change(amountInput(), { target: { value: "0" } });
    fireEvent.blur(amountInput());
    expect(screen.getByText("Required down payment must be greater than zero.")).toBeInTheDocument();
    expect(saveAmountButton()).toBeDisabled();

    fireEvent.change(amountInput(), { target: { value: "125.50" } });

    expect(screen.queryByText("Required down payment must be greater than zero.")).not.toBeInTheDocument();
    expect(saveAmountButton()).toBeEnabled();
  });

  test("blank password shows persistent inline validation and performs no update", async () => {
    renderProfile();

    const dialog = await openPasswordConfirmation("650");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Password" }));

    expect(await within(dialog).findByText("Please fill out this field.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Update Required Down Payment" })).toBeInTheDocument();
    expect(mockUpdateRequiredDownPaymentAmount).not.toHaveBeenCalled();
  });

  test("pressing Enter with a correct password uses the same submit path and updates once", async () => {
    mockUpdateRequiredDownPaymentAmount.mockResolvedValueOnce({ requiredDownPaymentAmount: 900 });
    renderProfile();

    const dialog = await openPasswordConfirmation("900");
    fireEvent.change(within(dialog).getByLabelText("Special Password"), { target: { value: "AdminSpecial1!" } });
    await act(async () => {
      fireEvent.submit(within(dialog).getByLabelText("Special Password").closest("form"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(mockUpdateRequiredDownPaymentAmount).toHaveBeenCalledTimes(1));
    expect(mockUpdateRequiredDownPaymentAmount).toHaveBeenCalledWith(900, "AdminSpecial1!");
  });

  test("rapid confirmation attempts create one update request", async () => {
    const deferred = createDeferred();
    mockUpdateRequiredDownPaymentAmount.mockReturnValueOnce(deferred.promise);
    renderProfile();

    const dialog = await openPasswordConfirmation("850");
    fireEvent.change(within(dialog).getByLabelText("Special Password"), { target: { value: "AdminSpecial1!" } });
    const confirmButton = within(dialog).getByRole("button", { name: "Confirm Password" });

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.submit(within(dialog).getByLabelText("Special Password").closest("form"));

    await waitFor(() => expect(mockUpdateRequiredDownPaymentAmount).toHaveBeenCalledTimes(1));
    await act(async () => {
      deferred.resolve({ requiredDownPaymentAmount: 850 });
      await deferred.promise;
    });
  });

  test("closing and reopening password confirmation resets password validation state", async () => {
    renderProfile();

    let dialog = await openPasswordConfirmation("625");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Password" }));
    expect(await within(dialog).findByText("Please fill out this field.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Update Required Down Payment" })).not.toBeInTheDocument());

    dialog = await openPasswordConfirmation("625");
    expect(within(dialog).queryByText("Please fill out this field.")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Special Password")).toHaveValue("");
  });
});
