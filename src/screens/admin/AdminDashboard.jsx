import "../../styles/css/admin/adminDashboardStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";

const pad2 = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function monthLabel(d) {
  const m = d.toLocaleString("en-US", { month: "long" });
  return `${m} ${d.getFullYear()}`;
}

function buildDerivedReorderLevel(item) {
  const maxStock = Math.max(0, Number(item?.maxStock || 0));
  if (!maxStock) return 0;
  return Math.max(1, Math.ceil(maxStock * 0.25));
}

function getDashboardStockState(item) {
  const currentStock = Math.max(0, Number(item?.currentStock || 0));
  const maxStock = Math.max(0, Number(item?.maxStock || 0));
  const reorderLevel = buildDerivedReorderLevel(item);
  const lowLevel = maxStock ? Math.max(reorderLevel + 1, Math.ceil(maxStock * 0.6)) : 0;

  if (!maxStock) {
    return { tone: "healthy", reorderLevel };
  }
  if (currentStock < reorderLevel) {
    return { tone: "critical", reorderLevel };
  }
  if (currentStock <= lowLevel) {
    return { tone: "low", reorderLevel };
  }
  return { tone: "healthy", reorderLevel };
}

function buildCalendarGrid(viewDate, bookings = []) {
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const start = new Date(y, m, 1 - startDay);

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toKey(d);
    const count = bookings.filter((b) => b.date === key).length;
    cells.push({ date: d, inMonth: d.getMonth() === m, key, day: d.getDate(), count });
  }
  return cells;
}

export default function AdminDashboard({ goTo }) {
  const { bookings, stockMonitoring, payments, quoteRequests, summary, updateQuoteRequest } = useAdminData();
  const [today] = useState(() => new Date());
  const [view, setView] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [selectedQuoteRequest, setSelectedQuoteRequest] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const cal = useMemo(() => buildCalendarGrid(view, bookings), [view, bookings]);
  const todayKey = toKey(today);
  const bookingsToday = bookings.filter((b) => b.date === todayKey).length;
  const selectedKey = toKey(selected);
  const todays = bookings.filter((b) => b.date === selectedKey);
  const paidRevenue = summary?.paidRevenue || payments.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const recentQuoteRequests = quoteRequests;
  const pendingPayments = payments.filter((payment) => payment.status !== "Paid");
  const pendingPaymentsCount = pendingPayments.length;
  const pendingPaymentsTotal = pendingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const inProgressCount = bookings.filter((booking) => String(booking.status || "").trim().toLowerCase() === "in progress").length;
  const stockSummary = useMemo(() => {
    const criticalItems = [];
    const lowItems = [];
    const healthyItems = [];

    stockMonitoring.forEach((item) => {
      const state = getDashboardStockState(item);
      if (state.tone === "critical") {
        criticalItems.push({ ...item, reorderLevel: state.reorderLevel });
        return;
      }
      if (state.tone === "low") {
        lowItems.push({ ...item, reorderLevel: state.reorderLevel });
        return;
      }
      healthyItems.push(item);
    });

    return {
      criticalItems,
      lowItems,
      healthyItems,
      criticalCount: criticalItems.length,
      lowCount: lowItems.length,
      healthyCount: healthyItems.length,
    };
  }, [stockMonitoring]);
  const upcomingBookings = useMemo(
    () =>
      [...bookings]
        .filter((booking) => String(booking.date || "") >= todayKey)
        .sort((left, right) => {
          const leftKey = `${left.date || ""} ${left.time || ""}`;
          const rightKey = `${right.date || ""} ${right.time || ""}`;
          return leftKey.localeCompare(rightKey);
        })
        .slice(0, 5),
    [bookings, todayKey]
  );
  const attentionAlerts = useMemo(() => {
    const out = [];
    if (stockSummary.criticalCount > 0) {
      out.push({
        title: `Critical stock (${stockSummary.criticalCount})`,
        description: "Items below the temporary reorder threshold need immediate restocking.",
        target: "stock-monitoring",
      });
    }
    if (stockSummary.lowCount > 0) {
      out.push({
        title: `Low stock (${stockSummary.lowCount})`,
        description: "Items nearing the reorder threshold should be reviewed next.",
        target: "stock-monitoring",
      });
    }
    if (pendingPaymentsCount > 0) out.push({ title: `Pending payments (${pendingPaymentsCount})`, description: `Total pending: ₱ ${pendingPaymentsTotal.toLocaleString()}`, target: "payments" });
    if (inProgressCount > 0) out.push({ title: `Jobs in progress (${inProgressCount})`, description: "Review service tracking to avoid delays.", target: "tracking" });
    return out;
  }, [stockSummary, pendingPaymentsCount, pendingPaymentsTotal, inProgressCount]);
  const paymentByBookingId = useMemo(
    () => new Map(payments.map((payment) => [payment.bookingId || payment.id, payment])),
    [payments]
  );
  const quoteStatusLabel = (status) => String(status || "").trim().toLowerCase() === "received" ? "Received" : "Under Review";

  return (
    <div className="adminDashWrap">
      <div className="adminDashStats">
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("bookings")}><div className="adminDashStatNum">{bookingsToday}</div><div className="adminDashStatLabel">Bookings today</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("tracking")}><div className="adminDashStatNum">{summary?.inProgressCount || 0}</div><div className="adminDashStatLabel">In Progress</div></button>
        <button className={`adminDashStatCard adminDashStatCardClickable${stockSummary.criticalCount > 0 ? " critical" : ""}`} type="button" onClick={() => goTo?.("stock-monitoring")}><div className="adminDashStatNum">{stockSummary.criticalCount}</div><div className="adminDashStatLabel">Critical Stock</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("payments")}><div className="adminDashStatNum">₱{Number(paidRevenue || 0).toLocaleString()}</div><div className="adminDashStatLabel">Paid Revenue</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("bookings")}><div className="adminDashStatNum">{summary?.totalSchedules || bookings.length}</div><div className="adminDashStatLabel">Schedules</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("stock-monitoring")}><div className="adminDashStatNum">{stockSummary.lowCount}</div><div className="adminDashStatLabel">Low Stock</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("tracking")}><div className="adminDashStatNum">{summary?.completedCount || 0}</div><div className="adminDashStatLabel">Completed</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("bookings")}><div className="adminDashStatNum">{summary?.cancelledCount || 0}</div><div className="adminDashStatLabel">Cancelled</div></button>
        <button className="adminDashStatCard adminDashStatCardClickable" type="button" onClick={() => goTo?.("stock-monitoring")}><div className="adminDashStatNum">{stockSummary.healthyCount}</div><div className="adminDashStatLabel">Healthy Stock</div></button>
      </div>

      <div className="adminDashTopGrid">
        <div className="adminDashCard">
          <div className="adminDashTitle">Attention Needed</div>
          <div className="adminDashSub">Quick alerts that need review.</div>
          {attentionAlerts.length === 0 ? (
            <div className="adminAttentionItem"><div className="adminAttentionName">No alerts</div><div className="adminAttentionDesc">Everything looks good right now.</div></div>
          ) : (
            attentionAlerts.map((a) => (
              <button className="adminAttentionItem adminAttentionItemClickable" type="button" key={a.title} onClick={() => goTo?.(a.target)}><div className="adminAttentionName">{a.title}</div><div className="adminAttentionDesc">{a.description}</div></button>
            ))
          )}
        </div>

        <div className="adminDashCard">
          <div className="adminDashTitle">Quick actions</div>
          <div className="adminDashSub">Common tasks you do often.</div>
          <div className="adminQuickGrid">
            <div className="adminQuickCard" onClick={() => goTo?.("bookings", { action: "open-add-booking" })}><div className="adminQuickTitle">Create Booking</div><div className="adminQuickDesc">Add a new appointment</div></div>
            <div className="adminQuickCard" onClick={() => goTo?.("stock-monitoring", { action: "open-add-stock-item" })}><div className="adminQuickTitle">Add stock item</div><div className="adminQuickDesc">Update stocks and supplies</div></div>
            <div className="adminQuickCard" onClick={() => goTo?.("services", { action: "open-add-service" })}><div className="adminQuickTitle">Add Service</div><div className="adminQuickDesc">Manage Service List</div></div>
            <div className="adminQuickCard" onClick={() => goTo?.("users")}><div className="adminQuickTitle">User Management</div><div className="adminQuickDesc">Manage admin, staff, and customers</div></div>
          </div>
        </div>

        <div className="adminDashCard">
          <div className="adminDashTitle">Recent Quote Requests</div>
          <div className="adminDashSub">Landing-page quote requests from potential customers.</div>
          <div className="adminQuoteRequestList">
          {recentQuoteRequests.length === 0 ? (
            <div className="adminAttentionItem"><div className="adminAttentionName">No quote requests yet</div><div className="adminAttentionDesc">New quote requests from the landing page will show here.</div></div>
          ) : (
            recentQuoteRequests.map((request) => (
              <button className="adminAttentionItem adminAttentionItemClickable" type="button" key={request.id} onClick={() => setSelectedQuoteRequest(request)}>
                <div className="adminAttentionName">{request.fullName} — {request.service}<span className={`adminQuoteStatus ${quoteStatusLabel(request.status) === "Received" ? "received" : "review"}`}>{quoteStatusLabel(request.status)}</span></div>
                <div className="adminAttentionDesc">{request.vehicleType} • {request.carSize} • {request.phone}</div>
              </button>
            ))
          )}
          </div>
        </div>
      </div>

      {selectedQuoteRequest && (
        <div className="adminDetailModalOverlay" onClick={() => setSelectedQuoteRequest(null)}>
        <div className="adminDashCard adminQuoteDetailCard adminDetailModalCard" onClick={(e) => e.stopPropagation()}>
          <div className="adminQuoteDetailHead">
            <div>
              <div className="adminDashTitle">Quote Request Details</div>
              <div className="adminDashSub">Review the selected landing-page quote request.</div>
            </div>
            <button type="button" className="adminQuoteDetailClose" onClick={() => setSelectedQuoteRequest(null)}>Close</button>
          </div>
          <div className="adminQuoteDetailGrid">
            <div className="adminQuoteDetailItem"><span>Name</span><strong>{selectedQuoteRequest.fullName || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Phone</span><strong>{selectedQuoteRequest.phone || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Vehicle Type</span><strong>{selectedQuoteRequest.vehicleType || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Car Size</span><strong>{selectedQuoteRequest.carSize || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Service</span><strong>{selectedQuoteRequest.service || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Estimate</span><strong>{selectedQuoteRequest.estimateLabel || "Custom quote available upon review"}</strong></div>
            <div className="adminQuoteDetailItem adminQuoteDetailItemWide"><span>Message</span><strong>{selectedQuoteRequest.message || "No additional notes provided."}</strong></div>
            <label className="adminQuoteDetailItem adminQuoteDetailItemWide"><span>Status</span><select value={quoteStatusLabel(selectedQuoteRequest.status)} onChange={async (event) => { await updateQuoteRequest(selectedQuoteRequest.id, { status: event.target.value }); setSelectedQuoteRequest((prev) => ({ ...prev, status: event.target.value })); }}><option>Under Review</option><option>Received</option></select></label>
          </div>
        </div>
        </div>
      )}

      {selectedBooking && (
        <div className="adminDetailModalOverlay" onClick={() => setSelectedBooking(null)}>
        <div className="adminDashCard adminQuoteDetailCard adminDetailModalCard" onClick={(e) => e.stopPropagation()}>
          <div className="adminQuoteDetailHead">
            <div>
              <div className="adminDashTitle">Booking Details</div>
              <div className="adminDashSub">Selected booking summary.</div>
            </div>
            <button type="button" className="adminQuoteDetailClose" onClick={() => setSelectedBooking(null)}>Close</button>
          </div>
          <div className="adminQuoteDetailGrid">
            <div className="adminQuoteDetailItem"><span>Booking ID</span><strong>{selectedBooking.id || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Customer</span><strong>{selectedBooking.customer || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Vehicle</span><strong>{selectedBooking.vehicle || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Plate Number</span><strong>{selectedBooking.plate || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Service</span><strong>{selectedBooking.service || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Promo</span><strong>{selectedBooking.promoTitle || selectedBooking.promoId || "No promo"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Car Size</span><strong>{selectedBooking.carSize || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Date</span><strong>{selectedBooking.date || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Time</span><strong>{selectedBooking.time || "No time selected"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Status</span><strong>{selectedBooking.status || "-"}</strong></div>
            <div className="adminQuoteDetailItem"><span>Payment Status</span><strong>{paymentByBookingId.get(selectedBooking.id)?.status || "-"}</strong></div>
          </div>
        </div>
        </div>
      )}

      <div className="adminCalendarCard">
        <div className="adminDashTitle">Calendar Summary</div>
        <div className="adminDashSub">Monthly view of bookings and daily totals.</div>

        <div className="adminCalendarGrid">
          <div>
            <div className="adminCalTop">
              <div>
                <div className="adminCalMain">Bookings Calendar</div>
                <div className="adminCalMini">{monthLabel(view)} • click a day to view</div>
              </div>
              <div className="adminCalControls">
                <button type="button" onClick={() => setView((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>←</button>
                <button type="button" onClick={() => { const now = new Date(); setView(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(now); }}>Today</button>
                <button type="button" onClick={() => setView((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>→</button>
              </div>
            </div>

            <div className="adminWeekRow">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (<div key={w}>{w}</div>))}</div>

            <div className="adminDaysGrid">
              {cal.map((c) => (
                <div key={c.key} className={`adminDay ${!c.inMonth ? "muted" : ""} ${c.key === selectedKey ? "active" : ""}`} onClick={() => c.inMonth && setSelected(c.date)}>
                  <span>{c.day}</span>
                  {c.count > 0 && <div className="adminDayBadge">{c.count}</div>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="adminCalMain">Bookings Overview</div>
            <div className="adminCalMini">Selected: {selectedKey} • {todays.length} booking(s)</div>
            <div className="adminUpcomingBlock">
              <div className="adminCalMain">Upcoming Bookings</div>
              <div className="adminCalMini">Next scheduled appointments from the current booking list.</div>
              <div className="adminOverviewList">
                {upcomingBookings.length === 0 ? (
                  <div className="adminOverviewItem"><div className="adminOverviewName">No upcoming bookings</div><div className="adminOverviewMeta">Future schedules will appear here once new appointments are added.</div></div>
                ) : (
                  upcomingBookings.map((booking) => (
                    <button className="adminOverviewItem adminAttentionItemClickable" type="button" key={`upcoming-${booking.id}`} onClick={() => setSelectedBooking(booking)}>
                      <div className="adminOverviewName">{booking.customer} — {booking.service}</div>
                      <div className="adminOverviewMeta">{booking.date} {booking.time ? `• ${booking.time}` : ""} • {booking.status}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="adminOverviewList">
              {todays.length === 0 ? (
                <div className="adminOverviewItem"><div className="adminOverviewName">No bookings</div><div className="adminOverviewMeta">No bookings on selected date.</div></div>
              ) : (
                todays.map((b) => (
                  <button className="adminOverviewItem adminAttentionItemClickable" type="button" key={b.id} onClick={() => setSelectedBooking(b)}><div className="adminOverviewName">{b.customer} — {b.service}</div><div className="adminOverviewMeta">{b.vehicle} • Status: {b.status}</div></button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
