import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StaffProfile from "./screens/staff/StaffProfile";

const mockUpdateProfile = jest.fn();
const mockRequestPasswordChangeOtp = jest.fn();
const mockVerifyPasswordChangeOtp = jest.fn();
const mockResetPasswordWithOtp = jest.fn();

let mockCurrentUser;

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    currentUser: mockCurrentUser,
    updateProfile: mockUpdateProfile,
    requestPasswordChangeOtp: mockRequestPasswordChangeOtp,
    verifyPasswordChangeOtp: mockVerifyPasswordChangeOtp,
    resetPasswordWithOtp: mockResetPasswordWithOtp,
  }),
}));

const salesAssociate = {
  id: "SA-1",
  email: "sales@example.com",
  name: "Sales Associate",
  first: "Sales",
  last: "Associate",
  phone: "09170000001",
  userType: "Staff",
  role: "Sales Associate",
  status: "active",
};

const generalManager = {
  id: "GM-1",
  email: "gm@example.com",
  name: "General Manager",
  first: "General",
  last: "Manager",
  phone: "09170000002",
  userType: "Staff",
  role: "General Manager",
  status: "active",
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

function renderProfile(user = salesAssociate) {
  mockCurrentUser = user;
  render(<StaffProfile session={user} />);
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

beforeEach(() => {
  mockUpdateProfile.mockReset();
  mockUpdateProfile.mockImplementation(async (payload) => payload);
  mockRequestPasswordChangeOtp.mockReset();
  mockRequestPasswordChangeOtp.mockResolvedValue({ verificationId: "OTP-SA-1", destination: "s***@example.com" });
  mockVerifyPasswordChangeOtp.mockReset();
  mockVerifyPasswordChangeOtp.mockResolvedValue({ verified: true });
  mockResetPasswordWithOtp.mockReset();
  mockResetPasswordWithOtp.mockResolvedValue({ message: "Password updated successfully." });
});

describe("Sales Associate Staff Profile parity", () => {
  test("renders canonical Staff self-profile fields without Admin-only profile controls", () => {
    renderProfile();

    expect(screen.getByDisplayValue("Sales")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Associate")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sales@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("09170000001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Account" })).toBeInTheDocument();

    for (const text of [
      "Required Down Payment",
      "Security Controls",
      "Admin Special PIN",
      "Admin Special Password",
      "Staff Special PIN",
      "Staff Special Password",
      "User Type",
      "Employee Role",
      "Status",
      "Active State",
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  test("Sales Associate update submits only permitted self-profile fields and reflects refreshed values", async () => {
    mockUpdateProfile.mockResolvedValueOnce({
      ...salesAssociate,
      first: "Sasha",
      last: "Associate",
      email: "sasha@example.com",
      phone: "09179998888",
      userType: "Staff",
      role: "Sales Associate",
      status: "active",
    });
    renderProfile();
    openEditAccount();

    fireEvent.change(input("Edit first name"), { target: { value: "  Sasha  " } });
    fireEvent.change(input("Edit email"), { target: { value: " Sasha@Example.com " } });
    fireEvent.change(input("Edit phone"), { target: { value: "0917-999-8888" } });
    await saveChanges();

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      first: "Sasha",
      last: "Associate",
      email: "sasha@example.com",
      phone: "09179998888",
    });
    const payload = mockUpdateProfile.mock.calls[0][0];
    for (const protectedField of ["id", "_id", "role", "userType", "employeeRole", "status", "isActive", "password"]) {
      expect(payload).not.toHaveProperty(protectedField);
    }

    await waitFor(() => expect(screen.queryByText("Update your personal information")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Sasha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sasha@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("09179998888")).toBeInTheDocument();
  });

  test.each([
    ["blank first name", "Edit first name", "   ", "First name is required."],
    ["blank last name", "Edit last name", "   ", "Last name is required."],
    ["malformed email", "Edit email", "sales@", "Please enter a valid email address."],
    ["invalid phone", "Edit phone", "0917", "Contact number must be 11 digits and start with 09."],
  ])("rejects %s inline without browser alerts", async (_label, field, value, message) => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    renderProfile();
    openEditAccount();

    fireEvent.change(input(field), { target: { value } });
    await saveChanges();

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test("rapid Sales Associate Save clicks submit one profile update", async () => {
    const deferred = createDeferred();
    mockUpdateProfile.mockReturnValueOnce(deferred.promise);
    renderProfile();
    openEditAccount();

    fireEvent.change(input("Edit first name"), { target: { value: "Sasha" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/i }));

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await act(async () => {
      deferred.resolve({ ...salesAssociate, first: "Sasha" });
      await deferred.promise;
    });
  });

  test("General Manager uses the same Staff self-profile field set without Admin-only controls", async () => {
    renderProfile(generalManager);
    openEditAccount();

    expect(input("Edit first name")).toHaveValue("General");
    expect(input("Edit last name")).toHaveValue("Manager");
    expect(input("Edit email")).toHaveValue("gm@example.com");
    expect(input("Edit phone")).toHaveValue("09170000002");
    expect(screen.queryByText("Required Down Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Security Controls")).not.toBeInTheDocument();
  });
});
