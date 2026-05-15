import "../../styles/css/staff/staffTrackingStyle.css";
import "../../styles/css/staff/staffBookingsStyle.css";

import { useEffect, useMemo, useRef, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import carDiagram from "../../assets/IMAGE/car.jpg";
import { WARRANTY_COVERAGE_NOTES, WARRANTY_COVERAGE_OPTIONS, WARRANTY_ISSUE_TYPES, createWarrantyAcknowledgement, normalizeWarrantyChecklist } from "../../utils/warrantyChecklist";
import {
  buildIssueNotePayload,
  canEditIssueNotes,
  getIssueNotesLockedMessage,
  hasMeaningfulIssueNotes,
} from "../../utils/trackingIssueNotes";
import {
  buildWarrantyPayload,
  canEditWarranty,
  getLinkedPaymentForBooking,
  getWarrantyBlockReason,
  isWarrantyExemptService,
} from "../../utils/warrantyWorkflow";
import { formatCompletionReadinessMessage, getCompletionReadiness } from "../../utils/completionWorkflow";

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

function IssueMap({ markers, onMarkerPointerDown, onAddMarker, onRemoveMarker, disabled = false }) {
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
              disabled={disabled}
              onPointerDown={(event) => {
                if (disabled) return;
                onMarkerPointerDown(event, marker.id);
              }}
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
          <button className="stIssueActionBtn" type="button" onClick={onAddMarker} disabled={disabled}>Add Marker</button>
          {markers.length > 1 && <button className="stIssueActionBtn ghost" type="button" onClick={onRemoveMarker} disabled={disabled}>Remove Last</button>}
        </div>
      </div>
    </div>
  );
}

export default function StaffTracking() {
  const { bookings, payments, currentUser, updateBooking, generateTrackingIssueNote } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", assignedTo: "" });
  const [modal, setModal] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editForm, setEditForm] = useState(createEditForm(null));
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [issueNoteMessage, setIssueNoteMessage] = useState("");
  const [warrantyMessage, setWarrantyMessage] = useState("");
  const [issueNoteAi, setIssueNoteAi] = useState({
    status: "idle",
    message: "",
    suggestion: "",
    nextAction: "",
    customerSummary: "",
    model: "",
  });
  const mapRef = useRef(null);
  const showToast = (type, message) => setToast({ type, message, id: Date.now() });
  const issueNotesEditable = canEditIssueNotes({ booking: selectedRow, currentUser, allowAdmin: false });
  const issueNotesLockedMessage = getIssueNotesLockedMessage({ booking: selectedRow, currentUser, allowAdmin: false });
  const savedIssueNotesPresent = hasMeaningfulIssueNotes(selectedRow || {});
  const linkedPayment = getLinkedPaymentForBooking(selectedRow, payments);
  const warrantyExempt = isWarrantyExemptService(selectedRow || {});
  const warrantyEditable = canEditWarranty(selectedRow || {}, linkedPayment, currentUser, { allowAdmin: false });
  const warrantyBlockReason = getWarrantyBlockReason(selectedRow || {}, linkedPayment, currentUser, { allowAdmin: false });
  const warrantyDraft = { ...(selectedRow || {}), ...editForm };
  const completionDraft = { ...(selectedRow || {}), ...warrantyDraft, status: selectedRow?.status || "" };
  const completionReadiness = getCompletionReadiness(completionDraft, linkedPayment);
  const completionReadinessMessage = formatCompletionReadinessMessage(completionReadiness);

  const closeModal = () => {
    setModal(null);
    setSelectedRow(null);
    setActiveMarkerId(null);
    setIssueNoteMessage("");
    setWarrantyMessage("");
    setIssueNoteAi({
      status: "idle",
      message: "",
      suggestion: "",
      nextAction: "",
      customerSummary: "",
      model: "",
    });
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

  const handleGenerateIssueNote = async () => {
    setIssueNoteAi({
      status: "loading",
      message: "",
      suggestion: "",
      nextAction: "",
      customerSummary: "",
      model: "",
    });

    try {
      const response = await generateTrackingIssueNote({
        problemLocation: editForm.issueMarkers
          .map((marker) => `Marker ${marker.id}${marker.issueType ? ` - ${marker.issueType}` : ""}`)
          .join(", "),
        issueTypes: editForm.issueMarkers.map((marker) => marker.issueType).filter(Boolean),
        issueMarkers: editForm.issueMarkers,
        serviceType: editForm.service,
        vehicleDetails: editForm.vehicle,
        currentTrackingStatus: editForm.status,
        currentIssueNote: editForm.issueNote,
      });

      if (!response?.available) {
        setIssueNoteAi({
          status: "unavailable",
          message: response?.message || "AI unavailable right now.",
          suggestion: "",
          nextAction: "",
          customerSummary: "",
          model: "",
        });
        return;
      }

      const suggestion = response.technicianFriendlyNote || response.cleanedUpIssueNote || "";
      setIssueNoteAi({
        status: suggestion ? "success" : "unavailable",
        message: suggestion ? "" : "AI unavailable right now.",
        suggestion,
        nextAction: response.suggestedNextAction || "",
        customerSummary: response.customerSafeSummary || "",
        model: response.model || "",
      });
    } catch (error) {
      setIssueNoteAi({
        status: "error",
        message: error.message || "Unable to generate analysis right now.",
        suggestion: "",
        nextAction: "",
        customerSummary: "",
        model: "",
      });
    }
  };

  const handleInsertIssueNote = () => {
    if (!issueNoteAi.suggestion || !issueNotesEditable) return;
    setEditForm((prev) => ({
      ...prev,
      issueNote: prev.issueNote.trim()
        ? `${prev.issueNote.trim()}\n${issueNoteAi.suggestion}`
        : issueNoteAi.suggestion,
    }));
  };

  const performSaveIssueNotes = async (securityPayload = {}) => {
    const payload = buildIssueNotePayload(editForm, selectedRow.status);
    const updated = await updateBooking(selectedRow.id, { ...payload, ...securityPayload });
    const nextRow = { ...selectedRow, ...(updated || {}), ...payload };
    setSelectedRow(nextRow);
    setEditForm((prev) => ({ ...prev, ...createEditForm(nextRow), status: prev.status }));
    setIssueNoteMessage("Issue notes saved and ready to start service.");
    showToast("success", "Issue notes saved.");
    setSecurityConfirm(null);
  };

  const handleSaveIssueNotes = () => {
    setIssueNoteMessage("");
    if (!issueNotesEditable) {
      setIssueNoteMessage(issueNotesLockedMessage || "Issue notes cannot be edited for this booking.");
      return;
    }
    if (!hasMeaningfulIssueNotes(editForm)) {
      setIssueNoteMessage("Add issue notes or problem location details before saving.");
      return;
    }

    setSecurityConfirm({
      mode: "pin",
      title: "Save Issue Notes",
      message: "Enter the staff special PIN before saving issue notes.",
      onConfirm: async ({ secret }) => {
        try {
          await performSaveIssueNotes({ specialPin: secret });
        } catch (error) {
          const message = error.message || "Failed to save issue notes.";
          setIssueNoteMessage(message);
          showToast("error", message);
          throw error;
        }
      },
    });
  };

  const performSaveWarranty = async (securityPayload = {}) => {
    const payload = buildWarrantyPayload(editForm, selectedRow.status);
    const updated = await updateBooking(selectedRow.id, { ...payload, ...securityPayload });
    const nextRow = { ...selectedRow, ...(updated || {}), ...payload };
    setSelectedRow(nextRow);
    setEditForm((prev) => ({ ...prev, ...createEditForm(nextRow), status: prev.status }));
    setWarrantyMessage("Warranty details saved.");
    showToast("success", "Warranty details saved.");
    setSecurityConfirm(null);
  };

  const handleSaveWarranty = () => {
    setWarrantyMessage("");
    if (!warrantyEditable) {
      setWarrantyMessage(warrantyBlockReason || "Warranty details cannot be edited for this booking.");
      return;
    }

    setSecurityConfirm({
      mode: "pin",
      title: "Save Warranty Details",
      message: "Enter the staff special PIN before saving warranty details.",
      onConfirm: async ({ secret }) => {
        try {
          await performSaveWarranty({ specialPin: secret });
        } catch (error) {
          const message = error.message || "Failed to save warranty details.";
          setWarrantyMessage(message);
          showToast("error", message);
          throw error;
        }
      },
    });
  };

  const handleSaveTracking = (e) => {
    e.preventDefault();
    setIssueNoteMessage("");
    setWarrantyMessage("");

    if (editForm.status === "In Progress" && !savedIssueNotesPresent) {
      setIssueNoteMessage("Issue notes must be saved before starting the service.");
      return;
    }

    if (editForm.status === "Completed" && !completionReadiness.canComplete) {
      setWarrantyMessage(completionReadinessMessage || "Booking cannot be completed yet.");
      return;
    }

    const releaseAllowed = editForm.status === "Completed" && editForm.warrantyReleased;
    const payload = {
      ...selectedRow,
      status: editForm.status,
      issueNote: selectedRow.issueNote || "",
      issueMarkers: Array.isArray(selectedRow.issueMarkers) ? selectedRow.issueMarkers : [],
      issueTypes: Array.isArray(selectedRow.issueTypes) ? selectedRow.issueTypes : [],
      warrantyChecklist: editForm.warrantyChecklist,
      warrantyChecklistItems: editForm.warrantyChecklistItems,
      warrantyCoveragePackage: editForm.warrantyCoveragePackage,
      warrantyAcknowledgement: editForm.warrantyAcknowledgement,
      warrantyReleased: releaseAllowed,
      warrantyReleasedAt: releaseAllowed ? (selectedRow.warrantyReleasedAt || new Date().toISOString()) : "",
      warrantyQrCode: releaseAllowed ? (selectedRow.warrantyQrCode || `${selectedRow.id}-WARRANTY`) : "",
    };
    setSecurityConfirm({
      mode: "pin",
      title: "Update Service Tracking",
      message: "Enter the staff special PIN before saving tracking or warranty updates.",
      onConfirm: async ({ secret }) => {
        try {
          await updateBooking(selectedRow.id, { ...payload, specialPin: secret });
          showToast("success", "Service tracking updated.");
          setSecurityConfirm(null);
          closeModal();
        } catch (error) {
          showToast("error", error.message || "Failed to update service tracking.");
          throw error;
        }
      },
    });
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
                          setIssueNoteAi({
                            status: "idle",
                            message: "",
                            suggestion: "",
                            nextAction: "",
                            customerSummary: "",
                            model: "",
                          });
                          setIssueNoteMessage("");
                          setWarrantyMessage("");
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
              onSubmit={handleSaveTracking}
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
                      <option key={option} disabled={(option === "In Progress" && !savedIssueNotesPresent) || (option === "Completed" && !completionReadiness.canComplete)}>{option}</option>
                    ))}
                  </select>
                  {!savedIssueNotesPresent && <div className="stTrackIssueHelper">Issue notes must be saved before starting the service.</div>}
                  {completionReadinessMessage && <div className="stTrackWarrantyNotice">{completionReadinessMessage}</div>}
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
                      disabled={!issueNotesEditable}
                    />
                  </div>
                  <div className="stIssueRightPanel">
                    <div className={issueNotesEditable ? "stTrackIssueHelper success" : "stTrackIssueHelper"}>
                      {issueNotesEditable
                        ? "Issue notes can be edited while this booking is Scheduled."
                        : issueNotesLockedMessage}
                    </div>
                    <div className="stBookField">
                      <span>Marker Issue Type</span>
                      <div className="stIssueMarkerFields">
                        {editForm.issueMarkers.map((marker, index) => {
                          const tone = getMarkerTone(index);
                          return (
                            <label key={marker.id} className="stIssueMarkerField">
                              <div className="stIssueMarkerFieldLabel"><span className="stIssueMarkerLegendDot" style={{ background: tone.fill }} /><strong>Marker {marker.id}</strong></div>
                              <select value={marker.issueType || ""} disabled={!issueNotesEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, issueMarkers: prev.issueMarkers.map((item) => item.id === marker.id ? { ...item, issueType: event.target.value } : item) }))}>
                                <option value="">Select issue type</option>
                                {ISSUE_TYPES.map((option) => <option key={option}>{option}</option>)}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="stIssueAiHelper">
                      <div className="stIssueAiHead">
                        <div className="stIssueAiTitle">AI Issue Note Helper</div>
                        <button className="stIssueAiBtn" type="button" onClick={handleGenerateIssueNote} disabled={!issueNotesEditable || issueNoteAi.status === "loading"}>
                          {issueNoteAi.status === "loading" ? "Generating..." : "Generate Suggestion"}
                        </button>
                      </div>
                      <div className={`stIssueAiStatus stIssueAiStatus-${issueNoteAi.status}`}>
                        {issueNoteAi.status === "idle" && "Generate a technician-friendly issue note suggestion from the current problem markers."}
                        {issueNoteAi.status === "loading" && "Preparing a suggested issue note..."}
                        {issueNoteAi.status === "success" && `Suggestion ready${issueNoteAi.model ? ` • ${issueNoteAi.model}` : ""}`}
                        {issueNoteAi.status === "unavailable" && (issueNoteAi.message || "AI unavailable right now.")}
                        {issueNoteAi.status === "error" && (issueNoteAi.message || "Unable to generate analysis right now.")}
                      </div>
                      {issueNoteAi.suggestion && (
                        <div className="stIssueAiResult">
                          <div className="stIssueAiResultText">{issueNoteAi.suggestion}</div>
                          {issueNoteAi.nextAction && <div className="stIssueAiMeta"><strong>Next action:</strong> {issueNoteAi.nextAction}</div>}
                          {issueNoteAi.customerSummary && <div className="stIssueAiMeta"><strong>Customer summary:</strong> {issueNoteAi.customerSummary}</div>}
                          <button className="stIssueAiInsertBtn" type="button" onClick={handleInsertIssueNote} disabled={!issueNotesEditable}>Insert Suggestion</button>
                        </div>
                      )}
                    </div>
                    <label className="stBookField stIssueNoteField"><span>Issue Notes</span><textarea className="stIssueNoteTextarea" rows="5" value={editForm.issueNote} disabled={!issueNotesEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, issueNote: e.target.value }))} /></label>
                    <div className="stTrackIssueSaveRow">
                      <button className="stTrackMiniBtn" type="button" onClick={handleSaveIssueNotes} disabled={!issueNotesEditable}>
                        Save Issue Notes
                      </button>
                      {issueNoteMessage && <div className="stTrackIssueSaveMessage">{issueNoteMessage}</div>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="stIssueSection">
                <div className="stIssueSectionHead"><div className="stIssueTitle">Warranty Document</div><div className="stIssueSub">Use the official checklist.pdf as the warranty document. <a href="/checklist.pdf" target="_blank" rel="noreferrer">Open PDF</a></div></div>
                <div className={warrantyEditable ? "stTrackWarrantyNotice success" : "stTrackWarrantyNotice"}>
                  {warrantyEditable ? "Warranty details can be edited while this service is In Progress and fully paid." : warrantyBlockReason}
                </div>
                <div className={`warrantyGrid${warrantyExempt ? " warrantyLocked" : ""}`}>
                  {editForm.warrantyChecklistItems.map((item) => (
                    <div className="warrantyItem" key={item.id}>
                      <label><input type="checkbox" checked={item.done} disabled={!warrantyEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyChecklistItems: prev.warrantyChecklistItems.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry) }))} /> <span>{item.label}</span></label>
                      <input value={item.doneBy} disabled={!warrantyEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyChecklistItems: prev.warrantyChecklistItems.map((entry) => entry.id === item.id ? { ...entry, doneBy: event.target.value } : entry) }))} placeholder="Done by" />
                      <input value={item.notes} disabled={!warrantyEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyChecklistItems: prev.warrantyChecklistItems.map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry) }))} placeholder="Notes" />
                    </div>
                  ))}
                </div>
                <label className="stTrackField"><span>Warranty Coverage</span><select value={editForm.warrantyCoveragePackage} disabled={!warrantyEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyCoveragePackage: e.target.value }))}>{WARRANTY_COVERAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
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
                    <label className="stTrackField" key={key}><span>{label}</span><input value={editForm.warrantyAcknowledgement[key] || ""} readOnly={key !== "dateLocation"} disabled={key !== "dateLocation" || !warrantyEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyAcknowledgement: { ...prev.warrantyAcknowledgement, [key]: event.target.value } }))} /></label>
                  ))}
                </div>
                <label className="stTrackField"><span>Warranty Notes</span><textarea rows="3" value={editForm.warrantyChecklist} disabled={!warrantyEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyChecklist: e.target.value }))} /></label>
                <label className="stTrackField"><span>Release Warranty QR</span><select value={editForm.warrantyReleased ? "Released" : "Hold"} disabled={editForm.status !== "Completed" || !warrantyEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyReleased: e.target.value === "Released" }))}><option>Hold</option><option>Released</option></select></label>
                {editForm.status !== "Completed" && <div className="warrantyHint">Warranty release is locked until the booking status is Completed.</div>}
                <div className="stTrackIssueSaveRow">
                  <button className="stTrackMiniBtn" type="button" onClick={handleSaveWarranty} disabled={!warrantyEditable}>
                    Save Warranty Details
                  </button>
                  {warrantyMessage && <div className="stTrackIssueSaveMessage">{warrantyMessage}</div>}
                </div>
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
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} scope="staff" onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
