import "../../styles/css/staff/staffDashboardStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { DashboardBookingModal, DashboardQuoteRequestModal, quoteStatusLabel } from "../../components/dashboard/DashboardDetailModals";
import { getOutstandingBalance, getRecognizedRevenue, getStockState, isUpcomingBooking, normalizeBookingStatus, toAppDateKey } from "../../utils/businessMetrics";
import { ACTION_KEYS, MODULE_KEYS, canAccessModule, canPerformAction } from "../../utils/rbac";

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

export default function StaffDashboard({ session, goTo }) {
  const { bookings, stockMonitoring, payments, quoteRequests, summary, updateQuoteRequest } = useAdminData();
  const today = useMemo(() => new Date(), []);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(() => new Date(today));
  const [selectedQuoteRequest, setSelectedQuoteRequest] = useState(null);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const canOpenBookings = canAccessModule(session, MODULE_KEYS.bookings);
  const canOpenTracking = canAccessModule(session, MODULE_KEYS.serviceTracking);
  const canOpenStockMonitoring = canAccessModule(session, MODULE_KEYS.stockMonitoring);
  const canOpenPayments = canAccessModule(session, MODULE_KEYS.paymentTracking);
  const canOpenServices = canAccessModule(session, MODULE_KEYS.services);
  const canOpenEngagement = canAccessModule(session, MODULE_KEYS.engagement);
  const canCreateBooking = canPerformAction(session, ACTION_KEYS.bookingCreate);
  const canManageServices = canPerformAction(session, ACTION_KEYS.servicesManage);

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
  const todayKey = useMemo(() => toAppDateKey(today), [today]);

  const bookingsToday = summary?.bookingsToday ?? (bookingsByDate.get(todayKey) || []).length;
  const inProgressCount = summary?.inProgressCount ?? bookings.filter((b) => normalizeBookingStatus(b.status, "") === "In Progress").length;
  const paidRevenue = summary?.paidRevenue ?? payments.reduce((sum, p) => sum + getRecognizedRevenue(p), 0);
  const pendingPayments = payments.filter((payment) => getOutstandingBalance(payment) > 0);
  const pendingPaymentsCount = pendingPayments.length;
  const pendingPaymentsTotal = pendingPayments.reduce((sum, payment) => sum + getOutstandingBalance(payment), 0);
  const recentQuoteRequests = quoteRequests;
  const paymentByBookingId = useMemo(
    () => new Map(payments.map((payment) => [payment.bookingId || payment.id, payment])),
    [payments]
  );
  const selectedBooking = useMemo(
    () => bookings.find((booking) => String(booking.id || "") === selectedBookingId) || null,
    [bookings, selectedBookingId]
  );
  const stockSummary = useMemo(() => {
    const criticalItems = [];
    const lowItems = [];
    const healthyItems = [];

    stockMonitoring.forEach((item) => {
      const state = getStockState(item);
      if (state.key === "out" || state.key === "critical") {
        criticalItems.push({ ...item, reorderLevel: state.reorderLevel });
        return;
      }
      if (state.key === "low") {
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
        .filter((booking) => {
          return isUpcomingBooking(booking, todayKey);
        })
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
    if (canOpenStockMonitoring && stockSummary.criticalCount > 0) {
      out.push({ title: `Critical stock (${stockSummary.criticalCount})`, sub: "Items below the current reorder level need immediate restocking.", target: "stock-monitoring" });
    }
    if (canOpenStockMonitoring && stockSummary.lowCount > 0) {
      out.push({ title: `Low stock (${stockSummary.lowCount})`, sub: "Items just above the current reorder level should be reviewed next.", target: "stock-monitoring" });
    }
    if (canOpenPayments && pendingPaymentsCount > 0) {
      out.push({ title: `Pending payments (${pendingPaymentsCount})`, sub: `Total pending: ₱ ${pendingPaymentsTotal.toLocaleString()}`, target: "payments" });
    }
    if (canOpenTracking && inProgressCount > 0) out.push({ title: `Jobs in progress (${inProgressCount})`, sub: "Review service tracking to avoid delays.", target: "tracking" });
    return out;
  }, [canOpenPayments, canOpenStockMonitoring, canOpenTracking, stockSummary, pendingPaymentsCount, pendingPaymentsTotal, inProgressCount]);

  return (
    <div className="stDashWrap">
      <div className="stDashStats">
        {canOpenBookings && <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("bookings")}><div className="stDashStatNum">{bookingsToday}</div><div className="stDashStatLabel">Bookings today</div></button>}
        {canOpenTracking && <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("tracking")}><div className="stDashStatNum">{inProgressCount}</div><div className="stDashStatLabel">In Progress</div></button>}
        {canOpenStockMonitoring && <button className={`stDashStatCard stDashStatCardClickable${stockSummary.criticalCount > 0 ? " critical" : ""}`} type="button" onClick={() => goTo?.("stock-monitoring")}><div className="stDashStatNum">{stockSummary.criticalCount}</div><div className="stDashStatLabel">Critical Stock</div></button>}
        {canOpenPayments && <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("payments")}><div className="stDashStatNum">₱ {paidRevenue.toLocaleString()}</div><div className="stDashStatLabel">Paid Revenue</div></button>}
        {canOpenStockMonitoring && <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("stock-monitoring")}><div className="stDashStatNum">{stockSummary.lowCount}</div><div className="stDashStatLabel">Low Stock</div></button>}
        {canOpenStockMonitoring && <button className="stDashStatCard stDashStatCardClickable" type="button" onClick={() => goTo?.("stock-monitoring")}><div className="stDashStatNum">{stockSummary.healthyCount}</div><div className="stDashStatLabel">Healthy Stock</div></button>}
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
            {canOpenBookings && canCreateBooking && <div className="stQuickCard" onClick={() => goTo?.("bookings")}><div className="stQuickTitle">Create Booking</div><div className="stQuickDesc">Add a new appointment</div></div>}
            {canOpenStockMonitoring && <div className="stQuickCard" onClick={() => goTo?.("stock-monitoring")}><div className="stQuickTitle">Restock item</div><div className="stQuickDesc">Update stocks and supplies</div></div>}
            {canOpenServices && <div className="stQuickCard" onClick={() => goTo?.("services")}><div className="stQuickTitle">{canManageServices ? "Add Service" : "View Services"}</div><div className="stQuickDesc">{canManageServices ? "Manage service list" : "Inspect the service list"}</div></div>}
            {canOpenEngagement && <div className="stQuickCard" onClick={() => goTo?.("engagement")}><div className="stQuickTitle">Customer Reviews</div><div className="stQuickDesc">Read recent feedback</div></div>}
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

      <DashboardQuoteRequestModal
        selectedQuoteRequest={selectedQuoteRequest}
        onClose={() => setSelectedQuoteRequest(null)}
        updateQuoteRequest={async (id, payload) => {
          await updateQuoteRequest(id, payload);
          setSelectedQuoteRequest((prev) => (prev?.id === id ? { ...prev, ...payload } : prev));
        }}
        classPrefix="st"
      />

      <DashboardBookingModal
        selectedBooking={selectedBooking}
        onClose={() => setSelectedBookingId("")}
        paymentByBookingId={paymentByBookingId}
        classPrefix="st"
      />

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
                  <button className="stOverviewItem stAttentionItemClickable" type="button" key={`upcoming-${b.id}`} onClick={() => setSelectedBookingId(String(b.id || ""))}>
                    <div className="stOverviewName">{b.customer} — {b.service}</div>
                    <div className="stOverviewMeta">{b.date} {b.time ? `• ${b.time}` : ""} • {b.status}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="stOverviewList">
              {selectedBookings.length === 0 ? (
                <div className="stOverviewItem"><div className="stOverviewName">No bookings</div><div className="stOverviewMeta">No records for this day.</div></div>
              ) : selectedBookings.map((b) => (
                <button className="stOverviewItem stAttentionItemClickable" type="button" key={b.id} onClick={() => setSelectedBookingId(String(b.id || ""))}>
                  <div className="stOverviewName">{b.customer} — {b.service}</div>
                  <div className="stOverviewMeta">{b.vehicle} • Status: {b.status}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
