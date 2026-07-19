import "../../styles/css/staff/staffMyWorkStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";

const STATUS_OPTIONS = ["Pending", "Scheduled", "In Progress", "Completed", "Cancelled"];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function includesText(value, query) {
  return normalize(value).includes(normalize(query));
}

function getVehicleLabel(booking) {
  const vehicle = String(booking?.vehicle || "").trim() || "-";
  const plate = String(booking?.plate || "").trim() || "-";
  return `${vehicle} / ${plate}`;
}

function getIssueNotesStatus(booking) {
  return booking?.issueNote || booking?.issueTypes?.length || booking?.issueMarkers?.length ? "Saved" : "Needed";
}

function getWarrantyStatus(booking) {
  if (booking?.warrantyReleased) return "Released";
  if (booking?.warrantyChecklist || booking?.warrantyChecklistItems?.some((item) => item.done || item.notes)) return "Drafted";
  return "Pending";
}

function getCommissionForBooking(commissions, bookingId) {
  return commissions.find((commission) => String(commission.bookingId || "") === String(bookingId || "")) || {};
}

function getCommissionStatus(commissions, bookingId) {
  return getCommissionForBooking(commissions, bookingId).status || "Pending";
}

function getPersonNames(user = {}) {
  return [user.name, user.email]
    .map((value) => normalize(value))
    .filter(Boolean);
}

function getAssignedName(booking) {
  return normalize(booking?.assigned || booking?.assignedTo || booking?.assignedStaff || booking?.assignedDetailer);
}

function isAssignedToUser(booking, user = {}) {
  const assignedName = getAssignedName(booking);
  return Boolean(assignedName && getPersonNames(user).includes(assignedName));
}

function getDetailerNamesByRole(users, role) {
  return new Set(
    users
      .filter((user) => normalize(user.role) === normalize(role))
      .flatMap((user) => getPersonNames(user))
      .filter(Boolean)
  );
}

function filterBookings(bookings, filters, commissions) {
  return bookings.filter((booking) => {
    const commissionStatus = getCommissionStatus(commissions, booking.id);
    const isCompleted = normalize(booking.status) === "completed";
    const haystack = [
      booking.id,
      booking.customer,
      booking.service,
      booking.vehicle,
      booking.plate,
      booking.assigned,
    ].join(" ");

    return (
      (!filters.query || includesText(haystack, filters.query)) &&
      (!filters.status || booking.status === filters.status) &&
      (!filters.assigned || normalize(booking.assigned) === normalize(filters.assigned)) &&
      (!filters.commissionStatus || normalize(commissionStatus) === normalize(filters.commissionStatus)) &&
      (!filters.completedOnly || isCompleted) &&
      (!filters.dateFrom || String(booking.date || "") >= filters.dateFrom) &&
      (!filters.dateTo || String(booking.date || "") <= filters.dateTo)
    );
  });
}

function WorkTable({ rows, commissions, emptyMessage, showAssigned = false, onView }) {
  return (
    <div className="mwTableWrap">
      <table className="mwTable">
        <thead>
          <tr>
            <th>Booking ID</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Vehicle / Plate</th>
            {showAssigned && <th>Assigned Detailer</th>}
            <th>Date</th>
            <th>Status</th>
            <th>Issue Notes</th>
            <th>Warranty</th>
            <th>Commission</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((booking) => {
            const commissionStatus = getCommissionStatus(commissions, booking.id);
            return (
              <tr key={booking.id}>
                <td className="mwStrong">{booking.id}</td>
                <td>{booking.customer || "-"}</td>
                <td>{booking.service || "-"}</td>
                <td>{getVehicleLabel(booking)}</td>
                {showAssigned && <td>{booking.assigned || "-"}</td>}
                <td>{booking.date || "-"}</td>
                <td><span className="mwPill">{booking.status || "-"}</span></td>
                <td>{getIssueNotesStatus(booking)}</td>
                <td>{getWarrantyStatus(booking)}</td>
                <td>{commissionStatus}</td>
                <td><button className="mwRowBtn" type="button" onClick={() => onView?.(booking)}>Details</button></td>
              </tr>
            );
          }) : (
            <tr>
              <td className="mwEmpty" colSpan={showAssigned ? 11 : 10}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FilterGrid({ filters, onChange, detailerOptions = [], showDetailerFilter = false }) {
  return (
    <div className="mwFilters">
      <input
        value={filters.query}
        onChange={(event) => onChange("query", event.target.value)}
        placeholder="Search booking ID, customer, service..."
      />
      <select value={filters.status} onChange={(event) => onChange("status", event.target.value)}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
      </select>
      {showDetailerFilter && (
        <select value={filters.assigned} onChange={(event) => onChange("assigned", event.target.value)}>
          <option value="">All junior detailers</option>
          {detailerOptions.map((name) => <option key={name}>{name}</option>)}
        </select>
      )}
      <select value={filters.commissionStatus} onChange={(event) => onChange("commissionStatus", event.target.value)}>
        <option value="">All commissions</option>
        <option>Pending</option>
        <option>Earned</option>
        <option>Paid</option>
        <option>Cancelled</option>
        <option>Voided</option>
      </select>
      <label className="mwCheck">
        <input
          type="checkbox"
          checked={filters.completedOnly}
          onChange={(event) => onChange("completedOnly", event.target.checked)}
        />
        Completed only
      </label>
      <input type="date" value={filters.dateFrom} onChange={(event) => onChange("dateFrom", event.target.value)} />
      <input type="date" value={filters.dateTo} onChange={(event) => onChange("dateTo", event.target.value)} />
    </div>
  );
}

function createFilters() {
  return {
    query: "",
    status: "",
    assigned: "",
    commissionStatus: "",
    completedOnly: false,
    dateFrom: "",
    dateTo: "",
  };
}

export default function StaffMyWork({ session }) {
  const { bookings, commissions, users } = useAdminData();
  const [personalFilters, setPersonalFilters] = useState(createFilters);
  const [juniorFilters, setJuniorFilters] = useState(createFilters);
  const [selectedWork, setSelectedWork] = useState(null);

  const role = normalize(session?.role);
  const juniorDetailerNames = useMemo(() => getDetailerNamesByRole(users, "Junior Detailer"), [users]);
  const juniorDetailerDisplayNames = useMemo(
    () =>
      [...new Set(
        users
          .filter((user) => normalize(user.role) === "junior detailer")
          .map((user) => String(user.name || user.email || "").trim())
          .filter(Boolean)
      )],
    [users]
  );

  const personalBookings = useMemo(
    () => bookings.filter((booking) => isAssignedToUser(booking, session)),
    [bookings, session]
  );

  const juniorBookings = useMemo(
    () => bookings.filter((booking) => juniorDetailerNames.has(getAssignedName(booking))),
    [bookings, juniorDetailerNames]
  );

  const visiblePersonalBookings = useMemo(
    () => filterBookings(personalBookings, personalFilters, commissions),
    [commissions, personalBookings, personalFilters]
  );

  const visibleJuniorBookings = useMemo(
    () => filterBookings(juniorBookings, juniorFilters, commissions),
    [commissions, juniorBookings, juniorFilters]
  );

  const ownCommissions = useMemo(() => {
    const workerNames = new Set(getPersonNames(session));
    return commissions.filter((commission) => workerNames.has(normalize(commission.worker)));
  }, [commissions, session]);

  const updatePersonalFilter = (key, value) => {
    setPersonalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateJuniorFilter = (key, value) => {
    setJuniorFilters((prev) => ({ ...prev, [key]: value }));
  };

  const exportPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("my-work", "pdf"), "autoflow-my-work-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));

  return (
    <div className="mwWrap">
      <div className="mwTopBar">
        <div>
          <div className="mwEyebrow">Detailer dashboard</div>
          <h2>My Work</h2>
          <p>Review assigned bookings, tracking tasks, warranty progress, and commission status.</p>
        </div>
        <button className="mwExportBtn" type="button" onClick={exportPdf}>Download PDF</button>
      </div>

      <section className="mwCard">
        <div className="mwCardHeader">
          <div>
            <h3>Assigned Work</h3>
            <p>Your assigned booking and service tracking queue.</p>
          </div>
          <div className="mwCount">{visiblePersonalBookings.length} shown</div>
        </div>
        <FilterGrid filters={personalFilters} onChange={updatePersonalFilter} />
        <WorkTable rows={visiblePersonalBookings} commissions={commissions} emptyMessage="No assigned work found." onView={setSelectedWork} />
      </section>

      {role === "senior detailer" && (
        <section className="mwCard mwSectionGap">
          <div className="mwCardHeader">
            <div>
              <h3>Junior Detailer Work View</h3>
              <p>Supervise all bookings currently assigned to Junior Detailers.</p>
            </div>
            <div className="mwCount">{visibleJuniorBookings.length} shown</div>
          </div>
          <FilterGrid
            filters={juniorFilters}
            onChange={updateJuniorFilter}
            detailerOptions={juniorDetailerDisplayNames}
            showDetailerFilter
          />
          <WorkTable
            rows={visibleJuniorBookings}
            commissions={commissions}
            emptyMessage="No junior detailer work found."
            showAssigned
            onView={setSelectedWork}
          />
        </section>
      )}

      <section className="mwCard mwSectionGap">
        <div className="mwCardHeader">
          <div>
            <h3>Commission Audit</h3>
            <p>Your own commission history and payout status.</p>
          </div>
          <div className="mwCount">{ownCommissions.length} records</div>
        </div>
        <div className="mwTableWrap">
          <table className="mwTable">
            <thead>
              <tr>
                <th>Commission ID</th>
                <th>Booking ID</th>
                <th>Service</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date Paid</th>
              </tr>
            </thead>
            <tbody>
              {ownCommissions.length ? ownCommissions.map((commission) => (
                <tr key={commission.id}>
                  <td className="mwStrong">{commission.id}</td>
                  <td>{commission.bookingId || "-"}</td>
                  <td>{commission.service || "-"}</td>
                  <td>{commission.rate || 0}%</td>
                  <td>P{Number(commission.earned || 0).toLocaleString("en-PH")}</td>
                  <td>{commission.status || "Pending"}</td>
                  <td>{commission.datePaid || "-"}</td>
                </tr>
              )) : (
                <tr>
                  <td className="mwEmpty" colSpan={7}>No commission records yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedWork && (
        <div className="mwModalOverlay" onClick={() => setSelectedWork(null)}>
          <div className="mwModalCard" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="mwModalClose" type="button" onClick={() => setSelectedWork(null)}>x</button>
            <h3>Work Details</h3>
            <div className="mwDetailGrid">
              <div><span>Booking</span><strong>{selectedWork.id || "-"}</strong></div>
              <div><span>Customer</span><strong>{selectedWork.customer || "-"}</strong></div>
              <div><span>Vehicle</span><strong>{getVehicleLabel(selectedWork)}</strong></div>
              <div><span>Service</span><strong>{selectedWork.service || "-"}</strong></div>
              <div><span>Date</span><strong>{selectedWork.date || "-"}</strong></div>
              <div><span>Time</span><strong>{selectedWork.time || "-"}</strong></div>
              <div><span>Place Slot</span><strong>{selectedWork.placeSlot || "-"}</strong></div>
              <div><span>Assigned Worker</span><strong>{selectedWork.assigned || "-"}</strong></div>
              <div><span>Status</span><strong>{selectedWork.status || "-"}</strong></div>
              <div><span>Issue Notes</span><strong>{selectedWork.issueNote || getIssueNotesStatus(selectedWork)}</strong></div>
              <div><span>Warranty</span><strong>{getWarrantyStatus(selectedWork)}</strong></div>
              <div><span>Completion</span><strong>{normalize(selectedWork.status) === "completed" ? "Completed" : "Not completed"}</strong></div>
              <div><span>Commission Status</span><strong>{getCommissionStatus(commissions, selectedWork.id)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
