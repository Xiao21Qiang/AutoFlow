import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentTrackingView from "./components/payments/PaymentTrackingView";
import { useAdminData } from "./context/AdminDataContext";

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: jest.fn(),
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function baseContext(overrides = {}) {
  return {
    payments: [
      {
        id: "PAY-1",
        bookingId: "BK-1",
        date: "2026-07-01",
        customer: "Customer One",
        customerEmail: "customer@example.com",
        service: "Coating",
        amount: 1000,
        totalAmount: 1000,
        status: "For Verification",
        downPaymentRequired: true,
        downPaymentAmount: 300,
        downPaymentStatus: "For Verification",
        downPaymentMethod: "GCash",
        downPaymentReference: "DP-REF",
        downPaymentProofName: "down.jpg",
        downPaymentProofAvailable: true,
        finalPaymentStatus: "Pending",
      },
    ],
    updatePayment: jest.fn(),
    users: [],
    currentUser: { id: "ADM-1", email: "admin@example.com", userType: "Admin", role: "Admin" },
    loadPaymentProof: jest.fn(),
    ...overrides,
  };
}

describe("PaymentTrackingView on-demand proof loading", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("opens selected proof on demand without preloading list proofs", async () => {
    const proofRequest = createDeferred();
    const loadPaymentProof = jest.fn(() => proofRequest.promise);
    useAdminData.mockReturnValue(baseContext({ loadPaymentProof }));

    render(<PaymentTrackingView role="admin" />);

    expect(loadPaymentProof).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "✎" }));

    expect(loadPaymentProof).toHaveBeenCalledTimes(1);
    expect(loadPaymentProof).toHaveBeenCalledWith("PAY-1", "downPayment");
    expect(screen.getByText(/Loading down payment proof/i)).toBeInTheDocument();

    proofRequest.resolve({ proofImage: "data:image/jpeg;base64,proof", proofFileName: "down.jpg" });

    await waitFor(() => {
      expect(screen.getByAltText("Down payment proof")).toHaveAttribute("src", "data:image/jpeg;base64,proof");
    });
  });

  test("shows a safe proof-loading error", async () => {
    const proofRequest = createDeferred();
    const loadPaymentProof = jest.fn(() => proofRequest.promise);
    useAdminData.mockReturnValue(baseContext({ loadPaymentProof }));

    render(<PaymentTrackingView role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "✎" }));
    proofRequest.reject(new Error("Payment proof was not found."));

    await waitFor(() => {
      expect(screen.getByText("Payment proof was not found.")).toBeInTheDocument();
    });
  });
});
