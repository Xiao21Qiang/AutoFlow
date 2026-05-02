import "../../styles/css/staff/staffDashboardStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";

const pad2 = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const sameDay = (a, b) => toKey(a) === toKey(b);

function addMonths(date, delta) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  const last = endOfMonth(d).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

function monthLabel(date) {
  const m = date.toLocaleString("en-US", { month: "long" });
  return `${m} ${date.getFullYear()}`;
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

function buildCalendarGrid(monthDate) {
  const first = startOfMonth(monthDate);
  const firstDow = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstDow);

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === monthDate.getMonth() });
  }
  return cells;
}

export default function StaffDashboard({ goTo }) {
  const { bookings, stockMonitoring, payments, quoteRequests, updateQuoteRequest } = useAdminData();
  const today = useMemo(() => new Date(), []);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(() => new Date(today));
  const [selectedQuoteRequest, setSelectedQuoteRequest] = useState(null);

  const bookingsByDate = useMemo(() => {
    const map = new Map();
    for (const booking of bookings) {
      const key = String(booking.date || "");
      const arr = map.get(key) || [];
      arr.push(booking);
      map.set(key, arr);
    }
    return map;
  }, [bookings]);

  const calendarCells = useMemo(() => buildCalendarGrid(monthDate), [monthDate]);
  const selectedKey = useMemo(() => toKey(selectedDate), [selectedDate]);
  const selectedBookings = useMemo(() => bookingsByDate.get(selectedKey) || [], [bookingsByDate, selectedKey]);
  const todayKey = useMemo(() => toKey(today), [today]);

  const bookingsToday = (bookingsByDate.get(todayKey) || []).length;
  const inProgressCount = bookings.filter((b) => b.status === "In Progress").length;
  const paidRevenue = payments.filter((p) => p.status === "Paid").reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingPaymentsCount = payments.filter((payment) => payment.status !== "Paid").length;
  const pendingPaymentsTotal = payments.filter((payment) => payment.status !== "Paid").reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const recentQuoteRequests = quoteRequests;
  const quoteStatusLabel = (status) => String(status || "").trim().toLowerCase() === "received" ? "Received" : "Under Review";
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

  const alerts = useMemo(() => {
    const out = [];
    if (stockSummary.criticalCount > 0) {
      out.push({ title: `Critical stock (${stockSummary.criticalCount})`, sub: "Items below the temporary reorder threshold need immediate restocking.", target: "stock-monitoring" });
    }
    if (stockSummary.lowCount > 0) {
      out.push({ title: `Low stock (${stockSummary.lowCount})`, sub: "Items nearing the reorder threshold should be reviewed next.", target: "stock-monitoring" });
    }
    if (pendingPaymentsCount > 0) {
      out.push({ title: `Pending payments (${pendingPaymentsCount})`, sub: `Total pending: ₱ ${pendingPaymentsTotal.toLocaleString()}`, target: "payments" });
    }
    if (inProgressCount > 0) out.push({ title: `Jobs in progress (${inProgressCount})`, sub: "Review service tracking to avoid delays.", target: "tracking" });
    return out;
  }, [stockSummary, pendingPaymentsCount, pendingPaymentsTotal, inProgressCount]);

  return (
    <div className="stDashWrap">
      <div className="stDashStats">
        <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("bookings")}><div className="stDashStatNum">{bookingsToday}</div><div className="stDashStatLabel">Bookings today</div></button>
        <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("tracking")}><div className="stDashStatNum">{inProgressCount}</div><div className="stDashStatLabel">In Progress</div></button>
        <button className={`stDashStatCard stDashStatCardClickable${stockSummary.criticalCount > 0 ? " critical" : ""}`} type="button" onClick={() => goTo?.("stock-monitoring")}><div className="stDashStatNum">{stockSummary.criticalCount}</div><div className="stDashStatLabel">Critical Stock</div></button>
        <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("payments")}><div className="stDashStatNum">₱ {paidRevenue.toLocaleString()}</div><div className="stDashStatLabel">Paid Revenues</div></button>
        <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("stock-monitoring")}><div className="stDashStatNum">{stockSummary.lowCount}</div><div className="stDashStatLabel">Low Stock</div></button>
        <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("stock-monitoring")}><div className="stDashStatNum">{stockSummary.healthyCount}</div><div className="stDashStatLabel">Healthy Stock</div></button>
      </div>

      <div className="stDashTopGrid">
        <div className="stDashCard">
          <div className="stDashTitle">Attention Needed</div>
          <div className="stDashSub">Quick alerts that need review.</div>
          <div className="stDashStack stQuoteRequestList">
            {alerts.length === 0 ? (
              <div className="stAttentionItem"><div className="stAttentionName">No alerts</div><div className="stAttentionDesc">Everything looks good.</div></div>
            ) : (
              alerts.map((a) => (
                <button key={a.title} className="stAttentionItem stAttentionItemClickable" type="button" onClick={() => goTo?.(a.target)}><div className="stAttentionName">{a.title}</div><div className="stAttentionDesc">{a.sub}</div></button>
              ))
            )}
          </div>
        </div>

        <div className="stDashCard">
          <div className="stDashTitle">Quick actions</div>
          <div className="stDashSub">Common tasks you do often.</div>
          <div className="stQuickGrid">
            <div className="stQuickCard" onClick={() => goTo?.("bookings")}><div className="stQuickTitle">Create Booking</div><div className="stQuickDesc">Add a new appointment</div></div>
            <div className="stQuickCard" onClick={() => goTo?.("stock-monitoring")}><div className="stQuickTitle">Restock item</div><div className="stQuickDesc">Update stocks and supplies</div></div>
            <div className="stQuickCard" onClick={() => goTo?.("services")}><div className="stQuickTitle">View Services</div><div className="stQuickDesc">Manage service list</div></div>
            <div className="stQuickCard" onClick={() => goTo?.("engagement")}><div className="stQuickTitle">Customer Reviews</div><div className="stQuickDesc">Read recent feedback</div></div>
          </div>
        </div>

        <div className="stDashCard">
          <div className="stDashTitle">Recent Quote Requests</div>
          <div className="stDashSub">Landing-page quote requests waiting for follow-up.</div>
          <div className="stDashStack">
            {recentQuoteRequests.length === 0 ? (
              <div className="stAttentionItem"><div className="stAttentionName">No quote requests yet</div><div className="stAttentionDesc">New quote requests will appear here.</div></div>
            ) : (
              recentQuoteRequests.map((request) => (
                <button key={request.id} className="stAttentionItem stAttentionItemClickable" type="button" onClick={() => setSelectedQuoteRequest(request)}>
                  <div className="stAttentionName">{request.fullName} — {request.service}<span className={`stQuoteStatus ${quoteStatusLabel(request.status) === "Received" ? "received" : "review"}`}>{quoteStatusLabel(request.status)}</span></div>
                  <div className="stAttentionDesc">{request.vehicleType} • {request.carSize} • {request.phone}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedQuoteRequest && (
        <div className="stDashCard stQuoteDetailCard">
          <div className="stQuoteDetailHead">
            <div>
              <div className="stDashTitle">Quote Request Details</div>
              <div className="stDashSub">Review the selected landing-page quote request.</div>
            </div>
            <button type="button" className="stQuoteDetailClose" onClick={() => setSelectedQuoteRequest(null)}>Close</button>
          </div>
          <div className="stQuoteDetailGrid">
            <div className="stQuoteDetailItem"><span>Name</span><strong>{selectedQuoteRequest.fullName || "-"}</strong></div>
            <div className="stQuoteDetailItem"><span>Phone</span><strong>{selectedQuoteRequest.phone || "-"}</strong></div>
            <div className="stQuoteDetailItem"><span>Vehicle Type</span><strong>{selectedQuoteRequest.vehicleType || "-"}</strong></div>
            <div className="stQuoteDetailItem"><span>Car Size</span><strong>{selectedQuoteRequest.carSize || "-"}</strong></div>
            <div className="stQuoteDetailItem"><span>Service</span><strong>{selectedQuoteRequest.service || "-"}</strong></div>
            <div className="stQuoteDetailItem"><span>Estimate</span><strong>{selectedQuoteRequest.estimateLabel || "Custom quote available upon review"}</strong></div>
            <div className="stQuoteDetailItem stQuoteDetailItemWide"><span>Message</span><strong>{selectedQuoteRequest.message || "No additional notes provided."}</strong></div>
            <label className="stQuoteDetailItem stQuoteDetailItemWide">
              <span>Status</span>
              <select
                value={quoteStatusLabel(selectedQuoteRequest.status)}
                onChange={async (event) => {
                  const status = event.target.value;
                  await updateQuoteRequest(selectedQuoteRequest.id, { status });
                  setSelectedQuoteRequest((prev) => ({ ...prev, status }));
                }}
              >
                <option>Under Review</option>
                <option>Received</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="stCalendarCard">
        <div className="stDashTitle">Calendar Summary</div>
        <div className="stDashSub">Monthly view of bookings and daily totals.</div>

        <div className="stCalendarGrid">
          <div>
            <div className="stCalTop">
              <div>
                <div className="stCalMain">Bookings Calendar</div>
                <div className="stCalMini">{monthLabel(monthDate)} • click a day to view</div>
              </div>
              <div className="stCalControls">
                <button type="button" onClick={() => setMonthDate((d) => startOfMonth(addMonths(d, -1)))}>←</button>
                <button type="button" onClick={() => { setMonthDate(startOfMonth(new Date())); setSelectedDate(new Date()); }}>Today</button>
                <button type="button" onClick={() => setMonthDate((d) => startOfMonth(addMonths(d, 1)))}>→</button>
              </div>
            </div>

            <div className="stWeekRow">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="stDaysGrid">
              {calendarCells.map(({ date, inMonth }) => {
                const key = toKey(date);
                const count = (bookingsByDate.get(key) || []).length;
                const isSelected = sameDay(date, selectedDate);
                const isToday = sameDay(date, today);

                return (
                  <div
                    key={key}
                    className={["stDay", !inMonth ? "muted" : "", isSelected ? "active" : "", isToday ? "today" : ""].filter(Boolean).join(" ")}
                    onClick={() => inMonth && setSelectedDate(new Date(date))}
                  >
                    <span>{date.getDate()}</span>
                    {count > 0 && <div className="stDayBadge">{count}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="stCalMain">Bookings Overview</div>
            <div className="stCalMini">Selected: {selectedKey} • {selectedBookings.length} booking(s)</div>
            <div className="stUpcomingBlock">
              <div className="stCalMain">Upcoming Bookings</div>
              <div className="stCalMini">Next scheduled appointments from the current booking list.</div>
              <div className="stOverviewList">
                {upcomingBookings.length === 0 ? (
                  <div className="stOverviewItem"><div className="stOverviewName">No upcoming bookings</div><div className="stOverviewMeta">Future schedules will appear here once new appointments are added.</div></div>
                ) : upcomingBookings.map((b) => (
                  <div className="stOverviewItem" key={`upcoming-${b.id}`}>
                    <div className="stOverviewName">{b.customer} — {b.service}</div>
                    <div className="stOverviewMeta">{b.date} {b.time ? `• ${b.time}` : ""} • {b.status}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="stOverviewList">
              {selectedBookings.length === 0 ? (
                <div className="stOverviewItem"><div className="stOverviewName">No bookings</div><div className="stOverviewMeta">No records for this day.</div></div>
              ) : selectedBookings.map((b) => (
                <div className="stOverviewItem" key={b.id}>
                  <div className="stOverviewName">{b.customer} — {b.service}</div>
                  <div className="stOverviewMeta">{b.vehicle} • Status: {b.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
