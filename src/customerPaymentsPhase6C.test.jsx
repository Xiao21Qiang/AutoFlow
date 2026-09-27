import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerPayments from "./screens/customer/CustomerPayments";
import { useAdminData } from "./context/AdminDataContext";
import { checkPaymentReference } from "./utils/paymentReferenceChecker";
import { downloadAuthenticatedFile } from "./utils/downloadExport";

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: jest.fn(),
}));

jest.mock("./utils/paymentReferenceChecker", () => ({
  checkPaymentReference: jest.fn(),
}));

jest.mock("./utils/downloadExport", () => ({
  downloadAuthenticatedFile: jest.fn().mockResolvedValue(undefined),
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

function setContext({ payment = basePayment(), payments, submitPaymentProof = jest.fn().mockResolvedValue({}), currentUser = customer } = {}) {
  useAdminData.mockReturnValue({
    payments: payments || [payment],
    currentUser,
    submitPaymentProof,
    loadPaymentProof: jest.fn().mockResolvedValue({}),
  });
  return { submitPaymentProof };
}

describe("CustomerPayments Phase 6C", () => {
  beforeEach(() => {
    downloadAuthenticatedFile.mockResolvedValue(undefined);
  });

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

  test("opens remaining-balance proof with empty final-stage fields when only DP proof exists", async () => {
    setContext({
      payment: basePayment({
        status: "Pending",
        method: "GCash",
        reference: "DP-REF-1",
        proofImage: "data:image/png;base64,dp-proof",
        proofFileName: "downpayment-proof.png",
        downPaymentStatus: "Paid",
        downPaymentMethod: "GCash",
        downPaymentReference: "DP-REF-1",
        downPaymentProofUrl: "data:image/png;base64,dp-proof",
        downPaymentProofName: "downpayment-proof.png",
        downPaymentProofSubmittedAt: "2026-08-01T09:00:00.000Z",
        finalPaymentStatus: "Pending",
      }),
    });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Pay Balance" }));

    expect(screen.getByText("Submit Remaining Balance Proof")).toBeInTheDocument();
    expect(screen.getByLabelText("Reference Number")).toHaveValue("");
    expect(screen.getByLabelText("Final Payment Method")).toHaveValue("");
    const paymentMethodSummary = screen.getByText("Payment Method").closest("div");
    expect(within(paymentMethodSummary).getByText("-")).toBeInTheDocument();
    expect(paymentMethodSummary).not.toHaveTextContent("GCash");
    expect(screen.queryByText(/Selected: downpayment-proof\.png/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText("Payment proof preview")).not.toBeInTheDocument();
  });

  test("switching from DP upload to final upload clears proof form state", async () => {
    const dpPayment = basePayment({
      id: "PAY-DP",
      bookingId: "BK-DP",
      downPaymentProofUrl: "data:image/png;base64,dp-proof",
      downPaymentProofName: "downpayment-proof.png",
      downPaymentMethod: "GCash",
      downPaymentReference: "DP-REF-1",
    });
    const finalPayment = basePayment({
      id: "PAY-FINAL",
      bookingId: "BK-FINAL",
      status: "Pending",
      downPaymentStatus: "Paid",
      downPaymentMethod: "GCash",
      downPaymentReference: "DP-REF-2",
      downPaymentProofUrl: "data:image/png;base64,dp-proof-2",
      downPaymentProofName: "downpayment-proof-2.png",
      finalPaymentStatus: "Pending",
    });
    setContext({ payments: [dpPayment, finalPayment] });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByText("Selected: downpayment-proof.png")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "x" }));
    await userEvent.click(screen.getByRole("button", { name: "Pay Balance" }));

    expect(screen.getByText("Submit Remaining Balance Proof")).toBeInTheDocument();
    expect(screen.getByLabelText("Reference Number")).toHaveValue("");
    expect(screen.getByLabelText("Final Payment Method")).toHaveValue("");
    expect(screen.queryByText(/Selected: downpayment-proof/i)).not.toBeInTheDocument();
  });

  test("pending DP image compression cannot populate a newly opened final-payment form", async () => {
    const pendingReaders = [];
    const OriginalFileReader = global.FileReader;
    const OriginalImage = global.Image;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    global.FileReader = class {
      readAsDataURL() {
        pendingReaders.push(this);
      }
    };
    global.Image = class {
      constructor() {
        this.width = 640;
        this.height = 480;
      }

      set src(_value) {
        this.onload();
      }
    };
    HTMLCanvasElement.prototype.getContext = jest.fn(() => null);

    try {
      const dpPayment = basePayment({ id: "PAY-DP-RACE", bookingId: "BK-DP-RACE" });
      const finalPayment = basePayment({
        id: "PAY-FINAL-RACE",
        bookingId: "BK-FINAL-RACE",
        downPaymentStatus: "Paid",
        downPaymentMethod: "GCash",
        finalPaymentStatus: "Pending",
      });
      setContext({ payments: [dpPayment, finalPayment] });
      render(<CustomerPayments />);

      await userEvent.click(screen.getByRole("button", { name: "Upload" }));
      const dpFile = new File(["dp-proof"], "pending-dp-proof.png", { type: "image/png" });
      userEvent.upload(screen.getByLabelText("Photo Proof"), dpFile);
      expect(pendingReaders).toHaveLength(1);

      await userEvent.click(screen.getByRole("button", { name: "x" }));
      await userEvent.click(screen.getByRole("button", { name: "Pay Balance" }));

      await act(async () => {
        pendingReaders[0].result = "data:image/png;base64,c3RhbGUtZHAtcHJvb2Y=";
        pendingReaders[0].onload();
        await Promise.resolve();
      });

      expect(screen.getByText("Submit Remaining Balance Proof")).toBeInTheDocument();
      expect(screen.queryByText("Selected: pending-dp-proof.png")).not.toBeInTheDocument();
      expect(screen.queryByAltText("Payment proof preview")).not.toBeInTheDocument();
    } finally {
      global.FileReader = OriginalFileReader;
      global.Image = OriginalImage;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test("download button requests the authenticated invoice PDF", async () => {
    setContext();
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "View" }));
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(downloadAuthenticatedFile).toHaveBeenCalledWith(
      "/api/admin/invoices/PAY-6C/pdf",
      "autoflow-invoice-BK-6C.pdf"
    );
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
