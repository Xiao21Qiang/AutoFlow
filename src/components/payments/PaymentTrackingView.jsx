import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterModal from "../common/FilterModal";
import SecurityConfirmModal from "../common/SecurityConfirmModal";
import ToastMessage from "../common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";
import {
  PAYMENT_STATUS_OPTIONS,
  getAllowedDownPaymentStatuses,
  getAmountPaid,
  getPaymentFormDefaults,
  getPaymentStageClass,
  getPaymentStageLabel,
  getPaymentTotal,
  getRemainingBalance,
  normalizeStageStatus,
  canReviewFinalPaymentStage,
  isDownPaymentSatisfied,
  isPaidStatus,
} from "../../utils/paymentStages";
import { ACTION_KEYS, canPerformAction, normalizeUserType } from "../../utils/rbac";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const STAGE_FILTER_OPTIONS = [
  "DP Pending",
  "DP For Verification",
  "DP Paid / Balance Pending",
  "Full Payment For Verification",
  "Balance Pending",
  "Paid",
  "DP Rejected",
  "Rejected",
];

const CLASS_NAMES = {
  admin: {
    wrap: "payWrap",
    top: "payTopRow",
    searchBox: "paySearchBox",
    searchIcon: "paySearchIcon",
    searchInput: "paySearchInput",
    filterBtn: "payFilterBtn",
    filterIcon: "payFilterIcon",
    actions: "payActionBtns",
    actionBtn: "payBtn payBtnDark",
    board: "payBoard",
    table: "payTable",
    bold: "payBold",
    badge: "payStatus",
    actionsCell: "payActionsCell",
    editBtn: "payEditBtn",
    empty: "payEmpty",
    pagerRow: "payPagerRow",
    pagerBtn: "payPagerBtn",
    pagerNum: "payPagerNum",
    modalOverlay: "payModalOverlay",
    modalCard: "payModalCard",
    close: "payModalClose",
    title: "payModalTitle",
    details: "payDetailList",
    field: "payField",
    proofWrap: "payProofPreviewWrap",
    proof: "payProofPreview",
    modalActions: "payModalActions",
    textBtn: "payTextBtn",
    primaryBtn: "payPrimaryBtn",
    section: "payStageSection",
    sectionTitle: "payStageTitle",
    grid: "payStageGrid",
    amountGrid: "payAmountGrid",
    hint: "payStageHint",
    proofName: "payProofName",
    referenceChecker: "payReferenceChecker",
    referenceCheckerTop: "payReferenceCheckerTop",
    checkerBtn: "payReferenceCheckBtn",
    checkerBadge: "payReferenceBadge",
    checkerMeta: "payReferenceMeta",
    quickActions: "payReviewQuickActions",
    reviewBtn: "payReviewBtn",
    warning: "payReviewWarning",
  },
  staff: {
    wrap: "stPayWrap",
    top: "stPayTop",
    searchBox: "stPaySearchBox",
    searchIcon: "stPaySearchIcon",
    searchInput: "stPaySearchInput",
    filterBtn: "stPayFilterBtn",
    filterIcon: "stPayFilterIcon",
    actions: "stPaySearchGroup",
    actionBtn: "",
    board: "stPayCard",
    table: "stPayTbl",
    bold: "",
    badge: "stPayBadge",
    actionsCell: "stPayColActions",
    editBtn: "stPayEditBtn",
    empty: "stPayEmpty",
    pagerRow: "stPayPagerRow",
    pagerBtn: "stPayPagerBtn",
    pagerNum: "stPayPagerNum active",
    modalOverlay: "stPayModalOverlay",
    modalCard: "stPayModalCard",
    close: "stPayModalClose",
    title: "stPayModalTitle",
    details: "stPayDetailList",
    field: "stPayField",
    proofWrap: "stPayProofPreviewWrap",
    proof: "stPayProofPreview",
    modalActions: "stPayModalActions",
    textBtn: "stPayTextBtn",
    primaryBtn: "stPayPrimaryBtn",
    section: "stPayStageSection",
    sectionTitle: "stPayStageTitle",
    grid: "stPayStageGrid",
    amountGrid: "stPayAmountGrid",
    hint: "stPayStageHint",
    proofName: "stPayProofName",
    referenceChecker: "stPayReferenceChecker",
    referenceCheckerTop: "stPayReferenceCheckerTop",
    checkerBtn: "stPayReferenceCheckBtn",
    checkerBadge: "stPayReferenceBadge",
    checkerMeta: "stPayReferenceMeta",
    quickActions: "stPayReviewQuickActions",
    reviewBtn: "stPayReviewBtn",
    warning: "stPayReviewWarning",
  },
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  return `₱ ${Number(value || 0).toLocaleString()}`;
}

function getDisplayMethod(payment) {
  return payment.finalPaymentMethod || payment.downPaymentMethod || payment.method || "-";
}

function formatSubmittedValue(value) {
  const text = String(value || "").trim();
  return text || "Not provided";
}

function hasProofMetadata(payment, stage) {
  if (!payment) return false;
  if (stage === "finalPayment") {
    return Boolean(
      payment.finalPaymentProofAvailable ||
      payment.finalPaymentProofUrl ||
      payment.finalPaymentProofName ||
      payment.finalPaymentProofSubmittedAt
    );
  }
  return Boolean(
    payment.downPaymentProofAvailable ||
    payment.proofAvailable ||
    payment.downPaymentProofUrl ||
    payment.proofImage ||
    payment.downPaymentProofName ||
    payment.proofFileName ||
    payment.downPaymentProofSubmittedAt ||
    payment.proofSubmittedAt
  );
}

function mergeProofIntoPayment(payment, proof, stage) {
  if (!proof) return payment;
  if (stage === "finalPayment") {
    return {
      ...payment,
      finalPaymentProofUrl: proof.proofImage || proof.proofUrl || payment.finalPaymentProofUrl || "",
      finalPaymentProofName: proof.proofFileName || proof.proofName || payment.finalPaymentProofName || "",
      finalPaymentReferenceCheckStatus: proof.referenceCheckStatus || payment.finalPaymentReferenceCheckStatus || "",
      finalPaymentReferenceCheckedAt: proof.referenceCheckedAt || payment.finalPaymentReferenceCheckedAt || null,
      finalPaymentOcrAdvisoryStatus: proof.ocrAdvisoryStatus || payment.finalPaymentOcrAdvisoryStatus || "",
      finalPaymentOcrDetectedReference: proof.ocrDetectedReference || payment.finalPaymentOcrDetectedReference || "",
      finalPaymentPossibleDuplicateReference: Boolean(proof.possibleDuplicateReference || payment.finalPaymentPossibleDuplicateReference),
    };
  }
  return {
    ...payment,
    proofImage: proof.proofImage || proof.proofUrl || payment.proofImage || "",
    downPaymentProofUrl: proof.proofImage || proof.proofUrl || payment.downPaymentProofUrl || "",
    proofFileName: proof.proofFileName || proof.proofName || payment.proofFileName || "",
    downPaymentProofName: proof.proofFileName || proof.proofName || payment.downPaymentProofName || "",
    downPaymentReferenceCheckStatus: proof.referenceCheckStatus || payment.downPaymentReferenceCheckStatus || "",
    downPaymentReferenceCheckedAt: proof.referenceCheckedAt || payment.downPaymentReferenceCheckedAt || null,
    downPaymentOcrAdvisoryStatus: proof.ocrAdvisoryStatus || payment.downPaymentOcrAdvisoryStatus || "",
    downPaymentOcrDetectedReference: proof.ocrDetectedReference || payment.downPaymentOcrDetectedReference || "",
    downPaymentPossibleDuplicateReference: Boolean(proof.possibleDuplicateReference || payment.downPaymentPossibleDuplicateReference),
  };
}

function getOcrCheckLabel(status) {
  switch (String(status || "").trim()) {
    case "matched_advisory":
      return "OCR Check: Match";
    case "not_matched_advisory":
      return "OCR Check: Mismatch";
    case "unreadable_advisory":
      return "OCR Check: Unable to Read";
    case "ocr_error_advisory":
      return "OCR Check: Error";
    case "cash_not_required":
      return "OCR Check: Cash not required";
    case "submitted":
      return "OCR Check: Pending";
    default:
      return "";
  }
}

function getClosureLabel(code) {
  switch (String(code || "").trim()) {
    case "DOWN_PAYMENT_TIMEOUT":
      return "Closed: missed original 24-hour down-payment deadline";
    case "DOWN_PAYMENT_CORRECTION_TIMEOUT":
      return "Closed: missed 12-hour correction deadline";
    case "DOWN_PAYMENT_CORRECTION_REJECTED":
      return "Closed: corrected proof rejected";
    default:
      return "";
  }
}

export default function PaymentTrackingView({ role = "admin" }) {
  const classes = CLASS_NAMES[role] || CLASS_NAMES.admin;
  const { payments, updatePayment, users, currentUser, loadPaymentProof } = useAdminData();
  const canVerifyPayments = canPerformAction(currentUser, ACTION_KEYS.paymentVerify);
  const reviewerUserType = normalizeUserType(currentUser);
  const customerNameByEmail = useMemo(() => {
    const map = new Map();
    users
      .filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer" && user.email)
      .forEach((user) => {
        map.set(String(user.email || "").trim().toLowerCase(), user.name || "");
      });
    return map;
  }, [users]);
  const getCustomerName = useCallback((payment) => {
    const email = String(payment?.customerEmail || "").trim().toLowerCase();
    return customerNameByEmail.get(email) || payment?.customer || "-";
  }, [customerNameByEmail]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", method: "" });
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [form, setForm] = useState(getPaymentFormDefaults());
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [proofDetails, setProofDetails] = useState({ paymentId: "", loading: false, error: "", downPayment: null, finalPayment: null });
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const savingPaymentRef = useRef(false);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return payments.filter((payment) => {
      const stageLabel = getPaymentStageLabel(payment);
      const method = getDisplayMethod(payment);
      const matchesQuery = !q || [
        payment.id,
        payment.bookingId,
        getCustomerName(payment),
        payment.customerEmail || "",
        payment.service,
        stageLabel,
        method,
      ].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesStatus = !filters.status || stageLabel === filters.status || payment.status === filters.status;
      const matchesMethod = !filters.method || method === filters.method || payment.method === filters.method;
      return matchesQuery && matchesStatus && matchesMethod;
    });
  }, [payments, query, filters, getCustomerName]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openPayment = (payment) => {
    setSelectedPayment(payment);
    setForm(getPaymentFormDefaults(payment));
    savingPaymentRef.current = false;
    setIsSavingPayment(false);
    setProofDetails({ paymentId: payment.id || payment.bookingId || "", loading: false, error: "", downPayment: null, finalPayment: null });
  };

  const downloadInvoicePdf = (payment) =>
    downloadAuthenticatedFile(`/api/admin/invoices/${encodeURIComponent(payment.id || payment.bookingId)}/pdf`, `autoflow-invoice-${payment.bookingId || payment.id}.pdf`)
      .catch((error) => setToast({ type: "error", message: error.message || "Could not download invoice.", id: Date.now() }));

  const exportPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("payments", "pdf"), "autoflow-payment-report.pdf")
      .catch((error) => setToast({ type: "error", message: error.message || "Could not download report.", id: Date.now() }));

  const selectedWithForm = selectedPayment ? {
    ...selectedPayment,
    downPaymentStatus: form.downPaymentStatus,
    finalPaymentStatus: form.finalPaymentStatus,
  } : null;
  const finalPaymentEnabled = selectedWithForm ? isDownPaymentSatisfied(selectedWithForm) : false;
  const finalPaymentReviewable = selectedPayment ? canReviewFinalPaymentStage(selectedPayment) : false;
  const finalPaymentLocked = selectedPayment ? isPaidStatus(selectedPayment.status) || isPaidStatus(selectedPayment.finalPaymentStatus) : false;
  const downPaymentReviewable = selectedPayment
    ? normalizeStageStatus(selectedPayment.downPaymentStatus, selectedPayment.downPaymentRequired === false ? "Not Required" : "Pending") === "For Verification"
    : false;
  const selectedPaymentWithProof = useMemo(() => {
    if (!selectedPayment) return null;
    return mergeProofIntoPayment(
      mergeProofIntoPayment(selectedPayment, proofDetails.downPayment, "downPayment"),
      proofDetails.finalPayment,
      "finalPayment"
    );
  }, [selectedPayment, proofDetails.downPayment, proofDetails.finalPayment]);

  useEffect(() => {
    if (!selectedPayment) return;
    const paymentId = selectedPayment.id || selectedPayment.bookingId || "";
    const stages = ["downPayment", "finalPayment"].filter((stage) => hasProofMetadata(selectedPayment, stage));
    if (!paymentId || !stages.length) return;

    let cancelled = false;
    setProofDetails((current) => ({ ...current, paymentId, loading: true, error: "" }));
    Promise.all(
      stages.map((stage) =>
        loadPaymentProof(paymentId, stage)
          .then((proof) => ({ stage, proof }))
          .catch((error) => ({ stage, error }))
      )
    ).then((results) => {
      if (cancelled) return;
      const nextDetails = { paymentId, loading: false, error: "", downPayment: null, finalPayment: null };
      results.forEach((result) => {
        if (result.error) {
          nextDetails.error = result.error.message || "Could not load payment proof.";
          return;
        }
        if (result.stage === "finalPayment") {
          nextDetails.finalPayment = result.proof;
        } else {
          nextDetails.downPayment = result.proof;
        }
      });
      setProofDetails(nextDetails);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedPayment, loadPaymentProof]);

  const renderProof = (src, fileName, label, { noProofRequired = false } = {}) => {
    if (proofDetails.loading) {
      return <div className={classes.hint}>Loading {label.toLowerCase()} proof...</div>;
    }
    if (!src && !fileName) {
      return <div className={classes.hint}>{noProofRequired ? "Cash payment - no proof required." : `No ${label.toLowerCase()} proof uploaded yet.`}</div>;
    }
    return (
      <>
        {src && <div className={classes.proofWrap}><img className={classes.proof} src={src} alt={`${label} proof`} /></div>}
        {fileName && <div className={classes.proofName}>{fileName}</div>}
      </>
    );
  };

  const getReferenceValidationDisplay = ({ method, reference, proofImage, proofAvailable, status, advisoryStatus }) => {
    const normalizedMethod = String(method || "").trim().toLowerCase();
    if (normalizedMethod === "cash" || status === "cash_not_required") {
      return { status: "cash", message: "OCR Check: Cash not required" };
    }
    if (!String(proofImage || "").trim() && !proofAvailable) {
      return { status: "no-proof", message: "No payment proof available for OCR check." };
    }
    if (!String(reference || "").trim()) {
      return { status: "no-reference", message: "No reference number provided by customer." };
    }
    const ocrLabel = getOcrCheckLabel(advisoryStatus || status);
    if (ocrLabel) return { status: advisoryStatus || status, message: ocrLabel };
    return { status: "legacy-not-checked", message: "OCR Check: Not available for legacy records" };
  };

  const renderReferenceValidation = ({ method, reference, proofImage, proofAvailable, status, advisoryStatus, checkedAt, detectedReference, possibleDuplicateReference }) => {
    const result = getReferenceValidationDisplay({ method, reference, proofImage, proofAvailable, status, advisoryStatus });

    return (
      <div className={classes.referenceChecker}>
        <div className={classes.referenceCheckerTop}>
          <div>
            <strong>OCR Advisory</strong>
            <span>OCR helps compare the submitted proof and reference. Manual verification is still required.</span>
          </div>
        </div>
        <div className={`${classes.checkerBadge} ${result.status}`}>
          {result.message}
        </div>
        {detectedReference ? (
          <div className={classes.checkerMeta}>Detected reference: {detectedReference}</div>
        ) : null}
        {possibleDuplicateReference ? (
          <div className={classes.warning}>Possible duplicate transaction reference - manual verification required.</div>
        ) : null}
        {checkedAt ? (
          <div className={classes.checkerMeta}>Submitted on {formatDateTime(checkedAt)}</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={classes.wrap}>
      <div className={classes.top}>
        <div className={classes.searchBox}>
          <img className={classes.searchIcon} src={icoSearch} alt="" />
          <input className={classes.searchInput} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search Payments..." />
        </div>
        <button className={classes.filterBtn} type="button" onClick={() => setIsFilterOpen(true)}>
          <img className={classes.filterIcon} src={icoFilter} alt="" />
        </button>
        {role === "admin" && <div className={classes.actions}><button className={classes.actionBtn} type="button" onClick={exportPdf}>Export as PDF</button></div>}
      </div>

      <div className={classes.board}>
        <table className={classes.table}>
          <thead>
            <tr><th>Booking ID</th><th>Booking Date</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th><th>Method</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={8} className={classes.empty}>No payments found.</td></tr>
            ) : paged.map((payment) => (
              <tr key={payment.id}>
                <td className={classes.bold}>{payment.bookingId || payment.id}</td>
                <td>{formatDate(payment.date)}</td>
                <td>{getCustomerName(payment)}</td>
                <td>{payment.service || "-"}</td>
                <td>{formatCurrency(getPaymentTotal(payment))}</td>
                <td><span className={`${classes.badge} ${getPaymentStageClass(payment)}`}>{getPaymentStageLabel(payment)}</span></td>
                <td>{getDisplayMethod(payment)}</td>
                <td className={classes.actionsCell}>
                  {canVerifyPayments ? <button className={classes.editBtn} type="button" onClick={() => openPayment(payment)}>✎</button> : "View only"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={classes.pagerRow}>
        <button className={classes.pagerBtn} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
        <span className={classes.pagerNum}>{safePage}</span>
        <button className={classes.pagerBtn} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>›</button>
      </div>

      {selectedPayment && (
        <div className={classes.modalOverlay} onClick={() => setSelectedPayment(null)}>
          <div className={classes.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className={classes.close} type="button" onClick={() => setSelectedPayment(null)}>x</button>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (savingPaymentRef.current) return;
                const showToast = (type, message) => setToast({ type, message, id: Date.now() });
                const isMarkingDownPaymentPaid = form.downPaymentStatus === "Paid" && selectedPayment.downPaymentStatus !== "Paid";
                const isMarkingFinalPaymentPaid = form.finalPaymentStatus === "Paid" && !isPaidStatus(selectedPayment.finalPaymentStatus) && !isPaidStatus(selectedPayment.status);
                const isRejectingDownPayment = form.downPaymentStatus === "Rejected" && selectedPayment.downPaymentStatus !== "Rejected";
                const isRejectingFinalPayment = form.finalPaymentStatus === "Rejected" && selectedPayment.finalPaymentStatus !== "Rejected";
                const requiresReviewCredential = isMarkingDownPaymentPaid || isMarkingFinalPaymentPaid || isRejectingDownPayment || isRejectingFinalPayment;
                const isReviewingFinalPayment = isMarkingFinalPaymentPaid || isRejectingFinalPayment;
                const savePayment = async (securityPayload = {}) => {
                  if (savingPaymentRef.current) return;
                  savingPaymentRef.current = true;
                  setIsSavingPayment(true);
                  try {
                    const finalPaymentPayload = finalPaymentReviewable
                      ? {
                          finalPaymentStatus: form.finalPaymentStatus,
                          finalPaymentNotes: form.finalPaymentNotes,
                        }
                      : {};
                    const nextStatus = form.finalPaymentStatus === "Paid" || form.finalPaymentStatus === "For Verification" || form.finalPaymentStatus === "Rejected"
                      ? form.finalPaymentStatus
                      : selectedPayment.status || "Pending";
                    await updatePayment(selectedPayment.id, {
                      status: finalPaymentReviewable ? nextStatus : selectedPayment.status || "Pending",
                      downPaymentStatus: form.downPaymentStatus,
                      downPaymentNotes: form.downPaymentNotes,
                      ...finalPaymentPayload,
                      ...(securityPayload.secret ? { specialPin: securityPayload.secret } : {}),
                      ...(securityPayload.accountName ? { accountName: securityPayload.accountName } : {}),
                    });
                    showToast("success", "Payment updated.");
                    setSelectedPayment(null);
                  } finally {
                    savingPaymentRef.current = false;
                    setIsSavingPayment(false);
                  }
                };
                if (requiresReviewCredential && !canVerifyPayments) {
                  showToast("error", "You can view payment status, but you cannot verify payments.");
                  return;
                }
                if (isReviewingFinalPayment && !finalPaymentReviewable) {
                  showToast("error", "Full payment can only be reviewed after the customer submits remaining balance proof.");
                  return;
                }
                if (requiresReviewCredential) {
                  const methodForCredential = isMarkingDownPaymentPaid || isRejectingDownPayment
                    ? selectedPayment.downPaymentMethod || selectedPayment.method
                    : selectedPayment.finalPaymentMethod || selectedPayment.method;
                  const isCashReview = String(methodForCredential || "").trim().toLowerCase() === "cash";
                  setSecurityConfirm({
                    mode: reviewerUserType === "staff" ? "pinWithAccount" : isCashReview ? "cash" : "pin",
                    actionKey: ACTION_KEYS.paymentVerify,
                    title: isMarkingDownPaymentPaid || isRejectingDownPayment
                      ? `${isRejectingDownPayment ? "Reject" : "Verify"} Down Payment`
                      : `${isRejectingFinalPayment ? "Reject" : "Verify"} Full Payment`,
                    message: `Enter the required security confirmation before marking this payment as ${isRejectingDownPayment || isRejectingFinalPayment ? "Rejected" : "Paid"}.`,
                    onConfirm: async (securityPayload) => {
                      try {
                        await savePayment(securityPayload);
                        setSecurityConfirm(null);
                      } catch (error) {
                        showToast("error", error?.message || "Could not update payment.");
                        throw error;
                      }
                    },
                  });
                  return;
                }
                try {
                  await savePayment();
                } catch (error) {
                  showToast("error", error?.message || "Could not update payment.");
                }
              }}
            >
              <div className={classes.title}>Review Payment</div>
              <div className={classes.details}>
                <div><strong>Booking:</strong> {selectedPayment.bookingId || selectedPayment.id}</div>
                <div><strong>Customer:</strong> {getCustomerName(selectedPayment)}</div>
                <div><strong>Email:</strong> {selectedPayment.customerEmail || "-"}</div>
                <div><strong>Billing Date:</strong> {formatDate(selectedPayment.date)}</div>
                <div><strong>Service:</strong> {selectedPayment.service || "-"}</div>
                <div><strong>Current Stage:</strong> {getPaymentStageLabel(selectedPayment)}</div>
                <div><strong>Booking Status:</strong> {selectedPayment.bookingStatus || selectedPayment.booking?.status || selectedPayment.status || "-"}</div>
              </div>

              <div className={classes.amountGrid}>
                <div><span>Total Amount</span><strong>{formatCurrency(getPaymentTotal(selectedPayment))}</strong></div>
                <div><span>Down Payment</span><strong>{formatCurrency(selectedPayment.downPaymentAmount || 0)}</strong></div>
                <div><span>Amount Paid</span><strong>{formatCurrency(getAmountPaid(selectedPayment))}</strong></div>
                <div><span>Remaining Balance</span><strong>{formatCurrency(getRemainingBalance(selectedPayment))}</strong></div>
              </div>

              <div className={classes.section}>
                <div className={classes.sectionTitle}>Down Payment</div>
                <div className={classes.hint}>
                  Stage/type: Required down payment. Expected amount: {formatCurrency(selectedPayment.downPaymentAmount || 0)}. Human verification state: {selectedPayment.downPaymentReviewStatus || normalizeStageStatus(selectedPayment.downPaymentStatus, selectedPayment.downPaymentRequired === false ? "Not Required" : "Pending")}.
                </div>
                {selectedPayment.downPaymentDueAt ? (
                  <div className={classes.hint}>Original 24-hour deadline: {formatDateTime(selectedPayment.downPaymentDueAt)}</div>
                ) : null}
                {selectedPayment.downPaymentCorrectionDueAt ? (
                  <div className={classes.hint}>Correction deadline: {formatDateTime(selectedPayment.downPaymentCorrectionDueAt)}</div>
                ) : null}
                {selectedPayment.downPaymentRejectionReason ? (
                  <div className={classes.hint}>Rejection reason: {selectedPayment.downPaymentRejectionReason}</div>
                ) : null}
                {getClosureLabel(selectedPayment.downPaymentClosureReasonCode || selectedPayment.cancellationCode) ? (
                  <div className={classes.warning}>{getClosureLabel(selectedPayment.downPaymentClosureReasonCode || selectedPayment.cancellationCode)}</div>
                ) : null}
                {form.downPaymentStatus === "Rejected" && downPaymentReviewable && !selectedPayment.downPaymentCorrectionDueAt && !selectedPayment.downPaymentCorrectionSubmittedAt ? (
                  <div className={classes.warning}>Rejecting this first down-payment submission opens one 12-hour customer correction window.</div>
                ) : null}
                {canVerifyPayments && downPaymentReviewable && !finalPaymentLocked ? (
                  <div className={classes.quickActions}>
                    <button className={classes.reviewBtn} type="button" onClick={() => setForm((prev) => ({ ...prev, downPaymentStatus: "Paid" }))}>Verify</button>
                    <button className={classes.reviewBtn} type="button" onClick={() => setForm((prev) => ({ ...prev, downPaymentStatus: "Rejected" }))}>Reject</button>
                  </div>
                ) : null}
                <div className={classes.grid}>
                  <label className={classes.field}>
                    <span>Status</span>
                    <select value={form.downPaymentStatus} onChange={(event) => setForm((prev) => ({ ...prev, downPaymentStatus: event.target.value }))} disabled={finalPaymentLocked}>
                      {getAllowedDownPaymentStatuses(selectedPayment).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span>Method</span>
                    <input value={formatSubmittedValue(form.downPaymentMethod)} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Reference Number</span>
                    <input value={formatSubmittedValue(form.downPaymentReference)} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Proof Submitted</span>
                    <input value={selectedPayment.downPaymentProofSubmittedAt || selectedPayment.proofSubmittedAt ? formatDateTime(selectedPayment.downPaymentProofSubmittedAt || selectedPayment.proofSubmittedAt) : "Not submitted"} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Human Verification State</span>
                    <input value={selectedPayment.downPaymentReviewStatus || normalizeStageStatus(selectedPayment.downPaymentStatus, selectedPayment.downPaymentRequired === false ? "Not Required" : "Pending")} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Correction Submitted</span>
                    <input value={selectedPayment.downPaymentCorrectionSubmittedAt ? formatDateTime(selectedPayment.downPaymentCorrectionSubmittedAt) : "Not submitted"} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Notes</span>
                    <textarea rows="3" value={form.downPaymentNotes} onChange={(event) => setForm((prev) => ({ ...prev, downPaymentNotes: event.target.value }))} disabled={finalPaymentLocked} />
                  </label>
                </div>
                {renderProof(
                  selectedPaymentWithProof?.downPaymentProofUrl || selectedPaymentWithProof?.proofImage,
                  selectedPayment.downPaymentProofName || selectedPayment.proofFileName,
                  "Down payment",
                  { noProofRequired: String(selectedPayment.downPaymentMethod || selectedPayment.method || "").trim().toLowerCase() === "cash" }
                )}
                {renderReferenceValidation({
                  method: selectedPayment.downPaymentMethod || selectedPayment.method,
                  reference: selectedPayment.downPaymentReference || selectedPayment.reference,
                  proofImage: selectedPaymentWithProof?.downPaymentProofUrl || selectedPaymentWithProof?.proofImage,
                  proofAvailable: hasProofMetadata(selectedPayment, "downPayment"),
                  status: selectedPaymentWithProof?.downPaymentReferenceCheckStatus || selectedPayment.downPaymentReferenceCheckStatus,
                  advisoryStatus: selectedPaymentWithProof?.downPaymentOcrAdvisoryStatus || selectedPayment.downPaymentOcrAdvisoryStatus,
                  checkedAt: selectedPaymentWithProof?.downPaymentReferenceCheckedAt || selectedPayment.downPaymentReferenceCheckedAt,
                  detectedReference: selectedPaymentWithProof?.downPaymentOcrDetectedReference || selectedPayment.downPaymentOcrDetectedReference,
                  possibleDuplicateReference: selectedPaymentWithProof?.downPaymentPossibleDuplicateReference || selectedPayment.downPaymentPossibleDuplicateReference,
                })}
              </div>

              <div className={classes.section}>
                <div className={classes.sectionTitle}>Full Payment / Remaining Balance</div>
                {!finalPaymentEnabled && <div className={classes.hint}>Full payment can only be updated after the down payment is verified as paid.</div>}
                {finalPaymentEnabled && !finalPaymentReviewable && <div className={classes.hint}>Full payment can only be reviewed after the customer submits remaining balance proof.</div>}
                <div className={classes.hint}>
                  Stage/type: Final payment / remaining balance. Expected amount: {formatCurrency(getRemainingBalance(selectedPayment))}. Human verification state: {selectedPayment.finalPaymentReviewStatus || normalizeStageStatus(selectedPayment.finalPaymentStatus, selectedPayment.status || "Pending")}.
                </div>
                {canVerifyPayments && finalPaymentReviewable && !finalPaymentLocked ? (
                  <div className={classes.quickActions}>
                    <button className={classes.reviewBtn} type="button" onClick={() => setForm((prev) => ({ ...prev, finalPaymentStatus: "Paid" }))}>Verify</button>
                    <button className={classes.reviewBtn} type="button" onClick={() => setForm((prev) => ({ ...prev, finalPaymentStatus: "Rejected" }))}>Reject</button>
                  </div>
                ) : null}
                <div className={classes.grid}>
                  <label className={classes.field}>
                    <span>Status</span>
                    <select value={form.finalPaymentStatus} onChange={(event) => setForm((prev) => ({ ...prev, finalPaymentStatus: event.target.value }))} disabled={!finalPaymentReviewable || finalPaymentLocked}>
                      {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span>Method</span>
                    <input value={formatSubmittedValue(form.finalPaymentMethod)} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Reference Number</span>
                    <input value={formatSubmittedValue(form.finalPaymentReference)} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Proof Submitted</span>
                    <input value={selectedPayment.finalPaymentProofSubmittedAt ? formatDateTime(selectedPayment.finalPaymentProofSubmittedAt) : "Not submitted"} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Human Verification State</span>
                    <input value={selectedPayment.finalPaymentReviewStatus || normalizeStageStatus(selectedPayment.finalPaymentStatus, selectedPayment.status || "Pending")} readOnly disabled />
                  </label>
                  <label className={classes.field}>
                    <span>Notes</span>
                    <textarea rows="3" value={form.finalPaymentNotes} onChange={(event) => setForm((prev) => ({ ...prev, finalPaymentNotes: event.target.value }))} disabled={!finalPaymentReviewable || finalPaymentLocked} />
                  </label>
                </div>
                {renderProof(
                  selectedPaymentWithProof?.finalPaymentProofUrl,
                  selectedPayment.finalPaymentProofName,
                  "Full payment",
                  { noProofRequired: String(selectedPayment.finalPaymentMethod || "").trim().toLowerCase() === "cash" }
                )}
                {renderReferenceValidation({
                  method: selectedPayment.finalPaymentMethod,
                  reference: selectedPayment.finalPaymentReference,
                  proofImage: selectedPaymentWithProof?.finalPaymentProofUrl,
                  proofAvailable: hasProofMetadata(selectedPayment, "finalPayment"),
                  status: selectedPaymentWithProof?.finalPaymentReferenceCheckStatus || selectedPayment.finalPaymentReferenceCheckStatus,
                  advisoryStatus: selectedPaymentWithProof?.finalPaymentOcrAdvisoryStatus || selectedPayment.finalPaymentOcrAdvisoryStatus,
                  checkedAt: selectedPaymentWithProof?.finalPaymentReferenceCheckedAt || selectedPayment.finalPaymentReferenceCheckedAt,
                  detectedReference: selectedPaymentWithProof?.finalPaymentOcrDetectedReference || selectedPayment.finalPaymentOcrDetectedReference,
                  possibleDuplicateReference: selectedPaymentWithProof?.finalPaymentPossibleDuplicateReference || selectedPayment.finalPaymentPossibleDuplicateReference,
                })}
                {proofDetails.error ? <div className={classes.hint}>{proofDetails.error}</div> : null}
              </div>

              <div className={classes.modalActions}>
                <button className={classes.textBtn} type="button" onClick={() => downloadInvoicePdf(selectedPayment)} disabled={isSavingPayment}>Download Invoice PDF</button>
                <button className={classes.textBtn} type="button" onClick={() => setSelectedPayment(null)} disabled={isSavingPayment}>Cancel</button>
                <button className={classes.primaryBtn} type="submit" disabled={isSavingPayment}>{isSavingPayment ? "Saving..." : "Save"}</button>
              </div>
              {finalPaymentLocked && <div className={classes.empty}>Paid payments are locked and their status can no longer be changed.</div>}
            </form>
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Payments"
        fields={[
          { key: "status", label: "Status", type: "select", options: STAGE_FILTER_OPTIONS },
          { key: "method", label: "Method", type: "select", options: [...new Set(payments.flatMap((payment) => [payment.method, payment.downPaymentMethod, payment.finalPaymentMethod]).filter(Boolean))] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => { setPage(1); setIsFilterOpen(false); }}
        onReset={() => { setFilters({ status: "", method: "" }); setPage(1); }}
      />
      <SecurityConfirmModal
        open={Boolean(securityConfirm)}
        mode={securityConfirm?.mode || "pin"}
        title={securityConfirm?.title}
        message={securityConfirm?.message}
        currentUser={currentUser}
        onClose={() => setSecurityConfirm(null)}
        actionKey={securityConfirm?.actionKey}
        onConfirm={securityConfirm?.onConfirm}
      />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
