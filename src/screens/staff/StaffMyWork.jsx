import "../../styles/css/staff/staffMyWorkStyle.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";
import { CANONICAL_BOOKING_STATUSES, normalizeBookingStatus } from "../../utils/businessMetrics";

const COMMISSION_STATUS_OPTIONS = ["Pending", "Earned", "Paid", "Cancelled", "Voided", "N/A"];
const MY_WORK_PAGE_SIZE = 10;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function includesText(value, query) {
  return normalize(value).includes(normalize(query));
}

function displayValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function formatPeso(value) {
  return `P${Number(value || 0).toLocaleString("en-PH")}`;
}

function getIssueNotesStatus(booking) {
  return booking?.issueNote || booking?.issueTypes?.length || booking?.issueMarkers?.length ? "Saved" : "Needed";
}

function getWarrantyStatus(booking) {
  if (booking?.warrantyReleased) return "Released";
  if (booking?.warrantyChecklist || booking?.warrantyChecklistItems?.some((item) => item.done || item.notes)) return "Drafted";
  return "Pending";
}

function getCommissionStatus(booking) {
  return booking?.commissionStatus || "N/A";
}

function getDateRangeError(filters) {
  return filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
    ? "End Date cannot be earlier than Start Date."
    : "";
}

function filterBookings(bookings, filters, { applyDateRange = true } = {}) {
  const query = normalize(filters.query);
  const requestedStatus = filters.status ? normalizeBookingStatus(filters.status, "") : "";
  return bookings.filter((booking) => {
    const commissionStatus = getCommissionStatus(booking);
    const bookingStatus = normalizeBookingStatus(booking.status, "Scheduled");
    const isCompleted = bookingStatus === "Completed";
    const haystack = [
      booking.id,
      booking.customer,
      booking.service,
    ].join(" ");

    return (
      (!query || includesText(haystack, query)) &&
      (!requestedStatus || bookingStatus === requestedStatus) &&
      (!filters.assigned || normalize(booking.assigned) === normalize(filters.assigned)) &&
      (!filters.commissionStatus || normalize(commissionStatus) === normalize(filters.commissionStatus)) &&
      (!filters.completedOnly || isCompleted) &&
      (!applyDateRange || !filters.dateFrom || String(booking.date || "") >= filters.dateFrom) &&
      (!applyDateRange || !filters.dateTo || String(booking.date || "") <= filters.dateTo)
    );
  });
}

function paginateRows(rows, page) {
  const totalPages = Math.max(1, Math.ceil(rows.length / MY_WORK_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * MY_WORK_PAGE_SIZE;
  return {
    totalPages,
    safePage,
    rows: rows.slice(start, start + MY_WORK_PAGE_SIZE),
  };
}

function Pagination({ label, page, totalPages, onPageChange }) {
  const safePage = Math.min(Math.max(page, 1), totalPages);
  return (
    <div className="mwPagerRow" aria-label={`${label} pagination`}>
      <button
        className="mwPagerBtn"
        type="button"
        onClick={() => onPageChange(Math.max(1, safePage - 1))}
        disabled={safePage === 1}
      >
        Previous
      </button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <button
          key={pageNumber}
          className={`mwPagerNum${pageNumber === safePage ? " active" : ""}`}
          type="button"
          onClick={() => onPageChange(pageNumber)}
          aria-current={pageNumber === safePage ? "page" : undefined}
        >
          {pageNumber}
        </button>
      ))}
      <button
        className="mwPagerBtn"
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
        disabled={safePage === totalPages}
      >
        Next
      </button>
    </div>
  );
}

function WorkTable({ rows, emptyMessage, showAssigned = false, onView }) {
  return (
    <div className="mwTableWrap">
      <table className="mwTable">
        <thead>
          <tr>
            <th>Booking ID</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Vehicle</th>
            <th>Plate</th>
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
            const commissionStatus = getCommissionStatus(booking);
            return (
              <tr key={booking.id}>
                <td className="mwStrong">{booking.id}</td>
                <td>{displayValue(booking.customer)}</td>
                <td>{displayValue(booking.service)}</td>
                <td>{displayValue(booking.vehicle)}</td>
                <td>{displayValue(booking.plate)}</td>
                {showAssigned && <td>{displayValue(booking.assigned)}</td>}
                <td>{displayValue(booking.date)}</td>
                <td><span className="mwPill">{normalizeBookingStatus(booking.status, displayValue(booking.status))}</span></td>
                <td>{getIssueNotesStatus(booking)}</td>
                <td>{getWarrantyStatus(booking)}</td>
                <td>{commissionStatus}</td>
                <td><button className="mwRowBtn" type="button" onClick={() => onView?.(booking)}>Details</button></td>
              </tr>
            );
          }) : (
            <tr>
              <td className="mwEmpty" colSpan={showAssigned ? 12 : 11}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FilterGrid({ filters, onChange, detailerOptions = [], showDetailerFilter = false, dateError = "" }) {
  return (
    <>
      <div className="mwFilters">
        <input
          value={filters.query}
          onChange={(event) => onChange("query", event.target.value)}
          placeholder="Search booking ID, customer, service..."
        />
        <select value={filters.status} onChange={(event) => onChange("status", event.target.value)}>
          <option value="">All statuses</option>
          {CANONICAL_BOOKING_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
        {showDetailerFilter && (
          <select value={filters.assigned} onChange={(event) => onChange("assigned", event.target.value)}>
            <option value="">All junior detailers</option>
            {detailerOptions.map((name) => <option key={name}>{name}</option>)}
          </select>
        )}
        <select value={filters.commissionStatus} onChange={(event) => onChange("commissionStatus", event.target.value)}>
          <option value="">All commissions</option>
          {COMMISSION_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
        </select>
        <label className="mwCheck">
          <input
            type="checkbox"
            checked={filters.completedOnly}
            onChange={(event) => onChange("completedOnly", event.target.checked)}
          />
          Completed only
        </label>
        <input aria-label="Start Date" type="date" value={filters.dateFrom} onChange={(event) => onChange("dateFrom", event.target.value)} />
        <input aria-label="End Date" type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => onChange("dateTo", event.target.value)} />
      </div>
      {dateError && <div className="mwFilterError">{dateError}</div>}
    </>
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

const EMPTY_MY_WORK = {
  assignedWork: [],
  juniorDetailerWork: [],
  commissionAudit: [],
};

export default function StaffMyWork({ session }) {
  const [myWork, setMyWork] = useState(EMPTY_MY_WORK);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [personalFilters, setPersonalFilters] = useState(createFilters);
  const [juniorFilters, setJuniorFilters] = useState(createFilters);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [assignedPage, setAssignedPage] = useState(1);
  const [juniorPage, setJuniorPage] = useState(1);
  const [commissionPage, setCommissionPage] = useState(1);

  const role = normalize(session?.role);
  const assignedWork = useMemo(
    () => (Array.isArray(myWork.assignedWork) ? myWork.assignedWork : []),
    [myWork.assignedWork]
  );
  const juniorDetailerWork = useMemo(
    () => (Array.isArray(myWork.juniorDetailerWork) ? myWork.juniorDetailerWork : []),
    [myWork.juniorDetailerWork]
  );
  const ownCommissions = useMemo(
    () => (Array.isArray(myWork.commissionAudit) ? myWork.commissionAudit : []),
    [myWork.commissionAudit]
  );
  const juniorDetailerDisplayNames = useMemo(
    () =>
      [...new Set(
        juniorDetailerWork
          .map((booking) => String(booking.assigned || "").trim())
          .filter(Boolean)
      )],
    [juniorDetailerWork]
  );

  const refreshMyWork = useCallback(async () => {
    setLoadError("");
    try {
      const result = await apiRequest("/api/admin/my-work");
      setMyWork({
        assignedWork: Array.isArray(result?.assignedWork) ? result.assignedWork : [],
        juniorDetailerWork: Array.isArray(result?.juniorDetailerWork) ? result.juniorDetailerWork : [],
        commissionAudit: Array.isArray(result?.commissionAudit) ? result.commissionAudit : [],
      });
    } catch (error) {
      setMyWork(EMPTY_MY_WORK);
      setLoadError(error.message || "Could not load My Work.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    refreshMyWork();
  }, [refreshMyWork]);

  useEffect(() => {
    const handleFocus = () => {
      refreshMyWork();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshMyWork();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshMyWork]);

  const personalDateError = getDateRangeError(personalFilters);
  const juniorDateError = getDateRangeError(juniorFilters);

  const filteredPersonalBookings = useMemo(
    () => (personalDateError ? [] : filterBookings(assignedWork, personalFilters)),
    [assignedWork, personalDateError, personalFilters]
  );

  const filteredJuniorBookings = useMemo(
    () => (juniorDateError ? [] : filterBookings(juniorDetailerWork, juniorFilters)),
    [juniorDateError, juniorDetailerWork, juniorFilters]
  );

  const assignedPagination = useMemo(() => paginateRows(filteredPersonalBookings, assignedPage), [assignedPage, filteredPersonalBookings]);
  const juniorPagination = useMemo(() => paginateRows(filteredJuniorBookings, juniorPage), [filteredJuniorBookings, juniorPage]);
  const commissionPagination = useMemo(() => paginateRows(ownCommissions, commissionPage), [commissionPage, ownCommissions]);

  const selectedWork = useMemo(
    () => [...assignedWork, ...juniorDetailerWork].find((booking) => String(booking.id || "") === String(selectedWorkId || "")) || null,
    [assignedWork, juniorDetailerWork, selectedWorkId]
  );

  useEffect(() => {
    if (assignedPage > assignedPagination.totalPages) setAssignedPage(assignedPagination.totalPages);
  }, [assignedPage, assignedPagination.totalPages]);

  useEffect(() => {
    if (juniorPage > juniorPagination.totalPages) setJuniorPage(juniorPagination.totalPages);
  }, [juniorPage, juniorPagination.totalPages]);

  useEffect(() => {
    if (commissionPage > commissionPagination.totalPages) setCommissionPage(commissionPagination.totalPages);
  }, [commissionPage, commissionPagination.totalPages]);

  useEffect(() => {
    if (selectedWorkId && !selectedWork && !isLoading) {
      setSelectedWorkId("");
    }
  }, [isLoading, selectedWork, selectedWorkId]);

  const updatePersonalFilter = (key, value) => {
    setPersonalFilters((prev) => ({ ...prev, [key]: value }));
    setAssignedPage(1);
  };

  const updateJuniorFilter = (key, value) => {
    setJuniorFilters((prev) => ({ ...prev, [key]: value }));
    setJuniorPage(1);
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
      {isLoading && <div className="mwCard">Loading My Work...</div>}
      {loadError && <div className="mwCard">{loadError}</div>}

      {!isLoading && !loadError && (
        <>
          <section className="mwCard">
            <div className="mwCardHeader">
              <div>
                <h3>Assigned Work</h3>
                <p>Your assigned booking and service tracking queue.</p>
              </div>
              <div className="mwCount">{filteredPersonalBookings.length} shown</div>
            </div>
            <FilterGrid filters={personalFilters} onChange={updatePersonalFilter} dateError={personalDateError} />
            <WorkTable rows={assignedPagination.rows} emptyMessage="No assigned work found." onView={(booking) => setSelectedWorkId(booking.id)} />
            <Pagination
              label="Assigned Work"
              page={assignedPagination.safePage}
              totalPages={assignedPagination.totalPages}
              onPageChange={setAssignedPage}
            />
          </section>

          {role === "senior detailer" && (
            <section className="mwCard mwSectionGap">
              <div className="mwCardHeader">
                <div>
                  <h3>Junior Detailer Work View</h3>
                  <p>Supervise all bookings currently assigned to Junior Detailers.</p>
                </div>
                <div className="mwCount">{filteredJuniorBookings.length} shown</div>
              </div>
              <FilterGrid
                filters={juniorFilters}
                onChange={updateJuniorFilter}
                detailerOptions={juniorDetailerDisplayNames}
                showDetailerFilter
                dateError={juniorDateError}
              />
              <WorkTable
                rows={juniorPagination.rows}
                emptyMessage="No junior detailer work found."
                showAssigned
                onView={(booking) => setSelectedWorkId(booking.id)}
              />
              <Pagination
                label="Junior Detailer Work"
                page={juniorPagination.safePage}
                totalPages={juniorPagination.totalPages}
                onPageChange={setJuniorPage}
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
                    <th>Date</th>
                    <th>Service</th>
                    <th>Rate</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date Paid</th>
                    <th>Paid By</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionPagination.rows.length ? commissionPagination.rows.map((commission) => (
                    <tr key={commission.id}>
                      <td className="mwStrong">{displayValue(commission.id)}</td>
                      <td>{displayValue(commission.bookingId)}</td>
                      <td>{displayValue(commission.date)}</td>
                      <td>{displayValue(commission.service)}</td>
                      <td>{Number(commission.rate || 0)}%</td>
                      <td>{formatPeso(commission.earned)}</td>
                      <td>{displayValue(commission.status || "Pending")}</td>
                      <td>{displayValue(commission.datePaid)}</td>
                      <td>{displayValue(commission.paidBy)}</td>
                      <td>{displayValue(commission.remarks)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="mwEmpty" colSpan={10}>No commission records yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              label="Commission Audit"
              page={commissionPagination.safePage}
              totalPages={commissionPagination.totalPages}
              onPageChange={setCommissionPage}
            />
          </section>
        </>
      )}

      {selectedWork && (
        <div className="mwModalOverlay" onClick={() => setSelectedWorkId("")}>
          <div className="mwModalCard" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="mwModalClose" type="button" onClick={() => setSelectedWorkId("")}>x</button>
            <h3>Work Details</h3>
            <div className="mwDetailGrid">
              <div><span>Booking ID</span><strong>{displayValue(selectedWork.id)}</strong></div>
              <div><span>Customer</span><strong>{displayValue(selectedWork.customer)}</strong></div>
              <div><span>Service</span><strong>{displayValue(selectedWork.service)}</strong></div>
              <div><span>Vehicle</span><strong>{displayValue(selectedWork.vehicle)}</strong></div>
              <div><span>Plate</span><strong>{displayValue(selectedWork.plate)}</strong></div>
              <div><span>Date</span><strong>{displayValue(selectedWork.date)}</strong></div>
              <div><span>Time</span><strong>{displayValue(selectedWork.time)}</strong></div>
              <div><span>Place Slot</span><strong>{displayValue(selectedWork.placeSlot)}</strong></div>
              <div><span>Assigned Detailer</span><strong>{displayValue(selectedWork.assigned)}</strong></div>
              <div><span>Status</span><strong>{normalizeBookingStatus(selectedWork.status, displayValue(selectedWork.status))}</strong></div>
              <div><span>Issue Notes</span><strong>{selectedWork.issueNote || getIssueNotesStatus(selectedWork)}</strong></div>
              <div><span>Warranty Status</span><strong>{getWarrantyStatus(selectedWork)}</strong></div>
              <div><span>Commission Status</span><strong>{getCommissionStatus(selectedWork)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
