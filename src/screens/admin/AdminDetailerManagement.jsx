import "../../styles/css/admin/adminFinancialTrackerStyle.css";
import { useMemo, useState } from "react";
import ToastMessage from "../../components/common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import { ACTION_KEYS, canPerformAction, isAdmin } from "../../utils/rbac";
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

function isActiveStaff(user) {
  const status = String(user?.status || "active").trim().toLowerCase();
  return user?.isActive !== false && !["inactive", "disabled", "deactivated"].includes(status);
}

function isTerminalCommissionStatus(status) {
  return ["paid", "voided", "cancelled"].includes(String(status || "").trim().toLowerCase());
}

function formatCurrency(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMPTY_ACTION_FORM = {
  assigned: "",
  specialPin: "",
  remarks: "",
  reason: "",
};

export default function AdminDetailerManagement() {
  const { bookings, payments, commissions, users, currentUser, updateCommission, reassignDetailer } = useAdminData();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [commissionFilter, setCommissionFilter] = useState("");
  const [actionModal, setActionModal] = useState(null);
  const [actionForm, setActionForm] = useState(EMPTY_ACTION_FORM);
  const [actionError, setActionError] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [toast, setToast] = useState(null);

  const canReassign = canPerformAction(currentUser, ACTION_KEYS.detailerReassign) || canPerformAction(currentUser, ACTION_KEYS.bookingReassignDetailer);
  const canManageDetailerCommission =
    canPerformAction(currentUser, ACTION_KEYS.commissionMarkPaid) &&
    canPerformAction(currentUser, ACTION_KEYS.commissionVoid);
  const credentialLabel = isAdmin(currentUser) ? "Admin Special PIN" : "Staff Special PIN";

  const activeDetailerOptions = useMemo(
    () => users.filter((user) => isActiveStaff(user) && isDetailerRole(user.role) && user.name),
    [users]
  );

  const detailerByName = useMemo(() => {
    const map = new Map();
    activeDetailerOptions.forEach((user) => {
      map.set(String(user.name || "").trim().toLowerCase(), user);
    });
    return map;
  }, [activeDetailerOptions]);

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

  const resetActionModal = () => {
    setActionModal(null);
    setActionForm(EMPTY_ACTION_FORM);
    setActionError("");
    setIsSubmittingAction(false);
  };

  const openReassign = (row) => {
    if (!canReassign) return;
    setActionModal({ type: "reassign", ...row });
    setActionForm({ ...EMPTY_ACTION_FORM, assigned: row.booking.assigned || "" });
    setActionError("");
  };

  const openPaid = (row) => {
    if (!row.commission?.id || !canManageDetailerCommission) return;
    setActionModal({ type: "paid", ...row });
    setActionForm(EMPTY_ACTION_FORM);
    setActionError("");
  };

  const openVoid = (row) => {
    if (!row.commission?.id || !canManageDetailerCommission) return;
    setActionModal({ type: "void", ...row });
    setActionForm(EMPTY_ACTION_FORM);
    setActionError("");
  };

  const submitAction = async (event) => {
    event.preventDefault();
    if (!actionModal || isSubmittingAction) return;

    const specialPin = String(actionForm.specialPin || "").trim();
    if (!specialPin) {
      setActionError(`${credentialLabel} is required.`);
      return;
    }

    try {
      setActionError("");
      setIsSubmittingAction(true);

      if (actionModal.type === "reassign") {
        const assigned = String(actionForm.assigned || "").trim();
        if (!assigned) {
          setActionError("Please choose a new assigned detailer.");
          setIsSubmittingAction(false);
          return;
        }
        await reassignDetailer(actionModal.booking.id, {
          assigned,
          specialPin,
          reason: actionForm.remarks,
        });
        setToast({ type: "success", message: "Detailer reassigned.", id: Date.now() });
      }

      if (actionModal.type === "paid") {
        await updateCommission(actionModal.commission.id, {
          status: "Paid",
          specialPin,
          remarks: actionForm.remarks,
        });
        setToast({ type: "success", message: "Commission marked as paid.", id: Date.now() });
      }

      if (actionModal.type === "void") {
        const reason = String(actionForm.reason || "").trim();
        if (!reason) {
          setActionError("Void reason is required.");
          setIsSubmittingAction(false);
          return;
        }
        await updateCommission(actionModal.commission.id, {
          status: "Voided",
          specialPin,
          reason,
        });
        setToast({ type: "success", message: "Commission voided.", id: Date.now() });
      }

      resetActionModal();
    } catch (error) {
      setActionError(error.message || "Unable to complete this action.");
      setIsSubmittingAction(false);
    }
  };

  const renderModal = () => {
    if (!actionModal) return null;

    const { booking, detailer, payment, commission } = actionModal;
    const modalTitle =
      actionModal.type === "reassign"
        ? "Reassign Detailer"
        : actionModal.type === "paid"
          ? "Mark Commission as Paid"
          : "Void Commission";
    const modalSub =
      actionModal.type === "reassign"
        ? "Override the assigned detailer for this booking."
        : `Use the ${credentialLabel} to confirm this commission action.`;

    return (
      <div className="finModalOverlay">
        <form className="finModalCard" role="dialog" aria-modal="true" onSubmit={submitAction}>
          <button className="finModalClose" type="button" onClick={resetActionModal}>x</button>
          <div className="finModalHeader">
            <div className="finModalTitle">{modalTitle}</div>
            <div className="finModalSub">{modalSub}</div>
          </div>

          <div className="finModalGrid">
            <label className="finModalField">
              <span>Booking ID</span>
              <div className="finModalComputed">{booking.id || "-"}</div>
            </label>
            {actionModal.type !== "reassign" && (
              <label className="finModalField">
                <span>Commission ID</span>
                <div className="finModalComputed">{commission.id || "-"}</div>
              </label>
            )}
            <label className="finModalField">
              <span>Customer</span>
              <div className="finModalComputed">{booking.customer || "-"}</div>
            </label>
            <label className="finModalField">
              <span>Service</span>
              <div className="finModalComputed">{booking.service || commission.service || "-"}</div>
            </label>
            <label className="finModalField">
              <span>Vehicle / Plate</span>
              <div className="finModalComputed">{booking.vehicle || "-"} / {booking.plate || "-"}</div>
            </label>
            <label className="finModalField">
              <span>Detailer</span>
              <div className="finModalComputed">{booking.assigned || commission.worker || "-"}</div>
            </label>
            <label className="finModalField">
              <span>Detailer Role</span>
              <div className="finModalComputed">{detailer.role || commission.role || "-"}</div>
            </label>
            {actionModal.type !== "reassign" && (
              <>
                <label className="finModalField">
                  <span>Commission Amount</span>
                  <div className="finModalComputed">{formatCurrency(commission.earned)}</div>
                </label>
                <label className="finModalField">
                  <span>Current Status</span>
                  <div className="finModalComputed">{commission.status || "Pending"}</div>
                </label>
              </>
            )}
            {actionModal.type === "reassign" && (
              <label className="finModalField finModalFieldWide">
                <span>New Assigned Detailer</span>
                <select className="finModalInput" value={actionForm.assigned} onChange={(event) => setActionForm((prev) => ({ ...prev, assigned: event.target.value }))}>
                  <option value="">Choose a detailer</option>
                  {activeDetailerOptions.map((user) => (
                    <option key={user.id || user.email || user.name} value={user.name}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {actionModal.type === "void" && (
              <label className="finModalField finModalFieldWide">
                <span>Required Reason</span>
                <textarea className="finModalTextarea" value={actionForm.reason} onChange={(event) => setActionForm((prev) => ({ ...prev, reason: event.target.value }))} placeholder="Explain why this commission should be voided." />
              </label>
            )}
            {actionModal.type !== "void" && (
              <label className="finModalField finModalFieldWide">
                <span>Remarks</span>
                <textarea className="finModalTextarea" value={actionForm.remarks} onChange={(event) => setActionForm((prev) => ({ ...prev, remarks: event.target.value }))} placeholder="Optional remarks" />
              </label>
            )}
            <label className="finModalField finModalFieldWide">
              <span>{credentialLabel}</span>
              <input className="finModalInput" type="password" inputMode="numeric" value={actionForm.specialPin} onChange={(event) => setActionForm((prev) => ({ ...prev, specialPin: event.target.value }))} placeholder={`Enter ${credentialLabel}`} />
            </label>
            {payment?.id && (
              <label className="finModalField">
                <span>Payment Status</span>
                <div className="finModalComputed">{payment.finalPaymentStatus || payment.status || "-"}</div>
              </label>
            )}
          </div>

          {actionError && <div className="finModalError">{actionError}</div>}

          <div className="finModalActions">
            <button className="finGhostBtn" type="button" onClick={resetActionModal} disabled={isSubmittingAction}>Cancel</button>
            <button className="finPrimaryBtn" type="submit" disabled={isSubmittingAction}>
              {isSubmittingAction ? "Saving..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    );
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
            {rows.length ? rows.map((row) => {
              const { booking, detailer, payment, commission } = row;
              const commissionLocked = isTerminalCommissionStatus(commission.status);
              return (
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
                    {canReassign && <button className="finMiniBtn" type="button" onClick={() => openReassign(row)}>Reassign</button>}
                    {canManageDetailerCommission && commission.id && !commissionLocked && <button className="finMiniBtn" type="button" onClick={() => openPaid(row)}>Paid</button>}
                    {canManageDetailerCommission && commission.id && !commissionLocked && <button className="finMiniBtn" type="button" onClick={() => openVoid(row)}>Void</button>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={10}>No assigned detailer work found.</td></tr>}
          </tbody>
        </table>
      </div>
      {renderModal()}
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
