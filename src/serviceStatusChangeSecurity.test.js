import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminServices from "./screens/admin/AdminServices";
import StaffServices from "./screens/staff/StaffServices";
import { validateSpecialCredential } from "./utils/reauth";

const mockCreateService = jest.fn();
const mockUpdateService = jest.fn();
const mockToggleService = jest.fn();
const mockDeleteService = jest.fn();
const mockCanPerformAction = jest.fn();

let mockServicesState = [];
let mockData = {};

const baseServices = [
  {
    id: "SVC-1",
    name: "Car Wash",
    desc: "Exterior wash",
    category: "Wash",
    serviceType: "Basic Service",
    enabled: true,
    price: 500,
    priceBySize: { sedanSmallCar: 500, midsizePickupMpv: 600, suv: 700, xlVanSemiTruck: 800 },
    mins: 60,
    allowedArrivalTimes: ["08:00", "09:00"],
    consumablesBySize: { Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } },
  },
];

const mockStockItems = [{ id: "STK-1", name: "Soap", currentStock: 12 }];

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    services: mockServicesState,
    stockMonitoring: mockStockItems,
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createService: mockCreateService,
    updateService: mockUpdateService,
    toggleService: mockToggleService,
    deleteService: mockDeleteService,
    ...mockData,
  }),
}));

jest.mock("./utils/rbac", () => {
  const actual = jest.requireActual("./utils/rbac");
  return {
    ...actual,
    canPerformAction: (...args) => mockCanPerformAction(...args),
  };
});

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user) => String(user?.name || user?.email || "").trim(),
  validateSpecialCredential: jest.fn(),
  verifyCurrentPassword: jest.fn(),
}));

function resetServices() {
  mockServicesState = baseServices.map((service) => ({
    ...service,
    priceBySize: { ...service.priceBySize },
    allowedArrivalTimes: [...service.allowedArrivalTimes],
    consumablesBySize: { Soap: { ...service.consumablesBySize.Soap } },
  }));
}

function openAdminStatusModal() {
  render(<AdminServices />);
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
}

function openStaffStatusModal() {
  render(<StaffServices />);
}

function pinInput() {
  return screen.getByLabelText("Special PIN");
}

function confirmPin() {
  return screen.getByRole("button", { name: "Confirm PIN" });
}

function emptyFieldError() {
  return screen.queryByText("Please fill out this field.");
}

function expectStatusEnabled() {
  expect(screen.getByText("Enabled")).toBeInTheDocument();
  expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
}

beforeEach(() => {
  resetServices();
  mockData = {};
  mockCreateService.mockReset();
  mockUpdateService.mockReset();
  mockToggleService.mockReset();
  mockDeleteService.mockReset();
  mockCanPerformAction.mockReset();
  mockCanPerformAction.mockReturnValue(true);
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
  mockToggleService.mockImplementation(async (service) => {
    const target = mockServicesState.find((item) => item.id === service.id);
    if (target) target.enabled = !target.enabled;
  });
});

describe("Change Service Status Special PIN validation", () => {
  test("Admin empty PIN shows inline required validation and does not verify or update status", () => {
    openAdminStatusModal();

    const input = pinInput();
    expect(input).toBeRequired();
    expect(input).toBeInvalid();
    expect(emptyFieldError()).not.toBeInTheDocument();

    fireEvent.click(confirmPin());

    expect(screen.getByText("Please fill out this field.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog", { name: /change service status/i })).toBeInTheDocument();
    expectStatusEnabled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
    expect(screen.queryByText(/service status updated|status changed|successfully/i)).not.toBeInTheDocument();
  });

  test("Admin whitespace-only PIN is treated as empty and does not verify or update status", () => {
    openAdminStatusModal();

    const input = pinInput();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(confirmPin());

    expect(screen.getByText("Please fill out this field.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("dialog", { name: /change service status/i })).toBeInTheDocument();
    expectStatusEnabled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
  });

  test("Staff Services does not expose status mutation controls or PIN prompts", () => {
    mockData = {
      currentUser: { id: "STF-1", name: "Staff", email: "staff@example.com", userType: "Staff", role: "General Manager" },
    };

    openStaffStatusModal();

    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /change service status/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Only" })).toBeEnabled();
    expectStatusEnabled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
  });

  test("empty PIN inline error clears when a non-whitespace PIN is entered", () => {
    openAdminStatusModal();

    const input = pinInput();
    fireEvent.click(confirmPin());
    expect(screen.getByText("Please fill out this field.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "1" } });

    expect(emptyFieldError()).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
  });

  test("empty PIN inline error resets when the modal closes and reopens", () => {
    openAdminStatusModal();

    fireEvent.click(confirmPin());
    expect(screen.getByText("Please fill out this field.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "x" }));
    expect(screen.queryByRole("dialog", { name: /change service status/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(emptyFieldError()).not.toBeInTheDocument();
    expect(pinInput()).not.toHaveAttribute("aria-invalid", "true");
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
  });

  test("Admin valid non-empty PIN verifies and updates the service status", async () => {
    openAdminStatusModal();

    fireEvent.change(pinInput(), { target: { value: " 1234 " } });
    fireEvent.click(confirmPin());

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "1234",
      "admin",
      expect.objectContaining({ userType: "Admin" }),
      undefined
    );
    await waitFor(() => expect(mockToggleService).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: /change service status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(emptyFieldError()).not.toBeInTheDocument();
  });

  test("Staff Special PIN cannot be used for service status mutation because Staff has no mutation action", () => {
    mockData = {
      currentUser: { id: "STF-1", name: "Staff", email: "staff@example.com", userType: "Staff", role: "General Manager" },
    };
    openStaffStatusModal();

    expect(screen.queryByLabelText("Special PIN")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm PIN" })).not.toBeInTheDocument();
    expect(mockToggleService).not.toHaveBeenCalled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
  });

  test("incorrect non-empty PIN displays the error and keeps status unchanged", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special PIN."));
    openAdminStatusModal();

    fireEvent.change(pinInput(), { target: { value: "9999" } });
    fireEvent.click(confirmPin());

    expect(await screen.findByText("Incorrect admin special PIN.")).toBeInTheDocument();
    expect(emptyFieldError()).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /change service status/i })).toBeInTheDocument();
    expectStatusEnabled();
    expect(mockToggleService).not.toHaveBeenCalled();
  });

  test("Show and Hide PIN toggle visibility without changing the entered value", () => {
    openAdminStatusModal();
    const input = pinInput();
    fireEvent.change(input, { target: { value: "1357" } });

    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("1357");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("1357");
  });
});
