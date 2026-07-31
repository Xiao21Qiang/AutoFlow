import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminServices from "./screens/admin/AdminServices";
import StaffServices from "./screens/staff/StaffServices";
import { ACTION_KEYS } from "./utils/rbac";
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
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
}

function pinInput() {
  return screen.getByLabelText("Special PIN");
}

function confirmPin() {
  return screen.getByRole("button", { name: "Confirm PIN" });
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
  test("Admin empty PIN uses native required validation and does not verify or update status", () => {
    openAdminStatusModal();

    const input = pinInput();
    expect(input).toBeRequired();
    expect(input).toBeInvalid();

    fireEvent.click(confirmPin());

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

    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("dialog", { name: /change service status/i })).toBeInTheDocument();
    expectStatusEnabled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
  });

  test("Staff empty PIN uses the same modal protection when status changes are available", () => {
    mockData = {
      currentUser: { id: "STF-1", name: "Staff", email: "staff@example.com", userType: "Staff", role: "General Manager" },
    };

    openStaffStatusModal();

    const input = pinInput();
    expect(input).toBeRequired();

    fireEvent.click(confirmPin());

    expect(screen.getByRole("dialog", { name: /change service status/i })).toBeInTheDocument();
    expectStatusEnabled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockToggleService).not.toHaveBeenCalled();
    expect(mockCanPerformAction).toHaveBeenCalledWith(expect.objectContaining({ userType: "Staff" }), ACTION_KEYS.servicesManage);
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
  });

  test("Staff valid non-empty PIN verifies with Staff scope and updates the service status", async () => {
    mockData = {
      currentUser: { id: "STF-1", name: "Staff", email: "staff@example.com", userType: "Staff", role: "General Manager" },
    };
    openStaffStatusModal();

    fireEvent.change(pinInput(), { target: { value: "2468" } });
    fireEvent.click(confirmPin());

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "2468",
      "staff",
      expect.objectContaining({ userType: "Staff" }),
      ACTION_KEYS.servicesManage
    );
    await waitFor(() => expect(mockToggleService).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: /change service status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  test("incorrect non-empty PIN displays the error and keeps status unchanged", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special PIN."));
    openAdminStatusModal();

    fireEvent.change(pinInput(), { target: { value: "9999" } });
    fireEvent.click(confirmPin());

    expect(await screen.findByText("Incorrect admin special PIN.")).toBeInTheDocument();
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
