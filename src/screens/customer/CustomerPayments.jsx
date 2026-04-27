import "../../styles/css/customer/customerPaymentsStyle.css";

import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const SALES_TAX_RATE = 0.12;

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrency(value) {
  return `P ${Number(value || 0).toLocaleString()}`;
}

function getInvoiceBreakdown(payment) {
  const total = Number(payment?.amount || 0);
  const originalTotal = Number(payment?.originalAmount || total);
  const discount = Number(payment?.promoDiscountAmount || 0);
  const originalSubtotal = Math.round((originalTotal / (1 + SALES_TAX_RATE)) * 100) / 100;
  const discountSubtotal = Math.round((discount / (1 + SALES_TAX_RATE)) * 100) / 100;
  const subtotal = Math.round((total / (1 + SALES_TAX_RATE)) * 100) / 100;
  const tax = Math.round((total - subtotal) * 100) / 100;

  return {
    originalSubtotal,
    discountSubtotal,
    discount,
    subtotal,
    tax,
    total,
  };
}

const statusMeta = (status) => {
  const s = String(status || "").toLowerCase();
  if (s.includes("paid")) return { cls: "paid", label: "Paid" };
  if (s.includes("verification")) return { cls: "review", label: "For Verification" };
  if (s.includes("reject")) return { cls: "rejected", label: "Rejected" };
  return { cls: "pending", label: status || "Pending" };
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function compressImageFile(file) {
  const rawDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await loadImage(rawDataUrl);
  const maxWidth = 1280;
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return rawDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export default function CustomerPayments() {
  const { payments, currentUser, submitPaymentProof } = useAdminData();
  const customerName = String(currentUser?.name || "").trim().toLowerCase();
  const customerEmail = String(currentUser?.email || "").trim().toLowerCase();
  const data = useMemo(
    () =>
      payments.filter((payment) => {
        const paymentEmail = String(payment.customerEmail || "").trim().toLowerCase();
        const paymentName = String(payment.customer || "").trim().toLowerCase();
        if (customerEmail && paymentEmail) return paymentEmail === customerEmail;
        return paymentName === customerName;
      }),
    [payments, customerEmail, customerName]
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", method: "" });
  const [modal, setModal] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [proofForm, setProofForm] = useState({
    reference: "",
    notes: "",
    method: "",
    proofImage: "",
    proofFileName: "",
  });

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return data.filter((row) => {
      const matchesQuery =
        !q ||
        String(row.id || "").toLowerCase().includes(q) ||
        String(row.customer || "").toLowerCase().includes(q) ||
        String(row.service || "").toLowerCase().includes(q) ||
        String(row.status || "").toLowerCase().includes(q) ||
        String(row.method || "").toLowerCase().includes(q) ||
        formatDate(row.date).toLowerCase().includes(q);
      const matchesStatus = !filters.status || row.status === filters.status;
      const matchesMethod = !filters.method || row.method === filters.method;
      return matchesQuery && matchesStatus && matchesMethod;
    });
  }, [data, query, filters]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const closeModal = () => {
    setModal(null);
    setSelectedPayment(null);
    setProofForm({ reference: "", notes: "", method: "", proofImage: "", proofFileName: "" });
  };

  return (
    <div className="clPayWrap">
      <div className="clPayTop">
        <div className="clPaySearchWrap">
          <div className="clPaySearchBox">
            <img src={icoSearch} alt="" className="clPaySearchIcon" />
            <input
              className="clPaySearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Payments..."
            />
          </div>
          <button className="clPayFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="clPayFilterIcon" />
          </button>
        </div>
      </div>

      <div className="clPayBoard">
        <div className="clPayHead">
          <div>Booking ID</div>
          <div>Booking Date</div>
          <div>Customer</div>
          <div>Service</div>
          <div>Amount</div>
          <div>Status</div>
          <div>Method</div>
          <div>Invoice</div>
          <div>Proof</div>
        </div>

        {pageRows.length === 0 ? (
          <div className="clPayEmptyRow"><div>No records found.</div></div>
        ) : (
          pageRows.map((row) => {
            const meta = statusMeta(row.status);
            return (
              <div className="clPayRow" key={row.id}>
                <div>{row.id}</div>
                <div>{formatDate(row.date)}</div>
                <div>{row.customer}</div>
                <div>{row.service}</div>
                <div>P {Number(row.amount || 0).toLocaleString()}</div>
                <div>
                  <span className={`clPayBadge ${meta.cls}`}>{meta.label}</span>
                </div>
                <div>{row.method || "-"}</div>
                <div>
                  <button
                    className="clPayViewBtn"
                    type="button"
                    onClick={() => {
                      setSelectedPayment(row);
                      setModal("invoice");
                    }}
                  >
                    View
                  </button>
                </div>
                <div>
                  <button
                    className="clPayProofBtn"
                    type="button"
                    onClick={() => {
                      setSelectedPayment(row);
                      setProofForm({
                        reference: row.reference || "",
                        notes: row.notes || "",
                        method: row.method || "",
                        proofImage: row.proofImage || "",
                        proofFileName: row.proofFileName || "",
                      });
                      setModal("proof");
                    }}
                  >
                    {row.proofImage ? "Update" : "Upload"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="clPayPager">
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          {"<"}
        </button>
        <div>{safePage}</div>
        <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
          {">"}
        </button>
      </div>

      {modal && selectedPayment && (
        <div className="clPayModalOverlay" onClick={closeModal}>
          <div className="clPayModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="clPayModalClose" type="button" onClick={closeModal}>
              x
            </button>

            {modal === "invoice" && (
              <div>
                <div className="clPayModalTitle">Sales Invoice</div>
                <div className="clPayInvoiceCard">
                  <div className="clPayInvoiceTop">
                    <div>
                      <div className="clPayInvoiceLabel">Invoice No.</div>
                      <div className="clPayInvoiceValue">{selectedPayment.bookingId || selectedPayment.id}</div>
                    </div>
                    <div className="clPayInvoiceRight">
                      <div className="clPayInvoiceLabel">Billing Date</div>
                      <div className="clPayInvoiceValue">{formatDate(selectedPayment.date)}</div>
                    </div>
                  </div>

                  <div className="clPayInvoiceGrid">
                    <div className="clPayInvoiceBlock">
                      <div className="clPayInvoiceBlockTitle">Customer Details</div>
                      <div><strong>Name:</strong> {selectedPayment.customer || currentUser?.name || "Customer"}</div>
                      <div><strong>Email:</strong> {selectedPayment.customerEmail || currentUser?.email || "-"}</div>
                    </div>

                    <div className="clPayInvoiceBlock">
                      <div className="clPayInvoiceBlockTitle">Appointment Details</div>
                      <div><strong>Service:</strong> {selectedPayment.service || "-"}</div>
                      <div><strong>Appointment:</strong> {selectedPayment.service || "Checking"}</div>
                      <div><strong>Status:</strong> {selectedPayment.status || "-"}</div>
                      <div><strong>Method:</strong> {selectedPayment.method || "-"}</div>
                    </div>
                  </div>

                  <div className="clPayBreakdownCard">
                    <div className="clPayBreakdownTitle">Amount Breakdown</div>
                    <div className="clPayBreakdownTable">
                      <div className="clPayBreakdownHead">
                        <div>Description</div>
                        <div>Amount</div>
                      </div>
                      <div className="clPayBreakdownRow">
                        <div>{selectedPayment.service || "Service Charge"}</div>
                        <div>{formatCurrency(getInvoiceBreakdown(selectedPayment).originalSubtotal)}</div>
                      </div>
                      {Number(selectedPayment.promoDiscountAmount || 0) > 0 && (
                        <div className="clPayBreakdownRow">
                          <div>{selectedPayment.promoTitle || "Promo Discount"} ({Number(selectedPayment.promoDiscountPercent || 0)}%)</div>
                          <div>- {formatCurrency(getInvoiceBreakdown(selectedPayment).discountSubtotal)}</div>
                        </div>
                      )}
                      <div className="clPayBreakdownRow">
                        <div>Subtotal After Discount</div>
                        <div>{formatCurrency(getInvoiceBreakdown(selectedPayment).subtotal)}</div>
                      </div>
                      <div className="clPayBreakdownRow">
                        <div>Tax ({Math.round(SALES_TAX_RATE * 100)}%)</div>
                        <div>{formatCurrency(getInvoiceBreakdown(selectedPayment).tax)}</div>
                      </div>
                      <div className="clPayBreakdownRow total">
                        <div>Total Amount</div>
                        <div>{formatCurrency(getInvoiceBreakdown(selectedPayment).total)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="clPayDetailList clPayDetailListCompact">
                    {selectedPayment.reference && <div><strong>Reference:</strong> {selectedPayment.reference}</div>}
                    {selectedPayment.proofSubmittedAt && <div><strong>Proof Submitted:</strong> {formatDate(selectedPayment.proofSubmittedAt)}</div>}
                  </div>

                  {selectedPayment.proofImage && (
                    <div className="clPayProofPreviewWrap">
                      <strong>Proof:</strong>
                      <img className="clPayProofPreview" src={selectedPayment.proofImage} alt="Payment proof" />
                    </div>
                  )}
                </div>
                <div className="clPayModalActions">
                  <button className="clPayPrimaryBtn" type="button" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {modal === "proof" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!proofForm.proofImage) {
                    window.alert("Please upload a payment proof image.");
                    return;
                  }
                  await submitPaymentProof(selectedPayment, {
                    method: proofForm.method,
                    reference: proofForm.reference,
                    notes: selectedPayment.notes || proofForm.notes || "",
                    proofImage: proofForm.proofImage,
                    proofFileName: proofForm.proofFileName,
                  });
                  closeModal();
                }}
              >
                <div className="clPayModalTitle">Submit Payment Proof</div>

                <label className="clPayField">
                  <span>Payment Method</span>
                  <select
                    value={proofForm.method}
                    onChange={(e) => setProofForm((prev) => ({ ...prev, method: e.target.value }))}
                    required
                  >
                    <option value="" disabled>
                      Select payment method
                    </option>
                    {["Cash", "E-Wallet", "Bank Transfer", "Online Transfer"].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="clPayField">
                  <span>Reference Number</span>
                  <input
                    value={proofForm.reference}
                    onChange={(e) => setProofForm((prev) => ({ ...prev, reference: e.target.value }))}
                    required
                  />
                </label>

                <label className="clPayField">
                  <span>Photo Proof</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const compressedImage = await compressImageFile(file);
                        setProofForm((prev) => ({
                          ...prev,
                          proofImage: compressedImage,
                          proofFileName: file.name,
                        }));
                      } catch (_error) {
                        window.alert("Failed to process the selected image.");
                      }
                    }}
                  />
                  {proofForm.proofFileName && (
                    <div className="clPayProofFile">Selected: {proofForm.proofFileName}</div>
                  )}
                  {proofForm.proofImage && (
                    <img className="clPayProofPreview" src={proofForm.proofImage} alt="Payment proof preview" />
                  )}
                </label>

                <label className="clPayField">
                  <span>Notes</span>
                  <textarea
                    rows="4"
                    value={proofForm.notes}
                    readOnly
                    placeholder="Admin/staff notes will appear here."
                  />
                </label>

                <div className="clPayModalActions">
                  <button className="clPayTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="clPayPrimaryBtn" type="submit">
                    Submit
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Payments"
        fields={[
          { key: "status", label: "Status", type: "select", options: [...new Set(data.map((row) => row.status).filter(Boolean))] },
          { key: "method", label: "Method", type: "select", options: [...new Set(data.map((row) => row.method).filter(Boolean))] },
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
