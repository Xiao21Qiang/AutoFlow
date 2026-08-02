import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsers from "./screens/admin/AdminUsers";
import { verifyCurrentPassword } from "./utils/reauth";

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
  userType: "Admin",
  role: "Admin",
  status: "active",
};

const staffUser = {
  id: "STF-AUTH",
  name: "Staff One",
  email: "staff@example.com",
  userType: "Staff",
  role: "General Manager",
  status: "active",
};

const customerUser = {
  id: "CUS-AUTH",
  name: "Customer One",
  email: "customer@example.com",
  userType: "Customer",
  role: "New",
  status: "active",
};

function employeeRecord(overrides = {}) {
  return {
    id: "STF-1",
    name: "Casey Staff",
    email: "casey.staff@example.com",
    phone: "09123456789",
    userType: "Staff",
    role: "Junior Detailer",
    status: "active",
    ...overrides,
  };
}

function renderUsers(currentUser = adminUser) {
  mockCurrentUser = currentUser;
  render(<AdminUsers />);
}

function openEmployeeModal(currentUser = adminUser) {
  renderUsers(currentUser);
  fireEvent.click(screen.getByRole("button", { name: "Add Employee Account" }));
}

function createButton() {
  return screen.getByRole("button", { name: /Create Employee|Creating/i });
}

function employeeForm() {
  return createButton().closest("form");
}

function employeeInput(id) {
  return document.getElementById(id);
}

function fillValidEmployee(overrides = {}) {
  const values = {
    name: "Casey Staff",
    email: "casey.staff@example.com",
    phone: "09123456789",
    role: "Junior Detailer",
    password: "StaffPass1!",
    ...overrides,
  };

  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: values.name } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: values.email } });
  fireEvent.change(screen.getByLabelText("Contact Number"), { target: { value: values.phone } });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: values.role } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: values.password } });
  return values;
}

async function confirmCurrentPassword(value = "AdminPass1!") {
  fireEvent.change(await screen.findByLabelText("Current Account Password"), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Verify Password" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockUsersState = [adminUser];
  mockCurrentUser = adminUser;
  mockCreateEmployeeAccount.mockReset();
  mockUpdateUser.mockReset();
  mockDeleteUser.mockReset();
  verifyCurrentPassword.mockReset();
  verifyCurrentPassword.mockResolvedValue(true);
});

describe("Add Employee Account modal validation", () => {
  test("starts with Create Employee genuinely disabled on the empty form", () => {
    openEmployeeModal();

    expect(screen.getByRole("dialog", { name: "Add Employee Account" })).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  test("creates one valid employee after current-password confirmation and shows the authoritative row once", async () => {
    let resolveCreate;
    mockCreateEmployeeAccount.mockImplementation((payload) => new Promise((resolve) => {
      resolveCreate = () => {
        const saved = employeeRecord({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
        });
        mockUsersState = [adminUser, saved];
        resolve(saved);
      };
    }));

    openEmployeeModal();
    fillValidEmployee({ name: "  Casey  Staff  ", email: "Casey.Staff@Example.com" });

    expect(createButton()).toBeEnabled();
    fireEvent.click(createButton());
    expect(screen.getByRole("dialog", { name: "Create Employee Account" })).toBeInTheDocument();

    await confirmCurrentPassword();

    await waitFor(() => expect(mockCreateEmployeeAccount).toHaveBeenCalledTimes(1));
    expect(mockCreateEmployeeAccount).toHaveBeenCalledWith(expect.objectContaining({
      name: "Casey Staff",
      email: "casey.staff@example.com",
      phone: "09123456789",
      role: "Junior Detailer",
      password: "StaffPass1!",
      currentPassword: "AdminPass1!",
    }));
    await act(async () => {
      resolveCreate();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Employee Account" })).not.toBeInTheDocument());
    expect(screen.getAllByText("Casey Staff")).toHaveLength(1);
    expect(screen.getByText("casey.staff@example.com")).toBeInTheDocument();
    expect(within(screen.getByText("Casey Staff").closest("tr")).getByText("Junior Detailer")).toBeInTheDocument();
  });

  test("blank full name displays inline validation, disables submit, and never opens confirmation", () => {
    openEmployeeModal();
    fillValidEmployee({ name: "" });
    fireEvent.blur(screen.getByLabelText("Full Name"));

    expect(screen.getAllByText("Full name is required.").length).toBeGreaterThan(0);
    expect(createButton()).toBeDisabled();
    fireEvent.submit(employeeForm());
    expect(screen.getAllByText("Full name is required.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Create Employee Account" })).not.toBeInTheDocument();
    expect(mockCreateEmployeeAccount).not.toHaveBeenCalled();
  });

  test("whitespace-only full name is treated as blank", () => {
    openEmployeeModal();
    fillValidEmployee({ name: "   " });
    fireEvent.blur(screen.getByLabelText("Full Name"));

    expect(screen.getByText("Full name is required.")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    expect(mockCreateEmployeeAccount).not.toHaveBeenCalled();
  });

  test.each(["", "   "])("blank email value %s displays inline required validation and blocks creation", (email) => {
    openEmployeeModal();
    fillValidEmployee({ email });
    fireEvent.blur(screen.getByLabelText("Email"));

    expect(screen.getAllByText("Email is required.").length).toBeGreaterThan(0);
    expect(createButton()).toBeDisabled();
    fireEvent.submit(employeeForm());
    expect(mockCreateEmployeeAccount).not.toHaveBeenCalled();
  });

  test.each(["invalid-email", "user@", "@example.com", "user@example", "user example@example.com"])("malformed email %s displays inline invalid-email validation and blocks creation", (email) => {
    openEmployeeModal();
    fillValidEmployee({ email });
    fireEvent.blur(screen.getByLabelText("Email"));

    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    fireEvent.submit(employeeForm());
    expect(mockCreateEmployeeAccount).not.toHaveBeenCalled();
  });

  test("clears name and email errors independently as valid values are entered", () => {
    openEmployeeModal();
    fireEvent.submit(employeeForm());

    expect(screen.getAllByText("Full name is required.").length).toBeGreaterThan(0);
    expect(screen.getByText("Email is required.")).toBeInTheDocument();

    fireEvent.change(employeeInput("employee-full-name"), { target: { value: "Casey Staff" } });
    expect(within(employeeForm()).queryByText("Full name is required.")).not.toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();

    fireEvent.change(employeeInput("employee-email"), { target: { value: "casey.staff@example.com" } });
    expect(screen.queryAllByText("Email is required.")).toHaveLength(0);
    fireEvent.change(employeeInput("employee-phone"), { target: { value: "09123456789" } });
    fireEvent.change(employeeInput("employee-password"), { target: { value: "StaffPass1!" } });
    expect(createButton()).toBeEnabled();
  });

  test("multiple invalid fields show together after attempted submit and no API request is sent", () => {
    openEmployeeModal();
    fireEvent.submit(employeeForm());

    expect(screen.getAllByText("Full name is required.").length).toBeGreaterThan(0);
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(mockCreateEmployeeAccount).not.toHaveBeenCalled();
  });

  test("closing and reopening clears stale Add Employee values and validation errors", () => {
    openEmployeeModal();
    fireEvent.submit(employeeForm());
    expect(screen.getAllByText("Full name is required.").length).toBeGreaterThan(0);
    fireEvent.change(employeeInput("employee-email"), { target: { value: "bad-email" } });
    expect(employeeInput("employee-email")).toHaveValue("bad-email");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Employee Account" }));

    expect(within(employeeForm()).queryByText("Full name is required.")).not.toBeInTheDocument();
    expect(within(employeeForm()).queryByText("Please enter a valid email address.")).not.toBeInTheDocument();
    expect(employeeInput("employee-email")).toHaveValue("");
    expect(createButton()).toBeDisabled();
  });

  test("rapid confirmation clicks still create only one employee request", async () => {
    let resolveCreate;
    mockCreateEmployeeAccount.mockImplementation((payload) => new Promise((resolve) => {
      resolveCreate = () => {
        mockUsersState = [adminUser, employeeRecord({ email: payload.email })];
        resolve(mockUsersState[1]);
      };
    }));

    openEmployeeModal();
    fillValidEmployee();
    fireEvent.click(createButton());
    fireEvent.change(await screen.findByLabelText("Current Account Password"), { target: { value: "AdminPass1!" } });

    const verifyButton = screen.getByRole("button", { name: "Verify Password" });
    await act(async () => {
      fireEvent.click(verifyButton);
      fireEvent.click(verifyButton);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(mockCreateEmployeeAccount).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveCreate();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  test("backend duplicate-email conflict is displayed safely and does not add a duplicate row", async () => {
    mockUsersState = [adminUser, employeeRecord({ id: "STF-EXISTING", email: "existing@example.com" })];
    mockCreateEmployeeAccount.mockRejectedValueOnce(new Error("That email is already registered."));

    openEmployeeModal();
    fillValidEmployee({ email: "Existing@Example.com" });
    fireEvent.click(createButton());
    await confirmCurrentPassword();

    await waitFor(() => expect(mockCreateEmployeeAccount).toHaveBeenCalledTimes(1));
    expect(within(employeeForm()).getByText("That email is already registered.")).toBeInTheDocument();
    expect(screen.getAllByText("existing@example.com")).toHaveLength(1);
  });

  test("valid employee form opens current-password confirmation but incorrect confirmation creates no employee", async () => {
    verifyCurrentPassword.mockRejectedValueOnce(new Error("Current account password is incorrect."));

    openEmployeeModal();
    fillValidEmployee();
    fireEvent.click(createButton());
    expect(screen.getByRole("dialog", { name: "Create Employee Account" })).toBeInTheDocument();

    await confirmCurrentPassword("wrong-password");

    expect(await screen.findByText("Current account password is incorrect.")).toBeInTheDocument();
    expect(mockCreateEmployeeAccount).not.toHaveBeenCalled();
    expect(screen.queryByText("Casey Staff")).not.toBeInTheDocument();
  });

  test.each([
    ["Staff", staffUser],
    ["Customer", customerUser],
  ])("%s cannot access Add Employee Account", (_label, currentUser) => {
    renderUsers(currentUser);

    expect(screen.queryByRole("button", { name: "Add Employee Account" })).not.toBeInTheDocument();
  });
});
