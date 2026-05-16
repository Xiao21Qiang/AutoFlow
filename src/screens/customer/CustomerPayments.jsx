import "../../styles/css/customer/customerPaymentsStyle.css";

import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import {
  PAYMENT_METHOD_OPTIONS,
  getAmountPaid,
  getPaymentStageClass,
  getPaymentStageLabel,
  getPaymentTotal,
  getRemainingBalance,
  normalizeStageStatus,
} from "../../utils/paymentStages";

const SALES_TAX_RATE = 0.12;

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatCurrency(value) {
  return `P ${Number(value || 0).toLocaleString()}`;
}

function isCashPaymentMethod(value) {
  return String(value || "").trim().toLowerCase() === "cash";
}

function getCustomerProofAction(payment = {}) {
  const legacyStatus = normalizeStageStatus(payment.status, "Pending");
  const downPaymentStatus = normalizeStageStatus(
    payment.downPaymentStatus,
    payment.downPaymentRequired === false ? "Not Required" : "Pending"
  );
  const finalPaymentStatus = normalizeStageStatus(payment.finalPaymentStatus, legacyStatus);

  if (finalPaymentStatus === "Paid" || legacyStatus === "Paid") {
    return { label: "Verified", disabled: true, mode: "" };
  }
  if (finalPaymentStatus === "For Verification") {
    return { label: "Pending Review", disabled: true, mode: "" };
  }
  if (payment.downPaymentRequired === true && ["Pending", "Rejected"].includes(downPaymentStatus)) {
    return { label: "Upload", disabled: false, mode: "downPayment" };
  }
  if (payment.downPaymentRequired === true && downPaymentStatus === "For Verification") {
    return { label: "Pending Review", disabled: true, mode: "" };
  }
  if (
    payment.downPaymentRequired === false ||
    downPaymentStatus === "Not Required" ||
    downPaymentStatus === "Paid"
  ) {
    return { label: "Pay Balance", disabled: false, mode: "finalPayment" };
  }

  return { label: "Upload", disabled: false, mode: "downPayment" };
}

function getInvoiceBreakdown(payment) {
  const total = Number(payment?.amount || 0);
  const originalTotal = Number(payment?.originalAmount || total);
  const promoDiscount = Number(payment?.promoDiscountAmount || 0);
  const rewardDiscount = Number(payment?.discountAmount || payment?.rewardDiscountAmount || 0);
  const totalDiscount = promoDiscount + rewardDiscount;
  const originalSubtotal = Math.round((originalTotal / (1 + SALES_TAX_RATE)) * 100) / 100;
  const promoDiscountSubtotal = Math.round((promoDiscount / (1 + SALES_TAX_RATE)) * 100) / 100;
  const rewardDiscountSubtotal = Math.round((rewardDiscount / (1 + SALES_TAX_RATE)) * 100) / 100;
  const subtotal = Number(payment?.subtotalAfterDiscount || 0) || Math.round((total / (1 + SALES_TAX_RATE)) * 100) / 100;
  const tax = Number(payment?.taxAmount || 0) || Math.round((total - subtotal) * 100) / 100;
  const finalAmount = Number(payment?.finalAmount || 0) || total;

  return {
    originalTotal,
    promoDiscount,
    rewardDiscount,
    originalSubtotal,
    promoDiscountSubtotal,
    rewardDiscountSubtotal,
    totalDiscount,
    subtotal,
    tax,
    total: finalAmount,
  };
}

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
  const [proofMode, setProofMode] = useState("downPayment");
  const [proofForm, setProofForm] = useState({
    reference: "",
    notes: "",
    method: "",
    proofImage: "",
    proofFileName: "",
  });
  const [proofError, setProofError] = useState("");

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return data.filter((row) => {
      const matchesQuery =
        !q ||
        String(row.id || "").toLowerCase().includes(q) ||
        String(row.customer || "").toLowerCase().includes(q) ||
        String(row.service || "").toLowerCase().includes(q) ||
        getPaymentStageLabel(row).toLowerCase().includes(q) ||
        String(row.finalPaymentMethod || row.downPaymentMethod || row.method || "").toLowerCase().includes(q) ||
        formatDate(row.date).toLowerCase().includes(q);
      const matchesStatus = !filters.status || getPaymentStageLabel(row) === filters.status || row.status === filters.status;
      const matchesMethod = !filters.method || row.finalPaymentMethod === filters.method || row.downPaymentMethod === filters.method || row.method === filters.method;
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
    setProofMode("downPayment");
    setProofForm({ reference: "", notes: "", method: "", proofImage: "", proofFileName: "" });
    setProofError("");
  };

  const openProofModal = (payment, mode) => {
    const isFinalPaymentMode = mode === "finalPayment";
    setSelectedPayment(payment);
    setProofMode(mode);
    setProofForm({
      reference: isFinalPaymentMode ? payment.finalPaymentReference || "" : payment.downPaymentReference || "",
      notes: isFinalPaymentMode ? payment.finalPaymentNotes || "" : payment.downPaymentNotes || "",
      method: isFinalPaymentMode ? payment.finalPaymentMethod || "" : payment.downPaymentMethod || "",
      proofImage: isFinalPaymentMode
        ? payment.finalPaymentProofUrl || ""
        : payment.downPaymentProofUrl || payment.proofImage || "",
      proofFileName: isFinalPaymentMode
        ? payment.finalPaymentProofName || ""
        : payment.downPaymentProofName || payment.proofFileName || "",
    });
    setProofError("");
    setModal("proof");
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
            const stageLabel = getPaymentStageLabel(row);
            const stageClass = getPaymentStageClass(row);
            const proofAction = getCustomerProofAction(row);
            return (
              <div className="clPayRow" key={row.id}>
                <div>{row.id}</div>
                <div>{formatDate(row.date)}</div>
                <div>{row.customer}</div>
                <div>{row.service}</div>
                <div>{formatCurrency(getPaymentTotal(row))}</div>
                <div>
                  <span className={`clPayBadge ${stageClass}`}>{stageLabel}</span>
                </div>
                <div>{row.finalPaymentMethod || row.downPaymentMethod || row.method || "-"}</div>
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
                      openProofModal(row, proofAction.mode || "downPayment");
                    }}
                    disabled={proofAction.disabled}
                  >
                    {proofAction.label}
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
                      <div><strong>Status:</strong> {getPaymentStageLabel(selectedPayment)}</div>
                      <div><strong>Method:</strong> {selectedPayment.downPaymentMethod || selectedPayment.method || "-"}</div>
                    </div>
                  </div>
                  <div className="clPayStageSummary">
                    <div><span>Total Amount</span><strong>{formatCurrency(getPaymentTotal(selectedPayment))}</strong></div>
                    <div><span>Required Down Payment</span><strong>{formatCurrency(selectedPayment.downPaymentAmount || 0)}</strong></div>
                    <div><span>Amount Paid</span><strong>{formatCurrency(getAmountPaid(selectedPayment))}</strong></div>
                    <div><span>Remaining Balance</span><strong>{formatCurrency(getRemainingBalance(selectedPayment))}</strong></div>
                    <div><span>Down Payment Status</span><strong>{normalizeStageStatus(selectedPayment.downPaymentStatus, selectedPayment.downPaymentRequired === false ? "Not Required" : "Pending")}</strong></div>
                    <div><span>Full Payment Status</span><strong>{normalizeStageStatus(selectedPayment.finalPaymentStatus, selectedPayment.status || "Pending")}</strong></div>
                  </div>

                  <div className="clPayBreakdownCard">
                    <div className="clPayBreakdownTitle">Amount Breakdown</div>
                    <div className="clPayBreakdownTable">
                      <div className="clPayBreakdownHead">
                        <div>Description</div>
                        <div>Amount</div>
                      </div>
                      <div className="clPayBreakdownRow">
                        <div>Original Amount</div>
                        <div>{formatCurrency(getInvoiceBreakdown(selectedPayment).originalTotal)}</div>
                      </div>
                      {Number(selectedPayment.promoDiscountAmount || 0) > 0 && (
                        <div className="clPayBreakdownRow">
                          <div>{selectedPayment.promoTitle || "Promo Discount"} ({Number(selectedPayment.promoDiscountPercent || 0)}%)</div>
                          <div>- {formatCurrency(getInvoiceBreakdown(selectedPayment).promoDiscount)}</div>
                        </div>
                      )}
                      <div className="clPayBreakdownRow">
                        <div>Reward Used</div>
                        <div>{selectedPayment.rewardId ? (selectedPayment.rewardName || "Reward") : "None"}</div>
                      </div>
                      {selectedPayment.rewardId && (
                        <>
                          <div className="clPayBreakdownRow">
                            <div>Discount Type</div>
                            <div>{selectedPayment.rewardType || "-"}</div>
                          </div>
                          <div className="clPayBreakdownRow">
                            <div>Discount Value</div>
                            <div>{selectedPayment.rewardValue || "-"}</div>
                          </div>
                          <div className="clPayBreakdownRow">
                            <div>Discount Amount</div>
                            <div>- {formatCurrency(getInvoiceBreakdown(selectedPayment).rewardDiscount)}</div>
                          </div>
                        </>
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
                        <div>Final Amount Due</div>
                        <div>{formatCurrency(getInvoiceBreakdown(selectedPayment).total)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="clPayDetailList clPayDetailListCompact">
                    {(selectedPayment.downPaymentReference || selectedPayment.reference) && <div><strong>Reference:</strong> {selectedPayment.downPaymentReference || selectedPayment.reference}</div>}
                    {selectedPayment.rewardId && <div><strong>Reward Used:</strong> {selectedPayment.rewardName || "-"} ({selectedPayment.rewardValue || selectedPayment.rewardType || "-"})</div>}
                    {selectedPayment.proofSubmittedAt && <div><strong>Proof Submitted:</strong> {formatDate(selectedPayment.proofSubmittedAt)}</div>}
                  </div>

                  {(selectedPayment.downPaymentProofUrl || selectedPayment.proofImage) && (
                    <div className="clPayProofPreviewWrap">
                      <strong>Down Payment Proof:</strong>
                      <img className="clPayProofPreview" src={selectedPayment.downPaymentProofUrl || selectedPayment.proofImage} alt="Payment proof" />
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
                  setProofError("");
                  const reference = String(proofForm.reference || "").trim();
                  const isCashMethod = isCashPaymentMethod(proofForm.method);
                  const isFinalPaymentMode = proofMode === "finalPayment";
                  if (!proofForm.method) {
                    setProofError(`Please select a ${isFinalPaymentMode ? "final payment" : "down payment"} method.`);
                    return;
                  }
                  if (!reference) {
                    setProofError("Please enter a reference number.");
                    return;
                  }
                  if (reference.length > 80) {
                    setProofError("Reference number must be 80 characters or less.");
                    return;
                  }
                  if (!isCashMethod && !proofForm.proofImage) {
                    setProofError(`Please upload a ${isFinalPaymentMode ? "final payment" : "down payment"} proof image.`);
                    return;
                  }
                  const proofPayload = isFinalPaymentMode
                    ? {
                        finalPaymentStatus: "For Verification",
                        finalPaymentMethod: proofForm.method,
                        finalPaymentReference: reference,
                        finalPaymentNotes: proofForm.notes,
                        finalPaymentProofUrl: isCashMethod ? "" : proofForm.proofImage,
                        finalPaymentProofName: isCashMethod ? "" : proofForm.proofFileName,
                      }
                    : {
                        downPaymentStatus: "For Verification",
                        downPaymentMethod: proofForm.method,
                        downPaymentReference: reference,
                        downPaymentNotes: proofForm.notes,
                        downPaymentProofUrl: isCashMethod ? "" : proofForm.proofImage,
                        downPaymentProofName: isCashMethod ? "" : proofForm.proofFileName,
                      };
                  try {
                    await submitPaymentProof(selectedPayment, proofPayload);
                    closeModal();
                  } catch (error) {
                    setProofError(error.message || "Failed to submit payment proof.");
                  }
                }}
              >
                <div className="clPayModalTitle">{proofMode === "finalPayment" ? "Submit Remaining Balance Proof" : "Submit Down Payment Proof"}</div>
                <div className="clPayStageSummary clPayStageSummaryCompact">
                  <div><span>Total Amount</span><strong>{formatCurrency(getPaymentTotal(selectedPayment))}</strong></div>
                  {proofMode === "finalPayment" ? (
                    <div><span>Amount Paid</span><strong>{formatCurrency(getAmountPaid(selectedPayment))}</strong></div>
                  ) : (
                    <div><span>Required Down Payment</span><strong>{formatCurrency(selectedPayment.downPaymentAmount || 0)}</strong></div>
                  )}
                  <div><span>Remaining Balance</span><strong>{formatCurrency(getRemainingBalance(selectedPayment))}</strong></div>
                  <div>
                    <span>{proofMode === "finalPayment" ? "Full Payment Status" : "Current DP Status"}</span>
                    <strong>
                      {proofMode === "finalPayment"
                        ? normalizeStageStatus(selectedPayment.finalPaymentStatus, selectedPayment.status || "Pending")
                        : normalizeStageStatus(selectedPayment.downPaymentStatus, selectedPayment.downPaymentRequired === false ? "Not Required" : "Pending")}
                    </strong>
                  </div>
                </div>

                <label className="clPayField">
                  <span>{proofMode === "finalPayment" ? "Final Payment Method" : "Down Payment Method"}</span>
                  <select
                    value={proofForm.method}
                    onChange={(e) => {
                      const method = e.target.value;
                      setProofForm((prev) => ({
                        ...prev,
                        method,
                        ...(isCashPaymentMethod(method) ? { proofImage: "", proofFileName: "" } : {}),
                      }));
                      if (isCashPaymentMethod(method) && proofError.includes("proof image")) {
                        setProofError("");
                      }
                    }}
                    required
                  >
                    <option value="" disabled>
                      Select payment method
                    </option>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
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
                    key={proofForm.method}
                    type="file"
                    accept="image/*"
                    disabled={isCashPaymentMethod(proofForm.method)}
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
                        setProofError("Failed to process the selected image.");
                      }
                    }}
                  />
                  {isCashPaymentMethod(proofForm.method) && (
                    <div className="clPayProofFile">Cash payment - no photo proof required.</div>
                  )}
                  {proofForm.proofFileName && (
                    <div className="clPayProofFile">Selected: {proofForm.proofFileName}</div>
                  )}
                  {proofForm.proofImage && (
                    <img className="clPayProofPreview" src={proofForm.proofImage} alt="Payment proof preview" />
                  )}
                </label>

                {proofError ? <div className="clPayFieldError">{proofError}</div> : null}

                <label className="clPayField">
                  <span>Notes</span>
                  <textarea
                    rows="4"
                    value={proofForm.notes}
                    onChange={(e) => setProofForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional note for admin/staff review."
                  />
                </label>

                <div className="clPayModalActions">
                  <button className="clPayTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="clPayPrimaryBtn" type="submit">
                    {proofMode === "finalPayment" ? "Submit Balance Proof" : "Submit"}
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
          { key: "status", label: "Status", type: "select", options: [...new Set(data.map((row) => getPaymentStageLabel(row)).filter(Boolean))] },
          { key: "method", label: "Method", type: "select", options: [...new Set(data.flatMap((row) => [row.finalPaymentMethod, row.downPaymentMethod, row.method]).filter(Boolean))] },
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
