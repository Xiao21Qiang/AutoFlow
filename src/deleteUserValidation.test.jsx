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

const deactivatedStaffUser = {
  id: "STF-DEACT",
  name: "Dana Inactive",
  email: "dana.inactive@example.com",
  phone: "09444444444",
  userType: "Staff",
  role: "Marketing",
  status: "deactivated",
};

const deletedStaffUser = {
  id: "STF-DELETED",
  name: "Drew Deleted",
  email: "drew.deleted@example.com",
  phone: "09555555555",
  userType: "Staff",
  role: "Marketing",
  status: "deleted",
};

const mongoIdStaffUser = {
  _id: "mongo-staff-1",
  name: "Morgan Mongo",
  email: "morgan.mongo@example.com",
  phone: "09666666666",
  userType: "Staff",
  role: "Marketing",
  status: "active",
};

function renderUsers(users = [adminUser, staffUser, deactivatedStaffUser, deletedStaffUser], currentUser = adminUser) {
  mockUsersState = users;
  mockCurrentUser = currentUser;
  render(<AdminUsers />);
}

function rowForEmail(email) {
  return screen.getAllByText(email).map((element) => element.closest("tr")).find(Boolean);
}

function editButtonFor(email) {
  return within(rowForEmail(email)).getByRole("button", { name: /Edit/ });
}

function deleteButtonFor(email) {
  return within(rowForEmail(email)).getByRole("button", { name: "Delete" });
}

function openDeleteSecurityModal(email) {
  fireEvent.click(deleteButtonFor(email));
  expect(screen.getByRole("dialog", { name: "Confirm Delete" })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("dialog", { name: "Confirm Delete" })).getByRole("button", { name: "Delete" }));
  expect(screen.getByRole("dialog", { name: "Delete User" })).toBeInTheDocument();
}

async function confirmDeleteWithPassword(value = "AdminSpecial1!") {
  fireEvent.change(await screen.findByLabelText("Special Password"), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm Password" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setupDeleteSuccess(target = staffUser, users = [adminUser, staffUser, deactivatedStaffUser, deletedStaffUser]) {
  mockDeleteUser.mockImplementation(async (id) => {
    const deletedUser = { ...target, id: target.id || id, _id: target._id, status: "deleted", deletionMode: "soft" };
    mockUsersState = users.map((user) => (
      String(user.id || user._id) === String(id) ? deletedUser : user
    ));
    return { id: deletedUser.id, _id: deletedUser._id, status: "deleted", deletionMode: "soft" };
  });
}

beforeEach(() => {
  mockCreateEmployeeAccount.mockReset();
  mockUpdateUser.mockReset();
  mockDeleteUser.mockReset();
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
});

describe("Delete User terminal-state validation", () => {
  test("active and deactivated rows remain editable while deleted rows have a real disabled Edit button", () => {
    renderUsers();

    expect(editButtonFor(staffUser.email)).toBeEnabled();
    expect(deleteButtonFor(staffUser.email)).toBeEnabled();
    expect(editButtonFor(deactivatedStaffUser.email)).toBeEnabled();
    expect(deleteButtonFor(deactivatedStaffUser.email)).toBeEnabled();

    const deletedEdit = editButtonFor(deletedStaffUser.email);
    expect(deletedEdit).toBeDisabled();
    expect(deletedEdit).toHaveAttribute("title", "Deleted accounts cannot be edited.");
    fireEvent.click(deletedEdit);
    fireEvent.keyDown(deletedEdit, { key: "Enter", code: "Enter" });
    expect(screen.queryByRole("dialog", { name: "Edit User" })).not.toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test("correct Special Password deletes exactly one user, keeps the row visible, and disables Edit", async () => {
    setupDeleteSuccess();
    renderUsers();

    openDeleteSecurityModal(staffUser.email);
    await confirmDeleteWithPassword();

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith("STF-1", { specialPassword: "AdminSpecial1!" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete User" })).not.toBeInTheDocument());
    expect(within(rowForEmail(staffUser.email)).getByText("deleted")).toBeInTheDocument();
    expect(editButtonFor(staffUser.email)).toBeDisabled();
    expect(within(rowForEmail(deactivatedStaffUser.email)).getByText("deactivated")).toBeInTheDocument();
    expect(screen.getAllByText(staffUser.email)).toHaveLength(1);
  });

  test("incorrect Special Password keeps modal open, leaves status unchanged, and permits retry", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special password."));
    renderUsers();

    openDeleteSecurityModal(staffUser.email);
    await confirmDeleteWithPassword("wrong-password");

    expect(await screen.findByText("Incorrect admin special password.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Delete User" })).toBeInTheDocument();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(within(rowForEmail(staffUser.email)).getByText("active")).toBeInTheDocument();
    expect(editButtonFor(staffUser.email)).toBeEnabled();
  });

  test("blank password and empty submit show inline validation without verification or deletion", async () => {
    renderUsers();

    openDeleteSecurityModal(staffUser.email);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm Password" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText("Please fill out this field.")).toBeInTheDocument();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete User" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText("Enter special password").closest("form"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test("semantic submit after password verifies and deletes exactly once", async () => {
    setupDeleteSuccess();
    renderUsers();

    openDeleteSecurityModal(staffUser.email);
    fireEvent.change(await screen.findByPlaceholderText("Enter special password"), { target: { value: "AdminSpecial1!" } });
    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText("Enter special password").closest("form"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(editButtonFor(staffUser.email)).toBeDisabled());
  });

  test("rapid confirm attempts cannot create duplicate delete requests", async () => {
    let resolveDelete;
    mockDeleteUser.mockImplementation((id) => new Promise((resolve) => {
      resolveDelete = () => {
        mockUsersState = [adminUser, { ...staffUser, status: "deleted" }, deactivatedStaffUser, deletedStaffUser];
        resolve({ id, status: "deleted" });
      };
    }));
    validateSpecialCredential.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5)));
    renderUsers();

    openDeleteSecurityModal(staffUser.email);
    fireEvent.change(await screen.findByPlaceholderText("Enter special password"), { target: { value: "AdminSpecial1!" } });
    const confirmButton = screen.getByRole("button", { name: "Confirm Password" });
    await act(async () => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      fireEvent.submit(screen.getByPlaceholderText("Enter special password").closest("form"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveDelete();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  test("modal reset clears password and errors after close and reopen", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special password."));
    renderUsers();

    openDeleteSecurityModal(staffUser.email);
    await confirmDeleteWithPassword("wrong-password");
    expect(await screen.findByText("Incorrect admin special password.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete User" })).getByRole("button", { name: "x" }));

    openDeleteSecurityModal(staffUser.email);
    expect(screen.getByPlaceholderText("Enter special password")).toHaveValue("");
    expect(screen.queryByText("Incorrect admin special password.")).not.toBeInTheDocument();
  });

  test("deactivated users can still reactivate through valid Edit User flow", async () => {
    mockUpdateUser.mockImplementation(async (id, payload) => {
      const saved = { ...deactivatedStaffUser, ...payload, id };
      mockUsersState = [adminUser, staffUser, saved, deletedStaffUser];
      return saved;
    });
    renderUsers();

    fireEvent.click(editButtonFor(deactivatedStaffUser.email));
    expect(screen.getByRole("dialog", { name: "Edit User" })).toBeInTheDocument();
    fireEvent.change(document.getElementById("edit-user-status"), { target: { value: "active" } });
    fireEvent.click(screen.getByRole("button", { name: "Save User" }));
    await confirmDeleteWithPassword();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(mockUpdateUser).toHaveBeenCalledWith("STF-DEACT", expect.objectContaining({ status: "active" }));
  });

  test("authoritative deleted rows and Mongo-style IDs render disabled and target the right record", async () => {
    setupDeleteSuccess(mongoIdStaffUser, [adminUser, mongoIdStaffUser, deletedStaffUser]);
    renderUsers([adminUser, mongoIdStaffUser, deletedStaffUser]);

    expect(editButtonFor(deletedStaffUser.email)).toBeDisabled();
    openDeleteSecurityModal(mongoIdStaffUser.email);
    await confirmDeleteWithPassword();

    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith("mongo-staff-1", { specialPassword: "AdminSpecial1!" }));
    await waitFor(() => expect(editButtonFor(mongoIdStaffUser.email)).toBeDisabled());
    expect(screen.getAllByText(mongoIdStaffUser.email)).toHaveLength(1);
  });
});
