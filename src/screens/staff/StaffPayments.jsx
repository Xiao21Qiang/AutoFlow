import "../../styles/css/staff/staffPaymentsStyle.css";

import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function isPaidStatus(status) {
  return String(status || "").trim().toLowerCase() === "paid";
}

export default function StaffPayments() {
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
  const [form, setForm] = useState({ status: "Pending", method: "", reference: "", notes: "" });

  const filtered = (() => {
    const q = String(query || "").trim().toLowerCase();
    return payments.filter((r) => {
      const matchesQuery =
        !q ||
        [r.id, getCustomerName(r), r.customerEmail || "", r.service, r.status, r.method].some((v) =>
          String(v || "").toLowerCase().includes(q)
        );
      const matchesStatus = !filters.status || r.status === filters.status;
      const matchesMethod = !filters.method || r.method === filters.method;
      return matchesQuery && matchesStatus && matchesMethod;
    });
  })();

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const isPaidPaymentLocked = isPaidStatus(selectedPayment?.status);

  const badgeClass = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "paid") return "paid";
    if (normalized.includes("verification")) return "review";
    if (normalized.includes("reject")) return "rejected";
    return "pending";
  };

  return (
    <div className="stPayWrap">
      <div className="stPayTop">
        <div className="stPaySearchGroup">
          <div className="stPaySearchBox">
            <img src={icoSearch} alt="" className="stPaySearchIcon" />
            <input
              className="stPaySearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Payments..."
            />
          </div>
          <button className="stPayFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="stPayFilterIcon" />
          </button>
        </div>
      </div>

      <div className="stPayCard">
        <table className="stPayTbl">
          <thead>
            <tr>
              <th>Booking ID</th>
              <th>Booking Date</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Method</th>
              <th className="stPayColActions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={8} className="stPayEmpty">
                  No payments found.
                </td>
              </tr>
            ) : (
              paged.map((r) => {
                return (
                  <tr key={r.id}>
                    <td>{r.bookingId || r.id}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{getCustomerName(r)}</td>
                    <td>{r.service}</td>
                    <td>₱ {Number(r.amount || 0).toLocaleString()}</td>
                    <td>
                      <span className={`stPayBadge ${badgeClass(r.status)}`}>
                        {r.status || "Pending"}
                      </span>
                    </td>
                    <td>{r.method || "-"}</td>
                    <td className="stPayColActions">
                      <div className="stPayActions">
                        <button
                          className="stPayEditBtn"
                          type="button"
                          onClick={() => {
                            setSelectedPayment(r);
                            setForm({
                              status: r.status || "Pending",
                              method: r.method || "",
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="stPayPagerRow">
        <button className="stPayPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ‹
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <span
            key={p}
            className={`stPayPagerNum${p === safePage ? " active" : ""}`}
            onClick={() => setPage(p)}
          >
            {p}
          </span>
        ))}

        <button className="stPayPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          ›
        </button>
      </div>

      {selectedPayment && (
        <div className="stPayModalOverlay" onClick={() => setSelectedPayment(null)}>
          <div className="stPayModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="stPayModalClose" type="button" onClick={() => setSelectedPayment(null)}>
              x
            </button>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
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
              <div className="stPayModalTitle">Review Payment</div>
              <div className="stPayDetailList">
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

              {selectedPayment.proofImage && (
                <div className="stPayProofPreviewWrap">
                  <img className="stPayProofPreview" src={selectedPayment.proofImage} alt="Payment proof" />
                </div>
              )}

              <label className="stPayField">
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

              <label className="stPayField">
                <span>Payment Method</span>
                <select value={form.method} disabled>
                  <option value="">Select payment method</option>
                  {["Cash", "E-Wallet", "Bank Transfer", "Online Transfer"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="stPayField">
                <span>Reference Number</span>
                <input value={form.reference} readOnly />
              </label>

              <label className="stPayField">
                <span>Notes</span>
                <textarea rows="3" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </label>

              <div className="stPayModalActions">
                <button className="stPayTextBtn" type="button" onClick={() => setSelectedPayment(null)}>
                  Cancel
                </button>
                <button className="stPayPrimaryBtn" type="submit">
                  Save
                </button>
              </div>
              {isPaidPaymentLocked && (
                <div className="stPayEmpty">
                  Paid payments are locked and their status can no longer be changed.
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Payments"
        fields={[
          { key: "status", label: "Status", type: "select", options: ["Pending", "For Verification", "Paid", "Rejected"] },
          { key: "method", label: "Method", type: "select", options: [...new Set(payments.map((row) => row.method).filter((m) => m && m !== "-"))] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ status: "", method: "" });
          setPage(1);
        }}
      />
    </div>
  );
}
