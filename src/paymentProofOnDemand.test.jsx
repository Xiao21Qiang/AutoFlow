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

    proofRequest.resolve({
      proofImage: "data:image/jpeg;base64,proof",
      proofFileName: "down.jpg",
      referenceCheckStatus: "submitted",
      referenceCheckedAt: "2026-07-01T10:00:00.000Z",
      ocrAdvisoryStatus: "matched_advisory",
      ocrDetectedReference: "DP-REF",
      possibleDuplicateReference: true,
    });

    await waitFor(() => {
      expect(screen.getByAltText("Down payment proof")).toHaveAttribute("src", "data:image/jpeg;base64,proof");
    });
    expect(screen.getByText("OCR Check: Match")).toBeInTheDocument();
    expect(screen.getByText("Detected reference: DP-REF")).toBeInTheDocument();
    expect(screen.getByText("Possible duplicate transaction reference - manual verification required.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Verify" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Reject" }).length).toBeGreaterThan(0);
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

  test.each([
    ["not_matched_advisory", "OCR Check: Mismatch"],
    ["unreadable_advisory", "OCR Check: Unable to Read"],
    ["ocr_error_advisory", "OCR Check: Error"],
  ])("shows %s as advisory and still allows human review", async (ocrAdvisoryStatus, expectedLabel) => {
    const loadPaymentProof = jest.fn().mockResolvedValue({
      proofImage: "data:image/jpeg;base64,proof",
      proofFileName: "down.jpg",
      ocrAdvisoryStatus,
      ocrDetectedReference: "OTHER-REF",
    });
    useAdminData.mockReturnValue(baseContext({ loadPaymentProof }));

    render(<PaymentTrackingView role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "✎" }));

    expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
    expect(screen.getByText("Detected reference: OTHER-REF")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Verify" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Reject" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument();
  });

  test("shows first rejection correction context and second-rejection closure", async () => {
    useAdminData.mockReturnValue(baseContext({
      payments: [
        {
          ...baseContext().payments[0],
          downPaymentStatus: "Rejected",
          downPaymentReviewStatus: "Rejected",
          downPaymentCorrectionDueAt: "2099-01-01T12:00:00.000Z",
          downPaymentRejectionReason: "Wrong receipt.",
        },
        {
          ...baseContext().payments[0],
          id: "PAY-2",
          bookingId: "BK-2",
          downPaymentStatus: "Rejected",
          downPaymentSubmissionClosed: true,
          downPaymentClosureReasonCode: "DOWN_PAYMENT_CORRECTION_REJECTED",
        },
      ],
      loadPaymentProof: jest.fn().mockResolvedValue({}),
    }));

    render(<PaymentTrackingView role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "✎" })[0]);

    expect(await screen.findByText(/Correction deadline:/)).toHaveTextContent("2099");
    expect(screen.getByText("Rejection reason: Wrong receipt.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "x" }));
    await userEvent.click(screen.getAllByRole("button", { name: "✎" })[1]);

    expect(await screen.findByText("Closed: corrected proof rejected")).toBeInTheDocument();
  });

  test("keeps unauthorized users read-only in Payment Tracking", () => {
    useAdminData.mockReturnValue(baseContext({
      currentUser: { id: "CUS-1", email: "customer@example.com", userType: "Customer", role: "Customer" },
    }));

    render(<PaymentTrackingView role="admin" />);

    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✎" })).not.toBeInTheDocument();
  });
});
