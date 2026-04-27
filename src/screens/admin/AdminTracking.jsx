import "../../styles/css/admin/adminTrackingStyle.css";
import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const STATUS_OPTIONS = ["Scheduled", "Pending", "In Progress", "Completed", "Cancelled"];

const formatDateForInput = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createEditForm = (row) => ({
  customer: row?.customer || "",
  date: formatDateForInput(row?.date || ""),
  service: row?.service || "",
  vehicle: row?.vehicle || "",
  status: row?.status || "Scheduled",
  assignedTo: row?.assigned || "",
});

export default function AdminTracking() {
  const { bookings, updateBooking } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", assignedTo: "" });
  const [modal, setModal] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editForm, setEditForm] = useState(() => createEditForm({}));

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return bookings.filter((r) => {
      const matchesQuery = !q || `${r.id} ${r.customer} ${r.vehicle} ${r.service} ${r.status} ${r.assigned}`.toLowerCase().includes(q);
      const matchesStatus = !filters.status || r.status === filters.status;
      const matchesAssigned = !filters.assignedTo || r.assigned === filters.assignedTo;
      return matchesQuery && matchesStatus && matchesAssigned;
    });
  }, [bookings, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusClass = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("progress")) return "stInProgress";
    if (s.includes("completed")) return "stCompleted";
    if (s.includes("cancelled")) return "stCancelled";
    return "stBooked";
  };

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Service Tracking Report",
      subtitle: "Filtered booking tracking records exported in tabular format.",
      sections: [
        {
          columns: ["Booking ID", "Booking Date", "Customer", "Vehicle", "Service", "Status", "Assigned To"],
          rows: filtered.map((row) => [
            row.id,
            row.date || "-",
            row.customer || "-",
            row.vehicle || "-",
            row.service || "-",
            row.status || "-",
            row.assigned || "-",
          ]),
          emptyMessage: "No tracking records found for the selected filters.",
        },
      ],
    });

  return (
    <div className="stWrap">
      <div className="stTopRow">
        <div className="stSearchBox"><img className="stSearchIcon" src={icoSearch} alt="" /><input className="stSearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Bookings..." /></div>
        <button className="stFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img className="stFilterIcon" src={icoFilter} alt="" /></button>
        <div className="stTopRight"><button className="stExportBtn" type="button" onClick={exportPdf}>Export as PDF</button></div>
      </div>

      <div className="stBoard">
        <div className="stTable">
          <div className="stHead"><div>Booking ID</div><div>Booking Date</div><div>Customer</div><div>Vehicle Model</div><div>Service</div><div>Status</div><div>Assigned To</div><div>Actions</div></div>
          {paged.length === 0 ? <div className="stEmptyRow">No tracking records found.</div> : paged.map((r) => (
            <div className="stRow" key={r.id}>
              <div className="stId">{r.id}</div><div>{r.date}</div><div>{r.customer}</div><div>{r.vehicle}</div><div>{r.service}</div><div><span className={`stPill ${statusClass(r.status)}`}>{r.status}</span></div><div>{r.assigned}</div>
              <div className="stActionsCell"><div className="stRowActions"><button className="stMiniBtn" onClick={() => { setSelectedRow(r); setEditForm(createEditForm(r)); setModal("edit"); }}>Edit</button></div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="stPager"><button className="stPagerBtn" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="stPagerNum">{safePage}</span><button className="stPagerBtn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {modal === "edit" && selectedRow && (
        <div className="usersModalOverlay" onClick={() => setModal(null)}>
          <div className="usersModalCard" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); updateBooking(selectedRow.id, { ...selectedRow, customer: editForm.customer, date: editForm.date, service: editForm.service, vehicle: editForm.vehicle, status: editForm.status, assigned: editForm.assignedTo }); setModal(null); }}>
              <div className="usersModalTitle">Edit Tracking Row</div>
              <label className="usersField"><span>Customer</span><input value={editForm.customer} onChange={(e) => setEditForm((prev) => ({ ...prev, customer: e.target.value }))} /></label>
              <label className="usersField"><span>Date</span><input type="date" value={editForm.date} onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))} /></label>
              <label className="usersField"><span>Service</span><input value={editForm.service} onChange={(e) => setEditForm((prev) => ({ ...prev, service: e.target.value }))} /></label>
              <label className="usersField"><span>Vehicle</span><input value={editForm.vehicle} onChange={(e) => setEditForm((prev) => ({ ...prev, vehicle: e.target.value }))} /></label>
              <label className="usersField"><span>Assigned To</span><input value={editForm.assignedTo} onChange={(e) => setEditForm((prev) => ({ ...prev, assignedTo: e.target.value }))} /></label>
              <label className="usersField"><span>Status</span><select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}>{STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
              <div className="usersModalActions"><button className="usersTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="usersPrimaryBtn" type="submit">Save</button></div>
            </form>
          </div>
        </div>
      )}
      <FilterModal
        open={isFilterOpen}
        title="Filter Tracking"
        fields={[
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
          { key: "assignedTo", label: "Assigned To", type: "select", options: [...new Set(bookings.map((row) => row.assigned).filter(Boolean))] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => { setPage(1); setIsFilterOpen(false); }}
        onReset={() => { setFilters({ status: "", assignedTo: "" }); setPage(1); }}
      />
    </div>
  );
}
