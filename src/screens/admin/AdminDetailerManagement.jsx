import "../../styles/css/admin/adminFinancialTrackerStyle.css";
import { useMemo, useState } from "react";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import { ACTION_KEYS, canPerformAction } from "../../utils/rbac";
import { isDetailerRole } from "../../utils/staffRoles";

function matches(value, query) {
  return String(value || "").toLowerCase().includes(String(query || "").trim().toLowerCase());
}

function getPaymentForBooking(payments, bookingId) {
  return payments.find((payment) => String(payment.bookingId || "") === String(bookingId || "")) || {};
}

function getCommissionForBooking(commissions, bookingId) {
  return commissions.find((commission) => String(commission.bookingId || "") === String(bookingId || "")) || {};
}

export default function AdminDetailerManagement() {
  const { bookings, payments, commissions, users, currentUser, updateCommission } = useAdminData();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const canSensitiveCommission = canPerformAction(currentUser, ACTION_KEYS.commissionMarkPaid);
  const detailerByName = useMemo(() => {
    const map = new Map();
    users.filter((user) => isDetailerRole(user.role)).forEach((user) => {
      map.set(String(user.name || "").trim().toLowerCase(), user);
    });
    return map;
  }, [users]);

  const rows = useMemo(() => {
    return bookings
      .filter((booking) => String(booking.assigned || "").trim())
      .map((booking) => {
        const detailer = detailerByName.get(String(booking.assigned || "").trim().toLowerCase()) || {};
        const payment = getPaymentForBooking(payments, booking.id);
        const commission = getCommissionForBooking(commissions, booking.id);
        return { booking, detailer, payment, commission };
      })
      .filter(({ booking, detailer, payment, commission }) => {
        const haystack = [booking.id, booking.customer, booking.plate, booking.service, booking.assigned, booking.status].join(" ");
        const detailerRole = detailer.role || commission.role || "";
        const paymentStatus = payment.finalPaymentStatus || payment.status || "";
        const commissionStatus = commission.status || "Pending";
        return (
          (!query || matches(haystack, query)) &&
          (!roleFilter || detailerRole === roleFilter) &&
          (!statusFilter || booking.status === statusFilter) &&
          (!commissionFilter || commissionStatus === commissionFilter) &&
          (!paymentStatus || paymentStatus)
        );
      });
  }, [bookings, commissions, detailerByName, payments, query, roleFilter, statusFilter, commissionFilter]);

  const exportPdf = () =>
    exportTabularPdf({
      title: "Detailer Management Report",
      subtitle: "Assigned bookings, workload, payment status, and commission supervision.",
      sections: [
        {
          title: "Assigned Work",
          columns: ["Booking ID", "Customer", "Service", "Vehicle / Plate", "Detailer", "Role", "Date", "Status", "Payment", "Commission"],
          rows: rows.map(({ booking, detailer, payment, commission }) => [
            booking.id,
            booking.customer,
            booking.service,
            `${booking.vehicle || "-"} / ${booking.plate || "-"}`,
            booking.assigned || "-",
            detailer.role || commission.role || "-",
            booking.date || "-",
            booking.status || "-",
            payment.finalPaymentStatus || payment.status || "-",
            commission.status || "Pending",
          ]),
          emptyMessage: "No assigned detailer work matched the filters.",
        },
      ],
    });

  const markPaid = (commission) => {
    if (!commission?.id) return;
    setSecurityConfirm({
      mode: "password",
      scope: "admin",
      actionKey: ACTION_KEYS.commissionMarkPaid,
      title: "Mark Commission Paid",
      message: "Enter the admin special password before marking this commission as Paid.",
      onConfirm: async ({ secret }) => {
        await updateCommission(commission.id, { status: "Paid", specialPassword: secret });
        setSecurityConfirm(null);
        setToast({ type: "success", message: "Commission marked as paid.", id: Date.now() });
      },
    });
  };

  const voidCommission = (commission) => {
    if (!commission?.id) return;
    const reason = window.prompt("Reason for voiding this commission:");
    if (!reason) return;
    setSecurityConfirm({
      mode: "password",
      scope: "admin",
      actionKey: ACTION_KEYS.commissionVoid,
      title: "Void Commission",
      message: "Enter the admin special password before voiding this commission.",
      onConfirm: async ({ secret }) => {
        await updateCommission(commission.id, { status: "Voided", reason, specialPassword: secret });
        setSecurityConfirm(null);
        setToast({ type: "success", message: "Commission voided.", id: Date.now() });
      },
    });
  };

  return (
    <div className="finWrap">
      <div className="finCard">
        <div className="finCardHead finCardHeadStack">
          <div>
            <div className="finCardTitle">Detailer Task Overview</div>
            <div className="finCardSub">Supervise assigned Junior and Senior Detailer bookings, workload, and commission status.</div>
          </div>
          <button className="finExportBtn" type="button" onClick={exportPdf}>Export as PDF</button>
        </div>
        <div className="finFilters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search booking, customer, plate, service, detailer..." />
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option><option>Junior Detailer</option><option>Senior Detailer</option></select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All booking statuses</option><option>Pending</option><option>Scheduled</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select>
          <select value={commissionFilter} onChange={(event) => setCommissionFilter(event.target.value)}><option value="">All commissions</option><option>Pending</option><option>Earned</option><option>Paid</option><option>Cancelled</option><option>Voided</option></select>
        </div>
        <table className="finTable finCommissionTable">
          <thead><tr><th>Booking ID</th><th>Customer</th><th>Service</th><th>Vehicle / Plate</th><th>Assigned Detailer</th><th>Role</th><th>Status</th><th>Payment</th><th>Commission</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.length ? rows.map(({ booking, detailer, payment, commission }) => (
              <tr key={booking.id}>
                <td>{booking.id}</td>
                <td>{booking.customer}</td>
                <td>{booking.service}</td>
                <td>{booking.vehicle || "-"} / {booking.plate || "-"}</td>
                <td>{booking.assigned || "-"}</td>
                <td>{detailer.role || commission.role || "-"}</td>
                <td>{booking.status || "-"}</td>
                <td>{payment.finalPaymentStatus || payment.status || "-"}</td>
                <td>{commission.status || "Pending"}</td>
                <td>
                  <button className="finMiniBtn" type="button" onClick={() => window.print()}>Print</button>
                  {canPerformAction(currentUser, ACTION_KEYS.bookingReassignDetailer) && <button className="finMiniBtn" type="button" onClick={() => setToast({ type: "info", message: "Use Bookings to reassign this detailer.", id: Date.now() })}>Reassign</button>}
                  {canSensitiveCommission && commission.id && commission.status !== "Paid" && <button className="finMiniBtn" type="button" onClick={() => markPaid(commission)}>Paid</button>}
                  {canSensitiveCommission && commission.id && commission.status !== "Voided" && <button className="finMiniBtn" type="button" onClick={() => voidCommission(commission)}>Void</button>}
                </td>
              </tr>
            )) : <tr><td colSpan={10}>No assigned detailer work found.</td></tr>}
          </tbody>
        </table>
      </div>
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "password"} scope={securityConfirm?.scope} actionKey={securityConfirm?.actionKey} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
