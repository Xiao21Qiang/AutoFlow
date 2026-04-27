import "../../styles/css/admin/adminPaymentsStyle.css";
import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import { requireFreshAdminAuth } from "../../utils/reauth";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

function isPaidStatus(status) {
  return String(status || "").trim().toLowerCase() === "paid";
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function AdminPayments() {
  const { payments, updatePayment, users } = useAdminData();
  const customerNameByEmail = useMemo(() => {
    const map = new Map();
    users
      .filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer" && user.email)
      .forEach((user) => {
        map.set(String(user.email || "").trim().toLowerCase(), user.name || "");
      });
    return map;
  }, [users]);
  const getCustomerName = (payment) => {
    const email = String(payment?.customerEmail || "").trim().toLowerCase();
    return customerNameByEmail.get(email) || payment?.customer || "-";
  };
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", method: "" });
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [form, setForm] = useState({ status: "Pending", method: "Cash", reference: "", notes: "" });

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return payments.filter((r) => {
      const matchesQuery = !q || `${r.id} ${getCustomerName(r)} ${r.customerEmail || ""} ${r.status} ${r.service}`.toLowerCase().includes(q);
      const matchesStatus = !filters.status || r.status === filters.status;
      const matchesMethod = !filters.method || r.method === filters.method;
      return matchesQuery && matchesStatus && matchesMethod;
    });
  }, [payments, query, filters, customerNameByEmail]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const isPaidPaymentLocked = isPaidStatus(selectedPayment?.status);

  const statusClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("paid")) return "paid";
    if (normalized.includes("verification")) return "review";
    if (normalized.includes("reject")) return "rejected";
    return "pending";
  };

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Payments Report",
      subtitle: "Filtered payment records exported in tabular format.",
      sections: [
        {
          columns: ["Booking ID", "Booking Date", "Customer", "Service", "Amount", "Status", "Method", "Reference"],
          rows: filtered.map((payment) => [
            payment.bookingId || payment.id,
            payment.date || "-",
            getCustomerName(payment),
            payment.service || "-",
            `₱ ${Number(payment.amount || 0).toLocaleString()}`,
            payment.status || "-",
            payment.method || "-",
            payment.reference || "-",
          ]),
          emptyMessage: "No payments found for the selected filters.",
        },
      ],
    });

  return (
    <div className="payWrap">
      <div className="payTopRow">
        <div className="paySearchBox">
          <img className="paySearchIcon" src={icoSearch} alt="" />
          <input className="paySearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Payments..." />
        </div>

        <button className="payFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
          <img className="payFilterIcon" src={icoFilter} alt="" />
        </button>

        <div className="payActionBtns">
          <button className="payBtn payBtnDark" type="button" onClick={exportPdf}>Export as PDF</button>
        </div>
      </div>

      <div className="payBoard">
        <table className="payTable">
          <thead>
            <tr><th>Booking ID</th><th>Booking Date</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th><th>Method</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id}>
                <td className="payBold">{r.bookingId || r.id}</td>
                <td>{formatDate(r.date)}</td>
                <td>{getCustomerName(r)}</td>
                <td>{r.service}</td>
                <td>₱ {Number(r.amount).toLocaleString()}</td>
                <td><span className={`payStatus ${statusClass(r.status)}`}>{r.status}</span></td>
                <td>{r.method}</td>
                <td>
                  <div className="payActionsCell">
                    <button
                      className="payEditBtn"
                      type="button"
                      onClick={() => {
                        setSelectedPayment(r);
                        setForm({
                          status: r.status || "Pending",
                          method: r.method || "Cash",
                          reference: r.reference || "",
                          notes: r.notes || "",
                        });
                      }}
                    >
                      ✎
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={8} className="payEmpty">No payments found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="payPagerRow">
        <button className="payPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
        <span className="payPagerNum">{safePage}</span>
        <button className="payPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
      </div>

      {selectedPayment && (
        <div className="payModalOverlay" onClick={() => setSelectedPayment(null)}>
          <div className="payModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="payModalClose" type="button" onClick={() => setSelectedPayment(null)}>x</button>
            <form
	              onSubmit={async (e) => {
	                e.preventDefault();
	                if (!requireFreshAdminAuth("verify-payment")) return;
	                await updatePayment(selectedPayment.id, {
                  ...selectedPayment,
                  status: form.status,
                  method: form.method,
                  reference: form.reference,
                  notes: form.notes,
                });
                setSelectedPayment(null);
              }}
            >
              <div className="payModalTitle">Review Payment</div>
              <div className="payDetailList">
                <div><strong>Booking:</strong> {selectedPayment.bookingId || selectedPayment.id}</div>
                <div><strong>Customer:</strong> {getCustomerName(selectedPayment)}</div>
                <div><strong>Email:</strong> {selectedPayment.customerEmail || "-"}</div>
                <div><strong>Billing Date:</strong> {formatDate(selectedPayment.date)}</div>
                <div><strong>Service:</strong> {selectedPayment.service || "-"}</div>
                <div><strong>Amount:</strong> ₱ {Number(selectedPayment.amount || 0).toLocaleString()}</div>
                <div><strong>Status:</strong> {selectedPayment.status || "-"}</div>
                <div><strong>Method:</strong> {selectedPayment.method || "-"}</div>
                {selectedPayment.reference && <div><strong>Reference:</strong> {selectedPayment.reference}</div>}
                {selectedPayment.proofSubmittedAt && <div><strong>Proof Submitted:</strong> {formatDate(selectedPayment.proofSubmittedAt)}</div>}
              </div>

              <div className="payRecordMeta">
                <div className="payRecordMetaTitle">Database IDs</div>
                <div className="payRecordMetaRow">
                  <span>Mongo _id</span>
                  <code>{selectedPayment._id || "-"}</code>
                </div>
                <div className="payRecordMetaRow">
                  <span>Payment id</span>
                  <code>{selectedPayment.id || "-"}</code>
                </div>
                <div className="payRecordMetaRow">
                  <span>Booking id</span>
                  <code>{selectedPayment.bookingId || "-"}</code>
                </div>
              </div>

              {selectedPayment.proofImage && (
                <div className="payProofPreviewWrap">
                  <img className="payProofPreview" src={selectedPayment.proofImage} alt="Payment proof" />
                </div>
              )}

              <label className="payField">
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  disabled={isPaidPaymentLocked}
                >
                  {["Pending", "For Verification", "Paid", "Rejected"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="payField">
                <span>Payment Method</span>
                <select value={form.method} disabled>
                  {["Cash", "E-Wallet", "Bank Transfer", "Online Transfer"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="payField">
                <span>Reference Number</span>
                <input value={form.reference} readOnly />
              </label>

              <label className="payField">
                <span>Notes</span>
                <textarea rows="3" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </label>

              <div className="payModalActions">
                <button className="payTextBtn" type="button" onClick={() => setSelectedPayment(null)}>Cancel</button>
                <button className="payPrimaryBtn" type="submit">Save</button>
              </div>
              {isPaidPaymentLocked && <div className="payEmpty">Paid payments are locked and their status can no longer be changed.</div>}
            </form>
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Payments"
        fields={[
          { key: "status", label: "Status", type: "select", options: ["Pending", "For Verification", "Paid", "Rejected"] },
          { key: "method", label: "Method", type: "select", options: [...new Set(payments.map((payment) => payment.method).filter(Boolean))] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => { setPage(1); setIsFilterOpen(false); }}
        onReset={() => { setFilters({ status: "", method: "" }); setPage(1); }}
      />
    </div>
  );
}
