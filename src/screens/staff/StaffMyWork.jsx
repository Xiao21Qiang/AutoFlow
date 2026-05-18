import "../../styles/css/admin/adminFinancialTrackerStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

function includesText(value, query) {
  return String(value || "").toLowerCase().includes(String(query || "").trim().toLowerCase());
}

function isPaidCommission(commission) {
  return String(commission?.status || "").trim().toLowerCase() === "paid";
}

export default function StaffMyWork({ session }) {
  const { bookings, payments, commissions, users } = useAdminData();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [completedOnly, setCompletedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const role = String(session?.role || "").trim().toLowerCase();
  const juniorNames = useMemo(
    () => new Set(users.filter((user) => String(user.role || "").trim().toLowerCase() === "junior detailer").map((user) => String(user.name || "").trim().toLowerCase())),
    [users]
  );

  const rows = useMemo(() => {
    return bookings.filter((booking) => {
      const commission = commissions.find((item) => item.bookingId === booking.id);
      const payment = payments.find((item) => item.bookingId === booking.id) || {};
      const haystack = [booking.id, booking.customer, booking.service, booking.vehicle, booking.plate, booking.status, booking.assigned].join(" ");
      const commissionPaid = isPaidCommission(commission);
      const isCompleted = String(booking.status || "").trim().toLowerCase() === "completed";
      return (
        (!query || includesText(haystack, query)) &&
        (!statusFilter || booking.status === statusFilter) &&
        (!commissionFilter || (commissionFilter === "paid" ? commissionPaid : !commissionPaid)) &&
        (!completedOnly || isCompleted) &&
        (!dateFrom || String(booking.date || "") >= dateFrom) &&
        (!dateTo || String(booking.date || "") <= dateTo) &&
        payment
      );
    });
  }, [bookings, commissions, payments, query, statusFilter, commissionFilter, completedOnly, dateFrom, dateTo]);

  const ownCommissions = useMemo(() => {
    const workerNames = new Set([session?.name, session?.email].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
    return commissions.filter((commission) => workerNames.has(String(commission.worker || "").trim().toLowerCase()));
  }, [commissions, session?.email, session?.name]);

  const exportPdf = () =>
    exportTabularPdf({
      title: "My Work Report",
      subtitle: "Assigned bookings, service tracking tasks, warranty tasks, and commission history.",
      sections: [
        {
          title: "Assigned Work",
          columns: ["Booking ID", "Customer", "Service", "Vehicle / Plate", "Date", "Status", "Assigned"],
          rows: rows.map((booking) => [booking.id, booking.customer, booking.service, `${booking.vehicle || "-"} / ${booking.plate || "-"}`, booking.date || "-", booking.status || "-", booking.assigned || "-"]),
          emptyMessage: "No assigned work matched the filters.",
        },
        {
          title: "Commission History",
          columns: ["Commission ID", "Booking ID", "Service", "Amount", "Status", "Date"],
          rows: ownCommissions.map((commission) => [commission.id, commission.bookingId, commission.service, Number(commission.earned || 0).toLocaleString("en-PH"), commission.status || "Pending", commission.date || "-"]),
          emptyMessage: "No commission records yet.",
        },
      ],
    });

  return (
    <div className="finWrap">
      <div className="finCard">
        <div className="finCardHead finCardHeadStack">
          <div>
            <div className="finCardTitle">My Work</div>
            <div className="finCardSub">Assigned bookings, service tracking tasks, warranty work, and commission history.</div>
          </div>
          <button className="finExportBtn" type="button" onClick={exportPdf}>Print / Export PDF</button>
        </div>
        <div className="finFilters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search booking ID, customer, service..." />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option>Pending</option><option>Scheduled</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select>
          <select value={commissionFilter} onChange={(event) => setCommissionFilter(event.target.value)}><option value="">All commission states</option><option value="paid">Paid commission</option><option value="unpaid">Unpaid commission</option></select>
          <label className="finCheck"><input type="checkbox" checked={completedOnly} onChange={(event) => setCompletedOnly(event.target.checked)} /> Completed only</label>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <table className="finTable finCommissionTable">
          <thead><tr><th>Booking ID</th><th>Customer</th><th>Service</th><th>Vehicle / Plate</th><th>Date</th><th>Status</th><th>Issue Notes</th><th>Warranty</th><th>Commission</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((booking) => {
              const commission = commissions.find((item) => item.bookingId === booking.id) || {};
              return (
                <tr key={booking.id}>
                  <td>{booking.id}</td>
                  <td>{booking.customer}</td>
                  <td>{booking.service}</td>
                  <td>{booking.vehicle || "-"} / {booking.plate || "-"}</td>
                  <td>{booking.date || "-"}</td>
                  <td>{booking.status || "-"}</td>
                  <td>{booking.issueNote || booking.issueTypes?.length ? "Saved" : "Needed"}</td>
                  <td>{booking.warrantyReleased ? "Released" : booking.warrantyChecklist ? "Drafted" : "Pending"}</td>
                  <td>{commission.status || "Pending"}</td>
                </tr>
              );
            }) : <tr><td colSpan={9}>No assigned work found.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="finCard finCommissionCard">
        <div className="finCardHead finCardHeadStack">
          <div>
            <div className="finCardTitle">Commission Audit</div>
            <div className="finCardSub">Your own commission history and status changes.</div>
          </div>
        </div>
        <table className="finTable finCommissionTable">
          <thead><tr><th>Commission ID</th><th>Booking ID</th><th>Service</th><th>Rate</th><th>Amount</th><th>Status</th><th>Date Paid</th></tr></thead>
          <tbody>
            {ownCommissions.length ? ownCommissions.map((commission) => (
              <tr key={commission.id}>
                <td>{commission.id}</td>
                <td>{commission.bookingId}</td>
                <td>{commission.service}</td>
                <td>{commission.rate || 0}%</td>
                <td>P{Number(commission.earned || 0).toLocaleString("en-PH")}</td>
                <td>{commission.status || "Pending"}</td>
                <td>{commission.datePaid || "-"}</td>
              </tr>
            )) : <tr><td colSpan={7}>No commission records yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {role === "senior detailer" && juniorNames.size > 0 && <div className="finCard"><div className="finCardTitle">Junior Detailer Work View</div><div className="finCardSub">Junior detailer work included above for supervision when assigned data is available.</div></div>}
    </div>
  );
}
