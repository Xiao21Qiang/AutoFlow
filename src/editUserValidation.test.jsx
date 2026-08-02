import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsers from "./screens/admin/AdminUsers";
import { validateSpecialCredential } from "./utils/reauth";

const mockCreateEmployeeAccount = jest.fn();
const mockUpdateUser = jest.fn();
const mockDeleteUser = jest.fn();

let mockUsersState = [];
let mockCurrentUser = {};

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user) => String(user?.name || user?.email || "").trim(),
  validateSpecialCredential: jest.fn(),
  verifyCurrentPassword: jest.fn(),
}));

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    users: mockUsersState,
    currentUser: mockCurrentUser,
    updateUser: mockUpdateUser,
    deleteUser: mockDeleteUser,
    createEmployeeAccount: mockCreateEmployeeAccount,
  }),
}));

const adminUser = {
  id: "ADM-1",
  name: "Admin One",
  email: "admin@example.com",
  phone: "09111111111",
  userType: "Admin",
  role: "Admin",
  status: "active",
};

const staffUser = {
  id: "STF-1",
  name: "Casey Staff",
  email: "casey.staff@example.com",
  phone: "09123456789",
  userType: "Staff",
  role: "Junior Detailer",
  status: "active",
};

const otherStaffUser = {
  id: "STF-2",
  name: "Other Staff",
  email: "other.staff@example.com",
  phone: "09999999999",
  userType: "Staff",
  role: "Marketing",
  status: "active",
};

const customerUser = {
  id: "CUS-1",
  name: "Customer One",
  email: "customer@example.com",
  userType: "Customer",
  role: "New",
  status: "active",
};

function renderUsers(currentUser = adminUser) {
  mockCurrentUser = currentUser;
  render(<AdminUsers />);
}

function rowForEmail(email) {
  return screen.getByText(email).closest("tr");
}

function openEditUser(user = staffUser, currentUser = adminUser) {
  renderUsers(currentUser);
  fireEvent.click(within(rowForEmail(user.email)).getByRole("button", { name: "Edit" }));
}

function saveButton() {
  return screen.getByRole("button", { name: /Save User|Saving/i });
}

function editForm() {
  return saveButton().closest("form");
}

function editInput(id) {
  return document.getElementById(id);
}

async function confirmSpecialPassword(value = "AdminSpecial1!") {
  fireEvent.change(await screen.findByLabelText("Special Password"), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm Password" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function changeValidName(value = "Casey Updated") {
  fireEvent.change(editInput("edit-user-name"), { target: { value } });
}

beforeEach(() => {
  mockUsersState = [adminUser, staffUser, otherStaffUser];
  mockCurrentUser = adminUser;
  mockCreateEmployeeAccount.mockReset();
  mockUpdateUser.mockReset();
  mockDeleteUser.mockReset();
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
});

describe("Edit User modal validation", () => {
  test("valid update submits once, preserves ID, leaves password blank, and updates the existing row once", async () => {
    let resolveUpdate;
    mockUpdateUser.mockImplementation((id, payload) => new Promise((resolve) => {
      resolveUpdate = () => {
        const saved = { ...staffUser, ...payload, id, password: undefined };
        mockUsersState = [adminUser, saved, otherStaffUser];
        resolve(saved);
      };
    }));

    openEditUser();
    expect(screen.getByRole("dialog", { name: "Edit User" })).toBeInTheDocument();
    expect(editInput("edit-user-name")).toHaveValue("Casey Staff");
    expect(editInput("edit-user-email")).toHaveValue("casey.staff@example.com");
    expect(editInput("edit-user-password")).toHaveValue("");

    changeValidName();
    fireEvent.change(editInput("edit-user-email"), { target: { value: "Casey.Updated@Example.com" } });
    fireEvent.change(editInput("edit-user-phone"), { target: { value: "09876543210" } });

    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    expect(screen.getByRole("dialog", { name: "Update User" })).toBeInTheDocument();
    await confirmSpecialPassword();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(mockUpdateUser).toHaveBeenCalledWith("STF-1", expect.objectContaining({
      id: "STF-1",
      name: "Casey Updated",
      email: "casey.updated@example.com",
      phone: "09876543210",
      userType: "Staff",
      role: "Junior Detailer",
      status: "active",
      specialPassword: "AdminSpecial1!",
    }));
    expect(mockUpdateUser.mock.calls[0][1]).not.toHaveProperty("password");

    await act(async () => {
      resolveUpdate();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit User" })).not.toBeInTheDocument());
    expect(screen.getAllByText("Casey Updated")).toHaveLength(1);
    expect(screen.getByText("casey.updated@example.com")).toBeInTheDocument();
  });

  test.each(["", "   "])("blank name value %s shows inline validation and blocks update", (name) => {
    openEditUser();
    fireEvent.change(editInput("edit-user-name"), { target: { value: name } });
    fireEvent.blur(editInput("edit-user-name"));

    expect(screen.getByText("Full name is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(editForm());
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Update User" })).not.toBeInTheDocument();
  });

  test.each(["invalid-email", "user@", "@example.com", "user@example", "user example@example.com"])("malformed email %s disables Save User", (email) => {
    openEditUser();
    fireEvent.change(editInput("edit-user-email"), { target: { value: email } });
    fireEvent.blur(editInput("edit-user-email"));

    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(editForm());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test("keeping own email is allowed but another normalized email is rejected", () => {
    openEditUser();
    fireEvent.change(editInput("edit-user-email"), { target: { value: " Casey.Staff@Example.com " } });
    expect(saveButton()).toBeEnabled();

    fireEvent.change(editInput("edit-user-email"), { target: { value: " other.staff@example.com " } });
    fireEvent.blur(editInput("edit-user-email"));
    expect(screen.getByText("That email is already registered.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test.each(["123", "0912345678", "08123456789"])("invalid phone %s disables Save User", (phone) => {
    openEditUser();
    fireEvent.change(editInput("edit-user-phone"), { target: { value: phone } });
    fireEvent.blur(editInput("edit-user-phone"));

    expect(screen.getByText("Please enter a valid phone number.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test("duplicate phone is rejected while unchanged own phone is allowed", () => {
    openEditUser();
    fireEvent.change(editInput("edit-user-phone"), { target: { value: "09123456789" } });
    expect(saveButton()).toBeEnabled();

    fireEvent.change(editInput("edit-user-phone"), { target: { value: "09999999999" } });
    fireEvent.blur(editInput("edit-user-phone"));
    expect(screen.getByText("That contact number is already registered.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test("valid role change requires confirmation; incorrect confirmation performs no update", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special password."));
    openEditUser();
    fireEvent.change(editInput("edit-user-role"), { target: { value: "Senior Detailer" } });

    fireEvent.click(saveButton());
    expect(screen.getByRole("dialog", { name: "Update User" })).toBeInTheDocument();
    await confirmSpecialPassword("wrong-password");

    expect(await screen.findByText("Incorrect admin special password.")).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test("valid role and status changes update exactly one user", async () => {
    mockUpdateUser.mockImplementation(async (id, payload) => {
      const saved = { ...staffUser, ...payload, id };
      mockUsersState = [adminUser, saved, otherStaffUser];
      return saved;
    });

    openEditUser();
    fireEvent.change(editInput("edit-user-role"), { target: { value: "Senior Detailer" } });
    fireEvent.change(editInput("edit-user-status"), { target: { value: "deactivated" } });
    fireEvent.click(saveButton());
    await confirmSpecialPassword();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(mockUpdateUser).toHaveBeenCalledWith("STF-1", expect.objectContaining({
      role: "Senior Detailer",
      status: "deactivated",
    }));
  });

  test("invalid new password disables Save User but blank new password allows other edits", () => {
    openEditUser();
    fireEvent.change(editInput("edit-user-password"), { target: { value: "password" } });
    fireEvent.blur(editInput("edit-user-password"));

    expect(screen.getByText("At least 1 uppercase letter.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(editInput("edit-user-password"), { target: { value: "" } });
    changeValidName();
    expect(saveButton()).toBeEnabled();
  });

  test("valid new password is submitted safely after confirmation", async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...staffUser, name: "Casey Staff" });
    openEditUser();
    fireEvent.change(editInput("edit-user-password"), { target: { value: "NewPass1!" } });
    fireEvent.click(saveButton());
    await confirmSpecialPassword();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(mockUpdateUser.mock.calls[0][1]).toEqual(expect.objectContaining({ password: "NewPass1!" }));
  });

  test("multiple invalid fields show together and modal reset clears errors and password", () => {
    openEditUser();
    fireEvent.change(editInput("edit-user-name"), { target: { value: "" } });
    fireEvent.change(editInput("edit-user-email"), { target: { value: "bad-email" } });
    fireEvent.change(editInput("edit-user-phone"), { target: { value: "123" } });
    fireEvent.change(editInput("edit-user-password"), { target: { value: "password" } });
    fireEvent.submit(editForm());

    const form = within(editForm());
    expect(form.getByText("Full name is required.")).toBeInTheDocument();
    expect(form.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(form.getByText("Please enter a valid phone number.")).toBeInTheDocument();
    expect(form.getByText("At least 1 uppercase letter.")).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(rowForEmail(otherStaffUser.email)).getByRole("button", { name: "Edit" }));
    expect(editInput("edit-user-name")).toHaveValue("Other Staff");
    expect(editInput("edit-user-password")).toHaveValue("");
    expect(within(editForm()).queryByText("Full name is required.")).not.toBeInTheDocument();
  });

  test("rapid confirmations make one update request", async () => {
    let resolveUpdate;
    mockUpdateUser.mockImplementation((id, payload) => new Promise((resolve) => {
      resolveUpdate = () => resolve({ ...staffUser, ...payload, id });
    }));

    openEditUser();
    changeValidName();
    fireEvent.click(saveButton());
    fireEvent.change(await screen.findByLabelText("Special Password"), { target: { value: "AdminSpecial1!" } });
    const confirmButton = screen.getByRole("button", { name: "Confirm Password" });
    await act(async () => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveUpdate();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  test.each([
    ["Staff", { ...staffUser, id: "STF-AUTH" }],
    ["Customer", customerUser],
  ])("%s cannot access arbitrary Edit User actions", (_label, currentUser) => {
    renderUsers(currentUser);

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
