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

  test("post-booking DP handoff targets the exact booking and opens the existing payment choice", async () => {
    const onPaymentHandoffHandled = jest.fn();
    const oldPayment = basePayment({
      id: "PAY-OLD",
      bookingId: "BK-OLD",
      downPaymentAmount: 222,
      totalAmount: 999,
      amount: 999,
    });
    const targetPayment = basePayment({
      id: "PAY-NEW",
      bookingId: "BK-NEW",
      downPaymentAmount: 1000,
      totalAmount: 5000,
      amount: 5000,
    });
    setContext({ payments: [oldPayment, targetPayment] });

    render(
      <CustomerPayments
        paymentHandoff={{ type: "post-booking", bookingId: "BK-NEW" }}
        onPaymentHandoffHandled={onPaymentHandoffHandled}
      />
    );

    expect(await screen.findByText("Choose Payment Option")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search Payments...")).toHaveValue("BK-NEW");
    expect(screen.getByRole("button", { name: /Pay Down Payment/i })).toHaveTextContent("P 1,000");
    expect(screen.getByRole("button", { name: /Pay in Full/i })).toHaveTextContent("P 5,000");
    expect(screen.queryByText("P 222")).not.toBeInTheDocument();
    expect(onPaymentHandoffHandled).toHaveBeenCalledTimes(1);
  });

  test("post-booking handoff reuses the existing down-payment proof mode", async () => {
    setContext({ payment: basePayment({ id: "PAY-NEW", bookingId: "BK-NEW" }) });

    render(<CustomerPayments paymentHandoff={{ type: "post-booking", bookingId: "BK-NEW" }} />);

    expect(await screen.findByText("Choose Payment Option")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Pay Down Payment/i }));

    expect(screen.getByText("Submit Down Payment Proof")).toBeInTheDocument();
    expect(screen.getByText("Required Down Payment")).toBeInTheDocument();
  });

  test("post-booking handoff reuses the existing pay-in-full proof mode", async () => {
    setContext({ payment: basePayment({ id: "PAY-NEW", bookingId: "BK-NEW" }) });

    render(<CustomerPayments paymentHandoff={{ type: "post-booking", bookingId: "BK-NEW" }} />);

    expect(await screen.findByText("Choose Payment Option")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Pay in Full/i }));

    expect(screen.getByRole("button", { name: "Submit Full Payment Proof" })).toBeInTheDocument();
    expect(screen.getByText("Amount Due")).toBeInTheDocument();
  });

  test("post-booking non-DP handoff focuses the record without forcing payment choices", async () => {
    const noDownPayment = basePayment({
      id: "PAY-NODP",
      bookingId: "BK-NODP",
      service: "Car Wash",
      downPaymentRequired: false,
      downPaymentAmount: 0,
      downPaymentStatus: "Not Required",
    });
    setContext({ payment: noDownPayment });

    render(<CustomerPayments paymentHandoff={{ type: "post-booking", bookingId: "BK-NODP" }} />);

    await waitFor(() => expect(screen.getByPlaceholderText("Search Payments...")).toHaveValue("BK-NODP"));
    expect(screen.queryByText("Choose Payment Option")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay Balance" })).toBeEnabled();
  });

  test("post-booking handoff is consumed once and does not reopen after closing", async () => {
    const onPaymentHandoffHandled = jest.fn();
    setContext({ payment: basePayment({ id: "PAY-NEW", bookingId: "BK-NEW" }) });

    render(
      <CustomerPayments
        paymentHandoff={{ type: "post-booking", bookingId: "BK-NEW" }}
        onPaymentHandoffHandled={onPaymentHandoffHandled}
      />
    );

    expect(await screen.findByText("Choose Payment Option")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Choose Payment Option")).not.toBeInTheDocument());
    expect(onPaymentHandoffHandled).toHaveBeenCalledTimes(1);
  });

  test("post-booking handoff fails safely when the booking id cannot be resolved", async () => {
    const onPaymentHandoffHandled = jest.fn();
    setContext({ payment: basePayment({ id: "PAY-OTHER", bookingId: "BK-OTHER" }) });

    render(
      <CustomerPayments
        paymentHandoff={{ type: "post-booking", bookingId: "BK-MISSING" }}
        onPaymentHandoffHandled={onPaymentHandoffHandled}
      />
    );

    await waitFor(() => expect(onPaymentHandoffHandled).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Choose Payment Option")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search Payments...")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  });

  test("shows the original required down-payment form before the server deadline", async () => {
    setContext({ payment: basePayment({ paymentPlan: "downPayment" }) });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByText("Choose Payment Option")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay Down Payment/i })).toHaveTextContent("P 1,000");
    expect(screen.getByRole("button", { name: /Pay in Full/i })).toHaveTextContent("P 5,000");
    await userEvent.click(screen.getByRole("button", { name: /Pay Down Payment/i }));

    expect(screen.getByText("Submit Down Payment Proof")).toBeInTheDocument();
    expect(screen.getByText("Required Down Payment")).toBeInTheDocument();
    expect(screen.getByText("Payment Method")).toBeInTheDocument();
    expect(screen.getByText("Original 24h Deadline")).toBeInTheDocument();
    expect(screen.getByText("Current DP Status")).toBeInTheDocument();
    expect(screen.getByText("Reference Number")).toBeInTheDocument();
    expect(screen.getByText("Photo Proof")).toBeInTheDocument();
  });

  test("shows payment choice for an untouched legacy record regardless of its normalized plan", async () => {
    setContext({ payment: basePayment({ paymentPlan: "fullPayment" }) });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(screen.getByText("Choose Payment Option")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay Down Payment/i })).toHaveTextContent("P 1,000");
    expect(screen.getByRole("button", { name: /Pay in Full/i })).toHaveTextContent("P 5,000");
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
          paymentPlan: "downPayment",
        })
      );
    });
    expect(checkPaymentReference).not.toHaveBeenCalled();
    expect(submitPaymentProof.mock.calls[0][1]).not.toHaveProperty("downPaymentOcrAdvisoryStatus");
  });

  test("keeps Cash selectable, requires a walk-in receipt number, and uses the canonical reference field", async () => {
    const submitPaymentProof = jest.fn().mockResolvedValue({});
    const payment = basePayment();
    setContext({ payment, submitPaymentProof });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    await userEvent.click(screen.getByRole("button", { name: /Pay Down Payment/i }));
    await userEvent.selectOptions(screen.getByLabelText("Down Payment Method"), "Cash");

    expect(screen.getByLabelText("Down Payment Method")).toHaveValue("Cash");
    expect(screen.getByText("Cash payments are for walk-in clients only.")).toBeInTheDocument();
    expect(screen.getByLabelText("Receipt Number")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reference Number")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByText("Receipt Number is required.")).toBeInTheDocument();
    expect(submitPaymentProof).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Receipt Number"), "OR-1001");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(submitPaymentProof).toHaveBeenCalledWith(
      payment,
      expect.objectContaining({
        downPaymentMethod: "Cash",
        downPaymentReference: "OR-1001",
        downPaymentProofUrl: "",
      })
    ));
  });

  test("non-cash methods retain Reference Number and proof requirements", async () => {
    setContext();
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    await userEvent.click(screen.getByRole("button", { name: /Pay Down Payment/i }));
    await userEvent.selectOptions(screen.getByLabelText("Down Payment Method"), "GCash");

    expect(screen.getByLabelText("Reference Number")).toBeInTheDocument();
    expect(screen.queryByLabelText("Receipt Number")).not.toBeInTheDocument();
    expect(screen.queryByText("Cash payments are for walk-in clients only.")).not.toBeInTheDocument();
  });

  test("submits pay-in-full proof through final-payment fields with the full-payment plan", async () => {
    const submitPaymentProof = jest.fn().mockResolvedValue({});
    const payment = basePayment();
    setContext({ payment, submitPaymentProof });
    render(<CustomerPayments />);

    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    await userEvent.click(screen.getByRole("button", { name: /Pay in Full/i }));

    expect(screen.getByRole("button", { name: "Submit Full Payment Proof" })).toBeInTheDocument();
    expect(screen.getByText("Amount Due")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Full Payment Method"), "Cash");
    await userEvent.type(screen.getByLabelText("Receipt Number"), "OR-FULL-1001");
    await userEvent.click(screen.getByRole("button", { name: "Submit Full Payment Proof" }));

    await waitFor(() => {
      expect(submitPaymentProof).toHaveBeenCalledWith(
        payment,
        expect.objectContaining({
          finalPaymentStatus: "For Verification",
          finalPaymentMethod: "Cash",
          finalPaymentReference: "OR-FULL-1001",
          finalPaymentProofUrl: "",
          paymentPlan: "fullPayment",
        })
      );
    });
    expect(submitPaymentProof.mock.calls[0][1]).not.toHaveProperty("downPaymentProofUrl");
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
      await userEvent.click(screen.getByRole("button", { name: /Pay Down Payment/i }));
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
