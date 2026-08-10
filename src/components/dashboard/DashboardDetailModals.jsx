export function quoteStatusLabel(status) {
  return String(status || "").trim().toLowerCase() === "received" ? "Received" : "Under Review";
}

function fieldValue(value, fallback = "-") {
  return value || fallback;
}

export function DashboardQuoteRequestModal({
  selectedQuoteRequest,
  onClose,
  updateQuoteRequest,
  classPrefix = "admin",
}) {
  if (!selectedQuoteRequest) return null;

  const prefix = classPrefix === "st" ? "st" : "admin";

  return (
    <div className={`${prefix}DetailModalOverlay`} onClick={onClose}>
      <div className={`${prefix}DashCard ${prefix}QuoteDetailCard ${prefix}DetailModalCard`} onClick={(event) => event.stopPropagation()}>
        <div className={`${prefix}QuoteDetailHead`}>
          <div>
            <div className={`${prefix}DashTitle`}>Quote Request Details</div>
            <div className={`${prefix}DashSub`}>Review the selected landing-page quote request.</div>
          </div>
          <button type="button" className={`${prefix}QuoteDetailClose`} onClick={onClose}>Close</button>
        </div>
        <div className={`${prefix}QuoteDetailGrid`}>
          <div className={`${prefix}QuoteDetailItem`}><span>Name</span><strong>{fieldValue(selectedQuoteRequest.fullName)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Phone</span><strong>{fieldValue(selectedQuoteRequest.phone)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Vehicle Type</span><strong>{fieldValue(selectedQuoteRequest.vehicleType)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Car Size</span><strong>{fieldValue(selectedQuoteRequest.carSize)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Service</span><strong>{fieldValue(selectedQuoteRequest.service)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Estimate</span><strong>{selectedQuoteRequest.estimateLabel || "Custom quote available upon review"}</strong></div>
          <div className={`${prefix}QuoteDetailItem ${prefix}QuoteDetailItemWide`}><span>Message</span><strong>{selectedQuoteRequest.message || "No additional notes provided."}</strong></div>
          <label className={`${prefix}QuoteDetailItem ${prefix}QuoteDetailItemWide`}>
            <span>Status</span>
            <select
              value={quoteStatusLabel(selectedQuoteRequest.status)}
              onChange={async (event) => {
                const status = event.target.value;
                await updateQuoteRequest(selectedQuoteRequest.id, { status });
              }}
            >
              <option>Under Review</option>
              <option>Received</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

export function DashboardBookingModal({
  selectedBooking,
  onClose,
  paymentByBookingId,
  classPrefix = "admin",
}) {
  if (!selectedBooking) return null;

  const prefix = classPrefix === "st" ? "st" : "admin";
  const paymentStatus = paymentByBookingId?.get(selectedBooking.id)?.status || "-";

  return (
    <div className={`${prefix}DetailModalOverlay`} onClick={onClose}>
      <div className={`${prefix}DashCard ${prefix}QuoteDetailCard ${prefix}DetailModalCard`} onClick={(event) => event.stopPropagation()}>
        <div className={`${prefix}QuoteDetailHead`}>
          <div>
            <div className={`${prefix}DashTitle`}>Booking Details</div>
            <div className={`${prefix}DashSub`}>Selected booking summary.</div>
          </div>
          <button type="button" className={`${prefix}QuoteDetailClose`} onClick={onClose}>Close</button>
        </div>
        <div className={`${prefix}QuoteDetailGrid`}>
          <div className={`${prefix}QuoteDetailItem`}><span>Booking ID</span><strong>{fieldValue(selectedBooking.id)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Customer</span><strong>{fieldValue(selectedBooking.customer)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Vehicle</span><strong>{fieldValue(selectedBooking.vehicle)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Plate Number</span><strong>{fieldValue(selectedBooking.plate)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Service</span><strong>{fieldValue(selectedBooking.service)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Promo</span><strong>{selectedBooking.promoTitle || selectedBooking.promoId || "No promo"}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Car Size</span><strong>{fieldValue(selectedBooking.carSize)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Date</span><strong>{fieldValue(selectedBooking.date)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Time</span><strong>{selectedBooking.time || "No time selected"}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Status</span><strong>{fieldValue(selectedBooking.status)}</strong></div>
          <div className={`${prefix}QuoteDetailItem`}><span>Payment Status</span><strong>{paymentStatus}</strong></div>
        </div>
      </div>
    </div>
  );
}
