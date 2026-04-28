import "../../styles/css/staff/staffTrackingStyle.css";
import "../../styles/css/staff/staffBookingsStyle.css";

import { useEffect, useMemo, useRef, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import carDiagram from "../../assets/IMAGE/car.jpg";
import { WARRANTY_COVERAGE_NOTES, WARRANTY_COVERAGE_OPTIONS, WARRANTY_ISSUE_TYPES, createWarrantyAcknowledgement, normalizeWarrantyChecklist } from "../../utils/warrantyChecklist";

const STATUS_OPTIONS = ["Scheduled", "Pending", "In Progress", "Rescheduled", "Completed", "Cancelled"];
const ISSUE_TYPES = WARRANTY_ISSUE_TYPES;

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
  customerEmail: row?.customerEmail || "",
  date: formatDateForInput(row?.date) || "",
  service: row?.service || "",
  vehicle: row?.vehicle || "",
  status: row?.status || STATUS_OPTIONS[0],
  assignedTo: row?.assigned || "",
  issueNote: row?.issueNote || "",
  issueTypes: row?.issueTypes || [],
  issueMarkers: Array.isArray(row?.issueMarkers) && row.issueMarkers.length
    ? row.issueMarkers.map((marker, index) => ({
        id: marker.id || index + 1,
        x: Number(marker.x || 50),
        y: Number(marker.y || 50),
        issueType: marker.issueType || row.issueTypes?.[index] || "",
      }))
    : [{ id: 1, x: 50, y: 50, issueType: "" }],
  warrantyChecklist: row?.warrantyChecklist || "",
  warrantyChecklistItems: normalizeWarrantyChecklist(row?.warrantyChecklistItems),
  warrantyCoveragePackage: row?.warrantyCoveragePackage || WARRANTY_COVERAGE_OPTIONS[0],
  warrantyAcknowledgement: createWarrantyAcknowledgement(row || {}),
  warrantyReleased: Boolean(row?.warrantyReleased),
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMarkerTone(index) {
  const tones = [
    { fill: "#2563eb", shadow: "rgba(37, 99, 235, 0.45)" },
    { fill: "#f97316", shadow: "rgba(249, 115, 22, 0.42)" },
    { fill: "#10b981", shadow: "rgba(16, 185, 129, 0.4)" },
    { fill: "#a855f7", shadow: "rgba(168, 85, 247, 0.4)" },
    { fill: "#ef4444", shadow: "rgba(239, 68, 68, 0.4)" },
    { fill: "#14b8a6", shadow: "rgba(20, 184, 166, 0.4)" },
  ];
  return tones[index % tones.length];
}

function IssueMap({ markers, onMarkerPointerDown, onAddMarker, onRemoveMarker }) {
  return (
    <div className="stIssueMapShell">
      <div className="stIssueMap stIssueMapImg" style={{ backgroundImage: `url(${carDiagram})` }}>
        <img src={carDiagram} alt="Car diagram" className="stCarDiagramImg" draggable={false} />
        {markers.map((marker, index) => {
          const tone = getMarkerTone(index);
          return (
            <button
              key={marker.id}
              className="stIssueMarker"
              type="button"
              style={{ left: `${marker.x}%`, top: `${marker.y}%`, background: tone.fill, boxShadow: `0 4px 12px ${tone.shadow}` }}
              onPointerDown={(event) => onMarkerPointerDown(event, marker.id)}
              title={marker.issueType ? `Marker ${marker.id}: ${marker.issueType}` : `Marker ${marker.id}`}
            >
              {marker.id}
            </button>
          );
        })}
      </div>
      <div className="stIssueLegend">
        <div className="stIssueHint">Drag markers onto the car diagram to pinpoint separate issue spots.</div>
        <div className="stIssueActions">
          <button className="stIssueActionBtn" type="button" onClick={onAddMarker}>Add Marker</button>
          {markers.length > 1 && <button className="stIssueActionBtn ghost" type="button" onClick={onRemoveMarker}>Remove Last</button>}
        </div>
      </div>
    </div>
  );
}

export default function StaffTracking() {
  const { bookings, updateBooking } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", assignedTo: "" });
  const [modal, setModal] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editForm, setEditForm] = useState(createEditForm(null));
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const mapRef = useRef(null);

  const closeModal = () => {
    setModal(null);
    setSelectedRow(null);
    setActiveMarkerId(null);
  };

  useEffect(() => {
    if (!activeMarkerId) return undefined;
    const handlePointerMove = (event) => {
      const container = mapRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 2, 98);
      const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 2, 98);
      setEditForm((prev) => ({
        ...prev,
        issueMarkers: prev.issueMarkers.map((marker) => marker.id === activeMarkerId ? { ...marker, x, y } : marker),
      }));
    };
    const handlePointerUp = () => setActiveMarkerId(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeMarkerId]);

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
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusClass = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("progress")) return "stTrackInProgress";
    if (s.includes("completed")) return "stTrackCompleted";
    if (s.includes("cancelled")) return "stTrackArrived";
    return "stTrackBooked";
  };

  return (
    <div className="stTrackWrap">
      <div className="stTrackTop">
        <div className="stTrackSearchGroup">
          <div className="stTrackSearchBox">
            <img src={icoSearch} alt="" className="stTrackSearchIcon" />
            <input
              className="stTrackSearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Bookings..."
            />
          </div>
          <button className="stTrackFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="stTrackFilterIcon" />
          </button>
        </div>
      </div>

      <div className="stTrackCard">
        <table className="stTrackTbl">
          <thead>
            <tr>
              <th>Booking ID</th>
              <th>Booking Date</th>
              <th>Customer</th>
              <th>Vehicle Model</th>
              <th>Service</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th className="stTrackColActions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="stTrackEmpty">
                  No records found.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.date}</td>
                  <td>{r.customer}</td>
                  <td>{r.vehicle}</td>
                  <td>{r.service}</td>
                  <td>
                    <span className={`stTrackBadge ${statusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.assigned}</td>
                  <td className="stTrackColActions">
                    <div className="stTrackRowActions">
                      <button
                        className="stTrackMiniBtn"
                        type="button"
                        onClick={() => {
                          setSelectedRow(r);
                          setEditForm(createEditForm(r));
                          setModal("edit");
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="stTrackPagerRow">
        <button className="stTrackPagerBtn" onClick={() => setPage((p) => Math.max(1, p - 1))}>
          {"<"}
        </button>
        <span className="stTrackPagerNum">{safePage}</span>
        <button className="stTrackPagerBtn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          {">"}
        </button>
      </div>

      {modal === "edit" && selectedRow && (
        <div className="stTrackModalOverlay" onClick={closeModal}>
          <div className="stTrackModalCard" onClick={(e) => e.stopPropagation()}>
            <button className="stTrackModalClose" type="button" onClick={closeModal}>
              x
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const releaseAllowed = editForm.status === "Completed" && editForm.warrantyReleased;
                updateBooking(selectedRow.id, {
                  ...selectedRow,
                  status: editForm.status,
                  issueNote: editForm.issueNote,
                  issueMarkers: editForm.issueMarkers,
                  issueTypes: editForm.issueMarkers.map((marker) => marker.issueType).filter(Boolean),
                  warrantyChecklist: editForm.warrantyChecklist,
                  warrantyChecklistItems: editForm.warrantyChecklistItems,
                  warrantyCoveragePackage: editForm.warrantyCoveragePackage,
                  warrantyAcknowledgement: editForm.warrantyAcknowledgement,
                  warrantyReleased: releaseAllowed,
                  warrantyReleasedAt: releaseAllowed ? (selectedRow.warrantyReleasedAt || new Date().toISOString()) : "",
                  warrantyQrCode: releaseAllowed ? (selectedRow.warrantyQrCode || `${selectedRow.id}-WARRANTY`) : "",
                });
                closeModal();
              }}
            >
              <div className="stTrackModalTitle">Edit Service Tracking</div>

              <label className="stTrackField">
                <span>Customer Name</span>
                <div className="stTrackSuggestWrap">
                  <input
                    value={editForm.customer}
                    readOnly
                    disabled
                  />
                </div>
              </label>

              <div className="stTrackFieldGrid">
                <label className="stTrackField">
                  <span>Booking Date</span>
                  <input
                    type="date"
                    value={editForm.date}
                    readOnly
                    disabled
                  />
                </label>

                <label className="stTrackField">
                  <span>Status</span>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="stTrackField">
                <span>Service</span>
                <input
                  value={editForm.service}
                  readOnly
                  disabled
                />
              </label>

              <label className="stTrackField">
                <span>Vehicle Model</span>
                <input
                  value={editForm.vehicle}
                  readOnly
                  disabled
                />
              </label>

              <label className="stTrackField">
                <span>Assigned To</span>
                <input
                  value={editForm.assignedTo}
                  readOnly
                  disabled
                  placeholder="Staff member name"
                />
              </label>

              <div className="stIssueSection">
                <div className="stIssueSectionHead"><div className="stIssueTitle">Problem Location</div><div className="stIssueSub">Issue details are managed in Service Tracking.</div></div>
                <div className="stIssueLayout">
                  <div className="stIssueMapPanel" ref={mapRef}>
                    <IssueMap
                      markers={editForm.issueMarkers}
                      onMarkerPointerDown={(event, markerId) => { event.preventDefault(); setActiveMarkerId(markerId); }}
                      onAddMarker={() => setEditForm((prev) => ({ ...prev, issueMarkers: [...prev.issueMarkers, { id: prev.issueMarkers.reduce((highest, marker) => Math.max(highest, marker.id), 0) + 1, x: 50, y: 50, issueType: "" }] }))}
                      onRemoveMarker={() => setEditForm((prev) => ({ ...prev, issueMarkers: prev.issueMarkers.length > 1 ? prev.issueMarkers.slice(0, -1) : prev.issueMarkers }))}
                    />
                  </div>
                  <div className="stIssueRightPanel">
                    <div className="stBookField">
                      <span>Marker Issue Type</span>
                      <div className="stIssueMarkerFields">
                        {editForm.issueMarkers.map((marker, index) => {
                          const tone = getMarkerTone(index);
                          return (
                            <label key={marker.id} className="stIssueMarkerField">
                              <div className="stIssueMarkerFieldLabel"><span className="stIssueMarkerLegendDot" style={{ background: tone.fill }} /><strong>Marker {marker.id}</strong></div>
                              <select value={marker.issueType || ""} onChange={(event) => setEditForm((prev) => ({ ...prev, issueMarkers: prev.issueMarkers.map((item) => item.id === marker.id ? { ...item, issueType: event.target.value } : item) }))}>
                                <option value="">Select issue type</option>
                                {ISSUE_TYPES.map((option) => <option key={option}>{option}</option>)}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <label className="stBookField stIssueNoteField"><span>Issue Notes</span><textarea className="stIssueNoteTextarea" rows="5" value={editForm.issueNote} onChange={(e) => setEditForm((prev) => ({ ...prev, issueNote: e.target.value }))} /></label>
                  </div>
                </div>
              </div>

              <div className="stIssueSection">
                <div className="stIssueSectionHead"><div className="stIssueTitle">Warranty Document</div><div className="stIssueSub">Use the official checklist.pdf as the warranty document. <a href="/checklist.pdf" target="_blank" rel="noreferrer">Open PDF</a></div></div>
                <div className="warrantyGrid">
                  {editForm.warrantyChecklistItems.map((item) => (
                    <div className="warrantyItem" key={item.id}>
                      <label><input type="checkbox" checked={item.done} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyChecklistItems: prev.warrantyChecklistItems.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry) }))} /> <span>{item.label}</span></label>
                      <input value={item.doneBy} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyChecklistItems: prev.warrantyChecklistItems.map((entry) => entry.id === item.id ? { ...entry, doneBy: event.target.value } : entry) }))} placeholder="Done by" />
                      <input value={item.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyChecklistItems: prev.warrantyChecklistItems.map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry) }))} placeholder="Notes" />
                    </div>
                  ))}
                </div>
                <label className="stTrackField"><span>Warranty Coverage</span><select value={editForm.warrantyCoveragePackage} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyCoveragePackage: e.target.value }))}>{WARRANTY_COVERAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
                <details className="warrantyCoverage"><summary>Coverage Notes</summary>{WARRANTY_COVERAGE_NOTES.map((note) => <p key={note}>{note}</p>)}</details>
                <div className="warrantyAckGrid">
                  {[
                    ["dateLocation", "Date / Location"],
                    ["carModelYearColor", "Car Model / Year / Color"],
                    ["plateCsNumber", "Plate / CS Number"],
                    ["serviceAvailed", "Service Availed"],
                    ["clientName", "Client Name"],
                    ["clientSignature", "Client Signature"],
                  ].map(([key, label]) => (
                    <label className="stTrackField" key={key}><span>{label}</span><input value={editForm.warrantyAcknowledgement[key] || ""} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyAcknowledgement: { ...prev.warrantyAcknowledgement, [key]: event.target.value } }))} /></label>
                  ))}
                </div>
                <label className="stTrackField"><span>Warranty Notes</span><textarea rows="3" value={editForm.warrantyChecklist} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyChecklist: e.target.value }))} /></label>
                <label className="stTrackField"><span>Release Warranty QR</span><select value={editForm.warrantyReleased ? "Released" : "Hold"} disabled={editForm.status !== "Completed"} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyReleased: e.target.value === "Released" }))}><option>Hold</option><option>Released</option></select></label>
                {editForm.status !== "Completed" && <div className="warrantyHint">Warranty release is locked until the booking status is Completed.</div>}
              </div>

              <div className="stTrackModalActions">
                <button className="stTrackMiniBtn" type="button" onClick={closeModal}>Cancel</button>
                <button className="stTrackMiniBtn" type="submit">Save</button>
              </div>
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
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ status: "", assignedTo: "" });
          setPage(1);
        }}
      />
    </div>
  );
}
