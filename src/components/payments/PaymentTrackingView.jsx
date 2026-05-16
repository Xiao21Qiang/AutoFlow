import { useCallback, useMemo, useState } from "react";
import FilterModal from "../common/FilterModal";
import SecurityConfirmModal from "../common/SecurityConfirmModal";
import ToastMessage from "../common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  getAllowedDownPaymentStatuses,
  getAmountPaid,
  getPaymentFormDefaults,
  getPaymentStageClass,
  getPaymentStageLabel,
  getPaymentTotal,
  getRemainingBalance,
  isDownPaymentSatisfied,
  isPaidStatus,
} from "../../utils/paymentStages";
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
  },
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrency(value) {
  return `₱ ${Number(value || 0).toLocaleString()}`;
}

function getDisplayMethod(payment) {
  return payment.finalPaymentMethod || payment.downPaymentMethod || payment.method || "-";
}

export default function PaymentTrackingView({ role = "admin" }) {
  const classes = CLASS_NAMES[role] || CLASS_NAMES.admin;
  const { payments, updatePayment, users, currentUser } = useAdminData();
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
  };

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Payments Report",
      subtitle: "Filtered payment records exported in tabular format.",
      sections: [
        {
          columns: ["Booking ID", "Booking Date", "Customer", "Service", "Total", "Stage", "Method", "Reference"],
          rows: filtered.map((payment) => [
            payment.bookingId || payment.id,
            payment.date || "-",
            getCustomerName(payment),
            payment.service || "-",
            formatCurrency(getPaymentTotal(payment)),
            getPaymentStageLabel(payment),
            getDisplayMethod(payment),
            payment.finalPaymentReference || payment.downPaymentReference || payment.reference || "-",
          ]),
          emptyMessage: "No payments found for the selected filters.",
        },
      ],
    });

  const selectedWithForm = selectedPayment ? {
    ...selectedPayment,
    downPaymentStatus: form.downPaymentStatus,
    finalPaymentStatus: form.finalPaymentStatus,
  } : null;
  const finalPaymentEnabled = selectedWithForm ? isDownPaymentSatisfied(selectedWithForm) : false;
  const finalPaymentLocked = selectedPayment ? isPaidStatus(selectedPayment.status) || isPaidStatus(selectedPayment.finalPaymentStatus) : false;

  const renderProof = (src, fileName, label, { noProofRequired = false } = {}) => {
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
                  <button className={classes.editBtn} type="button" onClick={() => openPayment(payment)}>✎</button>
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
                const showToast = (type, message) => setToast({ type, message, id: Date.now() });
                const isMarkingDownPaymentPaid = form.downPaymentStatus === "Paid" && selectedPayment.downPaymentStatus !== "Paid";
                const isMarkingFinalPaymentPaid = form.finalPaymentStatus === "Paid" && !isPaidStatus(selectedPayment.finalPaymentStatus) && !isPaidStatus(selectedPayment.status);
                const savePayment = async (securityPayload = {}) => {
                  const nextStatus = form.finalPaymentStatus === "Paid" || form.finalPaymentStatus === "For Verification" || form.finalPaymentStatus === "Rejected"
                    ? form.finalPaymentStatus
                    : selectedPayment.status || "Pending";
                  await updatePayment(selectedPayment.id, {
                    ...selectedPayment,
                    status: nextStatus,
                    downPaymentStatus: form.downPaymentStatus,
                    downPaymentMethod: form.downPaymentMethod,
                    downPaymentReference: form.downPaymentReference,
                    downPaymentNotes: form.downPaymentNotes,
                    finalPaymentStatus: form.finalPaymentStatus,
                    finalPaymentMethod: form.finalPaymentMethod,
                    finalPaymentReference: form.finalPaymentReference,
                    finalPaymentNotes: form.finalPaymentNotes,
                    ...(securityPayload.secret ? { specialPin: securityPayload.secret } : {}),
                    ...(securityPayload.accountName ? { accountName: securityPayload.accountName } : {}),
                  });
                  showToast("success", "Payment updated.");
                  setSelectedPayment(null);
                };
                if (isMarkingDownPaymentPaid || isMarkingFinalPaymentPaid) {
                  const methodForCredential = isMarkingDownPaymentPaid ? form.downPaymentMethod : form.finalPaymentMethod;
                  setSecurityConfirm({
                    mode: role === "staff" || String(methodForCredential || "").trim().toLowerCase() === "cash" ? "cash" : "pin",
                    title: isMarkingDownPaymentPaid ? "Verify Down Payment" : "Verify Full Payment",
                    message: "Enter the required security confirmation before marking this payment as Paid.",
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
              </div>

              <div className={classes.amountGrid}>
                <div><span>Total Amount</span><strong>{formatCurrency(getPaymentTotal(selectedPayment))}</strong></div>
                <div><span>Down Payment</span><strong>{formatCurrency(selectedPayment.downPaymentAmount || 0)}</strong></div>
                <div><span>Amount Paid</span><strong>{formatCurrency(getAmountPaid(selectedPayment))}</strong></div>
                <div><span>Remaining Balance</span><strong>{formatCurrency(getRemainingBalance(selectedPayment))}</strong></div>
              </div>

              <div className={classes.section}>
                <div className={classes.sectionTitle}>Down Payment</div>
                <div className={classes.grid}>
                  <label className={classes.field}>
                    <span>Status</span>
                    <select value={form.downPaymentStatus} onChange={(event) => setForm((prev) => ({ ...prev, downPaymentStatus: event.target.value }))} disabled={finalPaymentLocked}>
                      {getAllowedDownPaymentStatuses(selectedPayment).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span>Method</span>
                    <select value={form.downPaymentMethod} onChange={(event) => setForm((prev) => ({ ...prev, downPaymentMethod: event.target.value }))} disabled={finalPaymentLocked || form.downPaymentStatus === "Not Required"}>
                      <option value="">Select payment method</option>
                      {PAYMENT_METHOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span>Reference Number</span>
                    <input value={form.downPaymentReference} onChange={(event) => setForm((prev) => ({ ...prev, downPaymentReference: event.target.value }))} disabled={finalPaymentLocked || form.downPaymentStatus === "Not Required"} />
                  </label>
                  <label className={classes.field}>
                    <span>Notes</span>
                    <textarea rows="3" value={form.downPaymentNotes} onChange={(event) => setForm((prev) => ({ ...prev, downPaymentNotes: event.target.value }))} disabled={finalPaymentLocked} />
                  </label>
                </div>
                {renderProof(
                  selectedPayment.downPaymentProofUrl || selectedPayment.proofImage,
                  selectedPayment.downPaymentProofName || selectedPayment.proofFileName,
                  "Down payment",
                  { noProofRequired: String(selectedPayment.downPaymentMethod || selectedPayment.method || "").trim().toLowerCase() === "cash" }
                )}
              </div>

              <div className={classes.section}>
                <div className={classes.sectionTitle}>Full Payment / Remaining Balance</div>
                {!finalPaymentEnabled && <div className={classes.hint}>Full payment can only be updated after the down payment is verified as paid.</div>}
                <div className={classes.grid}>
                  <label className={classes.field}>
                    <span>Status</span>
                    <select value={form.finalPaymentStatus} onChange={(event) => setForm((prev) => ({ ...prev, finalPaymentStatus: event.target.value }))} disabled={!finalPaymentEnabled || finalPaymentLocked}>
                      {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span>Method</span>
                    <select value={form.finalPaymentMethod} onChange={(event) => setForm((prev) => ({ ...prev, finalPaymentMethod: event.target.value }))} disabled={!finalPaymentEnabled || finalPaymentLocked}>
                      <option value="">Select payment method</option>
                      {PAYMENT_METHOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className={classes.field}>
                    <span>Reference Number</span>
                    <input value={form.finalPaymentReference} onChange={(event) => setForm((prev) => ({ ...prev, finalPaymentReference: event.target.value }))} disabled={!finalPaymentEnabled || finalPaymentLocked} />
                  </label>
                  <label className={classes.field}>
                    <span>Notes</span>
                    <textarea rows="3" value={form.finalPaymentNotes} onChange={(event) => setForm((prev) => ({ ...prev, finalPaymentNotes: event.target.value }))} disabled={!finalPaymentEnabled || finalPaymentLocked} />
                  </label>
                </div>
                {renderProof(selectedPayment.finalPaymentProofUrl || selectedPayment.proofImage, selectedPayment.finalPaymentProofName || selectedPayment.proofFileName, "Full payment")}
              </div>

              <div className={classes.modalActions}>
                <button className={classes.textBtn} type="button" onClick={() => setSelectedPayment(null)}>Cancel</button>
                <button className={classes.primaryBtn} type="submit">Save</button>
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
        onConfirm={securityConfirm?.onConfirm}
      />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
