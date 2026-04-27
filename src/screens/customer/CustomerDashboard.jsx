import "../../styles/css/customer/customerDashboardStyle.css";
import { useMemo } from "react";
import { useAdminData } from "../../context/AdminDataContext";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function CustomerDashboard({ goTo }) {
  const { bookings, payments, currentUser } = useAdminData();
  const customerName = String(currentUser?.name || "").trim().toLowerCase();
  const clientBookings = useMemo(
    () => bookings.filter((booking) => String(booking.customer || "").trim().toLowerCase() === customerName),
    [bookings, customerName]
  );
  const clientPayments = useMemo(
    () => payments.filter((payment) => String(payment.customer || "").trim().toLowerCase() === customerName),
    [payments, customerName]
  );

  const stats = useMemo(
    () => ({
      totalBookings: clientBookings.length,
      inProgress: clientBookings.filter((booking) =>
        String(booking.status || "").toLowerCase().includes("progress")
      ).length,
      totalPaid: clientPayments
        .filter((payment) => String(payment.status || "").toLowerCase() === "paid")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    }),
    [clientBookings, clientPayments]
  );

  const upcomingBookings = useMemo(
    () =>
      [...clientBookings]
        .filter((booking) => booking.date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, 4)
        .map((booking) => ({
          id: booking.id,
          title: `${booking.service} - ${booking.vehicle}`,
          date: formatDate(booking.date),
        })),
    [clientBookings]
  );

  return (
    <div className="clDashWrap">
      <div className="clDashStats">
        <div className="clDashStatCard">
          <div className="clDashStatNum">{stats.totalBookings}</div>
          <div className="clDashStatLabel">Total Bookings</div>
        </div>
        <div className="clDashStatCard">
          <div className="clDashStatNum">{stats.inProgress}</div>
          <div className="clDashStatLabel">In Progress</div>
        </div>
        <div className="clDashStatCard">
          <div className="clDashStatNum">P {Number(stats.totalPaid).toLocaleString()}</div>
          <div className="clDashStatLabel">Total Paid</div>
        </div>
      </div>

      <div className="clDashGrid">
        <div className="clDashCard">
          <div className="clDashTitle">Upcoming bookings</div>
          <div className="clDashSub">Here are your next appointments</div>
          <div className="clDashList">
            {upcomingBookings.length === 0 ? (
              <div className="clUpcomingItem">
                <div className="clUpcomingName">No bookings yet</div>
                <div className="clUpcomingDate">Create your first appointment from Bookings or Services.</div>
              </div>
            ) : (
              upcomingBookings.map((booking) => (
                <div key={booking.id} className="clUpcomingItem">
                  <div className="clUpcomingName">{booking.title}</div>
                  <div className="clUpcomingDate">{booking.date}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="clDashCard">
          <div className="clDashTitle">Quick actions</div>
          <div className="clDashSub">Common tasks you do often.</div>
          <div className="clQuickGrid">
            <button type="button" className="clQuickCard" onClick={() => goTo?.("bookings", { action: "open-add-booking" })}>
              <div className="clQuickTitle">Create Booking</div>
              <div className="clQuickDesc">Add a new appointment</div>
            </button>
            <button type="button" className="clQuickCard" onClick={() => goTo?.("engagement", { action: "open-add-review" })}>
              <div className="clQuickTitle">Add Review</div>
              <div className="clQuickDesc">Share feedback and view promos</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
