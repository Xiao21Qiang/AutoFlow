import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerPayments from "./screens/customer/CustomerPayments";
import { useAdminData } from "./context/AdminDataContext";
import { checkPaymentReference } from "./utils/paymentReferenceChecker";

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: jest.fn(),
}));

jest.mock("./utils/paymentReferenceChecker", () => ({
  checkPaymentReference: jest.fn(),
}));

const customer = {
  id: "CUS-1",
  name: "Customer One",
  email: "customer@example.com",
  userType: "Customer",
  role: "Customer",
};

function basePayment(overrides = {}) {
  return {
    id: "PAY-6C",
    bookingId: "BK-6C",
    date: "2026-08-01T09:00:00.000Z",
    customer: "Customer One",
    customerEmail: "customer@example.com",
    service: "Ceramic Coating",
    amount: 5000,
    totalAmount: 5000,
    status: "Pending",
    downPaymentRequired: true,
    downPaymentAmount: 1000,
    downPaymentStatus: "Pending",
    downPaymentMethod: "GCash",
    downPaymentReference: "",
    downPaymentDueAt: "2099-08-02T09:00:00.000Z",
    finalPaymentStatus: "Pending",
    ...overrides,
  };
}

function setContext({ payment = basePayment(), submitPaymentProof = jest.fn().mockResolvedValue({}), currentUser = customer } = {}) {
  useAdminData.mockReturnValue({
    payments: [payment],
    currentUser,
    submitPaymentProof,
    loadPaymentProof: jest.fn().mockResolvedValue({}),
  });
  return { submitPaymentProof };
}

describe("CustomerPayments Phase 6C", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("shows the original required down-payment form before the server deadline", async () => {
    setContext();
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(screen.getByText("Submit Down Payment Proof")).toBeInTheDocument();
    expect(screen.getByText("Required Down Payment")).toBeInTheDocument();
    expect(screen.getByText("Payment Method")).toBeInTheDocument();
    expect(screen.getByText("Original 24h Deadline")).toBeInTheDocument();
    expect(screen.getByText("Current DP Status")).toBeInTheDocument();
    expect(screen.getByText("Reference Number")).toBeInTheDocument();
    expect(screen.getByText("Photo Proof")).toBeInTheDocument();
  });

  test("submits normal proof input without blocking on browser OCR mismatch", async () => {
    checkPaymentReference.mockResolvedValue({ status: "not-matched", message: "Reference not found" });
    const submitPaymentProof = jest.fn().mockResolvedValue({});
    const payment = basePayment({
      downPaymentProofUrl: "data:image/png;base64,proof",
      downPaymentProofName: "proof.png",
    });
    setContext({ payment, submitPaymentProof });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    await userEvent.type(screen.getByLabelText("Reference Number"), "MISMATCH-REF");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(submitPaymentProof).toHaveBeenCalledWith(
        payment,
        expect.objectContaining({
          downPaymentStatus: "For Verification",
          downPaymentReference: "MISMATCH-REF",
          downPaymentProofUrl: "data:image/png;base64,proof",
        })
      );
    });
    expect(checkPaymentReference).not.toHaveBeenCalled();
    expect(submitPaymentProof.mock.calls[0][1]).not.toHaveProperty("downPaymentOcrAdvisoryStatus");
  });

  test("closes upload for timeout, correction expiry, second rejection, and third-submission states", () => {
    const closedCases = [
      basePayment({
        downPaymentStatus: "Rejected",
        downPaymentSubmissionClosed: true,
        autoCancelledForNoDownPaymentProof: true,
        downPaymentClosureReasonCode: "DOWN_PAYMENT_TIMEOUT",
      }),
      basePayment({
        downPaymentStatus: "Rejected",
        downPaymentSubmissionClosed: true,
        downPaymentClosureReasonCode: "DOWN_PAYMENT_CORRECTION_TIMEOUT",
      }),
      basePayment({
        downPaymentStatus: "Rejected",
        downPaymentSubmissionClosed: true,
        downPaymentClosureReasonCode: "DOWN_PAYMENT_CORRECTION_REJECTED",
      }),
      basePayment({
        downPaymentStatus: "Rejected",
        downPaymentCorrectionDueAt: "2099-08-02T21:00:00.000Z",
        downPaymentCorrectionSubmittedAt: "2026-08-01T12:00:00.000Z",
      }),
    ];

    closedCases.forEach((payment) => {
      setContext({ payment });
      const { unmount } = render(<CustomerPayments />);
      expect(screen.getByRole("button", { name: "Closed" })).toBeDisabled();
      unmount();
    });
  });

  test("shows one correction window after first rejection and no raw OCR internals to customer", async () => {
    setContext({
      payment: basePayment({
        status: "Rejected",
        downPaymentStatus: "Rejected",
        downPaymentCorrectionDueAt: "2099-08-02T21:00:00.000Z",
        downPaymentRejectionReason: "Reference could not be confirmed.",
        downPaymentOcrAdvisoryStatus: "not_matched_advisory",
        downPaymentOcrAdvisoryText: "raw tesseract text",
      }),
    });
    render(<CustomerPayments />);

    expect(screen.getByText("Payment rejected. You have one correction opportunity before the deadline shown below.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload Correction" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Upload Correction" }));

    expect(screen.getByText("Correction Deadline")).toBeInTheDocument();
    expect(screen.getByText("Reference could not be confirmed.")).toBeInTheDocument();
    expect(screen.queryByText(/not_matched_advisory|raw tesseract text|Tesseract|OCR Check/i)).not.toBeInTheDocument();
  });

  test("shows verified state from refreshed backend payment data", () => {
    setContext({
      payment: basePayment({
        status: "Pending",
        downPaymentStatus: "Paid",
        downPaymentReviewStatus: "Verified",
        downPaymentVerifiedAt: "2026-08-01T10:00:00.000Z",
      }),
    });
    render(<CustomerPayments />);

    expect(screen.getByText("DP Paid / Balance Pending")).toBeInTheDocument();
    expect(screen.getByText("Payment verified.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay Balance" })).toBeEnabled();
  });

  test("surfaces the authoritative booking cooldown timestamp from customer state", () => {
    setContext({
      currentUser: {
        ...customer,
        bookingCooldownUntil: "2099-08-03T09:00:00.000Z",
      },
    });
    render(<CustomerPayments />);

    expect(screen.getByText(/Booking is temporarily unavailable until/i)).toHaveTextContent("2099");
  });
});
