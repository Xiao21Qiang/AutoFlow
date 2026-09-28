import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentTrackingView from "./components/payments/PaymentTrackingView";
import { useAdminData } from "./context/AdminDataContext";
import { validateSpecialCredential } from "./utils/reauth";

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: jest.fn(),
}));

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user = {}) => user.name || user.email || "",
  validateSpecialCredential: jest.fn().mockResolvedValue(true),
  verifyCurrentPassword: jest.fn(),
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
    validateSpecialCredential.mockResolvedValue(true);
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
    expect(screen.queryByAltText("Full payment proof")).not.toBeInTheDocument();
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

  test("routes a submitted Pay in Full proof through final-payment verification only", async () => {
    const updatePayment = jest.fn().mockResolvedValue({});
    useAdminData.mockReturnValue(baseContext({
      payments: [{
        id: "PAY-FULL",
        bookingId: "BK-FULL",
        date: "2026-07-01",
        customer: "Customer Full",
        customerEmail: "full@example.com",
        service: "Coating",
        totalAmount: 1000,
        status: "For Verification",
        paymentPlan: "fullPayment",
        downPaymentRequired: true,
        downPaymentAmount: 300,
        downPaymentStatus: "Pending",
        downPaymentMethod: "",
        downPaymentReference: "",
        finalPaymentStatus: "For Verification",
        finalPaymentMethod: "GCash",
        finalPaymentReference: "FULL-REF",
        finalPaymentProofName: "full.jpg",
        finalPaymentProofAvailable: true,
        finalPaymentProofSubmittedAt: "2026-07-01T10:00:00.000Z",
      }],
      updatePayment,
      loadPaymentProof: jest.fn().mockResolvedValue({ proofImage: "data:image/jpeg;base64,full" }),
    }));

    render(<PaymentTrackingView role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "✎" }));

    expect(screen.getAllByLabelText("Status")[0]).toHaveValue("Not Applicable");
    expect(screen.getAllByLabelText("Status")[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Verify" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Verify Full Payment")).toBeInTheDocument();
    expect(screen.queryByText("Verify Down Payment")).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Enter special PIN"), "654321");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));
    });

    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith("PAY-FULL", expect.objectContaining({
      finalPaymentStatus: "Paid",
      specialPin: "654321",
    })));
    const fullPaymentPayload = updatePayment.mock.calls[0][1];
    expect(fullPaymentPayload).not.toHaveProperty("status");
    expect(fullPaymentPayload).not.toHaveProperty("downPaymentStatus");
  });

  test("keeps a submitted remaining balance on the final-payment request path", async () => {
    const updatePayment = jest.fn().mockResolvedValue({});
    const loadPaymentProof = jest.fn((_paymentId, stage) => Promise.resolve(
      stage === "downPayment"
        ? { proofImage: "data:image/jpeg;base64,down-proof", proofFileName: "down.jpg" }
        : { proofImage: "data:image/jpeg;base64,balance-proof", proofFileName: "balance.jpg" }
    ));
    useAdminData.mockReturnValue(baseContext({
      payments: [{
        ...baseContext().payments[0],
        id: "PAY-BALANCE",
        bookingId: "BK-BALANCE",
        paymentPlan: "downPayment",
        downPaymentStatus: "Paid",
        finalPaymentStatus: "For Verification",
        finalPaymentMethod: "GCash",
        finalPaymentReference: "BALANCE-REF",
        finalPaymentProofName: "balance.jpg",
        finalPaymentProofAvailable: true,
        finalPaymentProofSubmittedAt: "2026-07-02T10:00:00.000Z",
      }],
      updatePayment,
      loadPaymentProof,
    }));

    render(<PaymentTrackingView role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "✎" }));
    await waitFor(() => {
      expect(screen.getByAltText("Down payment proof")).toHaveAttribute("src", "data:image/jpeg;base64,down-proof");
      expect(screen.getByAltText("Full payment proof")).toHaveAttribute("src", "data:image/jpeg;base64,balance-proof");
    });
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Verify Remaining Balance")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText("Enter special PIN"), "654321");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));
    });

    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith("PAY-BALANCE", expect.objectContaining({
      finalPaymentStatus: "Paid",
      specialPin: "654321",
    })));
    const balancePayload = updatePayment.mock.calls[0][1];
    expect(balancePayload).not.toHaveProperty("status");
    expect(balancePayload).not.toHaveProperty("downPaymentStatus");
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
