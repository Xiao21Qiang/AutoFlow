import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminEngagement from "./screens/admin/AdminEngagement";

const mockCreatePromo = jest.fn();
const mockUpdatePromo = jest.fn();

let mockPromosState = [];

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    reviews: [],
    promos: mockPromosState,
    rewards: [],
    customerRewards: [],
    users: [],
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createPromo: mockCreatePromo,
    updatePromo: mockUpdatePromo,
    updateReview: jest.fn(),
    createReward: jest.fn(),
    updateReward: jest.fn(),
    deleteReward: jest.fn(),
    generateCustomerReward: jest.fn(),
  }),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => {
  if (!props.open) return null;
  return <div role="dialog" aria-label={props.title || "Security confirmation"}>Security PIN</div>;
});

function renderEngagement() {
  render(<AdminEngagement />);
}

function openAddPromo() {
  renderEngagement();
  fireEvent.click(screen.getByRole("button", { name: "Add Promo" }));
}

function saveButton() {
  return screen.getByRole("button", { name: /Save Promo|Update Promo|Saving/i });
}

function promoForm() {
  return saveButton().closest("form");
}

function titleInput() {
  return screen.getByPlaceholderText("Promo title");
}

function codeInput() {
  return screen.getByPlaceholderText("SAVE10");
}

function discountValueInput(type = "Percentage") {
  return screen.getByPlaceholderText(type === "Percentage" ? "e.g. 10" : "e.g. 500");
}

function maxUsageInput() {
  return document.getElementById("promo-max-usage-per-user");
}

function fillValidPromo(overrides = {}) {
  const values = {
    title: "Summer Shine",
    code: "SUMMER10",
    discountType: "Percentage",
    discountValue: "10",
    maxUsagePerUser: "1",
    message: "Enjoy ten percent off detailing.",
    ...overrides,
  };

  fireEvent.change(titleInput(), { target: { value: values.title } });
  fireEvent.change(codeInput(), { target: { value: values.code } });
  fireEvent.change(screen.getByLabelText("Discount Type"), { target: { value: values.discountType } });
  fireEvent.change(discountValueInput(values.discountType), {
    target: { value: values.discountValue },
  });
  fireEvent.change(maxUsageInput(), { target: { value: values.maxUsagePerUser } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: values.message } });
  return values;
}

beforeEach(() => {
  mockPromosState = [];
  mockCreatePromo.mockReset();
  mockUpdatePromo.mockReset();
});

describe("Add Promo modal validation", () => {
  test("saves one valid promo with its message and shows the authoritative result once", async () => {
    let resolveCreate;
    mockCreatePromo.mockImplementation((payload) => new Promise((resolve) => {
      resolveCreate = () => {
        const saved = {
          id: "PRO-1",
          ...payload,
          status: payload.status || "Draft",
          discountValue: Number(payload.discountValue),
          maxUsagePerUser: Number(payload.maxUsagePerUser),
          usageCount: 0,
        };
        mockPromosState = [saved];
        resolve(saved);
      };
    }));

    openAddPromo();
    const values = fillValidPromo({ message: "  Unique promo message survives refetch.  " });

    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(saveButton());
      await Promise.resolve();
    });

    await waitFor(() => expect(mockCreatePromo).toHaveBeenCalledTimes(1));
    expect(mockCreatePromo).toHaveBeenCalledWith(expect.objectContaining({
      title: values.title,
      code: values.code,
      message: "Unique promo message survives refetch.",
    }));
    await act(async () => {
      resolveCreate();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /add promo/i })).not.toBeInTheDocument());
    expect(screen.getAllByText(values.title)).toHaveLength(1);
    expect(screen.getByText("Unique promo message survives refetch.")).toBeInTheDocument();
    expect(screen.queryByText(/failed|success/i)).not.toBeInTheDocument();
  });

  test.each([
    ["blank title", { title: "" }, "Promo title is required.", "Title"],
    ["whitespace-only title", { title: "   " }, "Promo title is required.", "Title"],
    ["blank code", { code: "" }, "Promo code is required.", "Code"],
    ["whitespace-only code", { code: "   " }, "Promo code is required.", "Code"],
  ])("rejects %s with an inline error and no API request", (_label, override, message, fieldLabel) => {
    openAddPromo();
    fillValidPromo(override);
    fireEvent.blur(fieldLabel === "Title" ? titleInput() : codeInput());

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(mockCreatePromo).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /add promo/i })).toBeInTheDocument();
  });

  test("rejects a blank discount value with the required-field message", () => {
    openAddPromo();
    fillValidPromo({ discountValue: "" });
    fireEvent.blur(discountValueInput());

    expect(screen.getByText("Discount value is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());
    expect(mockCreatePromo).not.toHaveBeenCalled();
  });

  test.each(["0", "0.00", "-1", "not-a-number", "NaN", "Infinity"])("rejects invalid discount value %s", (discountValue) => {
    openAddPromo();
    fillValidPromo({ discountValue });
    fireEvent.blur(discountValueInput());

    expect(screen.getByText("Discount value must be greater than zero.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());
    expect(mockCreatePromo).not.toHaveBeenCalled();
  });

  test("rejects percentage discounts above 100", () => {
    openAddPromo();
    fillValidPromo({ discountValue: "101" });
    fireEvent.blur(discountValueInput());

    expect(screen.getByText("Percentage discount cannot exceed 100%.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());
    expect(mockCreatePromo).not.toHaveBeenCalled();
  });

  test("rejects a blank max usage per user with the required-field message", () => {
    openAddPromo();
    fillValidPromo({ maxUsagePerUser: "" });
    fireEvent.blur(maxUsageInput());

    expect(screen.getByText("Max usage per user is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());
    expect(mockCreatePromo).not.toHaveBeenCalled();
  });

  test.each(["0", "-1", "1.5", "abc"])("rejects max usage per user value %s", (maxUsagePerUser) => {
    openAddPromo();
    fillValidPromo({ maxUsagePerUser });
    fireEvent.blur(maxUsageInput());

    expect(screen.getByText("Max usage per user must be a positive whole number.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());
    expect(mockCreatePromo).not.toHaveBeenCalled();
  });

  test("direct submit with multiple missing fields displays every relevant error and does not create a promo", () => {
    openAddPromo();

    expect(saveButton()).toBeDisabled();
    fireEvent.submit(promoForm());

    expect(screen.getByText("Promo title is required.")).toBeInTheDocument();
    expect(screen.getByText("Promo code is required.")).toBeInTheDocument();
    expect(screen.getByText("Discount value is required.")).toBeInTheDocument();
    expect(screen.getByText("Max usage per user is required.")).toBeInTheDocument();
    expect(screen.queryByText(/promo message is required/i)).not.toBeInTheDocument();
    expect(mockCreatePromo).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /security/i })).not.toBeInTheDocument();
  });

  test("field errors clear as valid values are entered and Save enables only when the form is valid", () => {
    openAddPromo();
    fireEvent.submit(promoForm());
    expect(screen.getByText("Promo title is required.")).toBeInTheDocument();
    expect(screen.getByText("Promo code is required.")).toBeInTheDocument();

    fillValidPromo();

    expect(screen.queryByText("Promo title is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Promo code is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Discount value is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Max usage per user is required.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test("closing and reopening Add Promo clears stale values and validation errors", () => {
    openAddPromo();
    fireEvent.submit(promoForm());
    expect(screen.getByText("Promo title is required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Promo" }));

    expect(screen.queryByText("Promo title is required.")).not.toBeInTheDocument();
    expect(titleInput()).toHaveValue("");
    expect(codeInput()).toHaveValue("");
  });

  test("opening Add Promo after editing does not inherit edit values or errors", () => {
    mockPromosState = [{
      id: "PRO-1",
      title: "Existing Promo",
      code: "EXISTING",
      message: "Existing message",
      status: "Active",
      discountType: "Percentage",
      discountValue: 15,
      maxUsagePerUser: 1,
    }];

    openAddPromo();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(titleInput()).toHaveValue("Existing Promo");
    fireEvent.submit(promoForm());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Promo" }));

    expect(titleInput()).toHaveValue("");
    expect(screen.queryByText("Promo title is required.")).not.toBeInTheDocument();
  });

  test("rapid repeated submit attempts create only one promo", async () => {
    let resolveCreate;
    mockCreatePromo.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    openAddPromo();
    fillValidPromo();
    const form = promoForm();

    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.click(saveButton());
      expect(mockCreatePromo).toHaveBeenCalledTimes(1);
      resolveCreate({ id: "PRO-1", title: "Summer Shine", code: "SUMMER10", message: "Enjoy ten percent off detailing." });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /add promo/i })).not.toBeInTheDocument());
  });

  test("blank optional message does not block a valid promo", async () => {
    let resolveCreate;
    mockCreatePromo.mockImplementation((payload) => new Promise((resolve) => {
      resolveCreate = () => {
        mockPromosState = [{ id: "PRO-1", ...payload, discountValue: 10, maxUsagePerUser: 1 }];
        resolve(mockPromosState[0]);
      };
    }));

    openAddPromo();
    fillValidPromo({ message: "" });

    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.submit(promoForm());
      await Promise.resolve();
    });

    await waitFor(() => expect(mockCreatePromo).toHaveBeenCalledTimes(1));
    expect(mockCreatePromo).toHaveBeenCalledWith(expect.objectContaining({ message: "" }));
    await act(async () => {
      resolveCreate();
      await Promise.resolve();
    });
  });
});
