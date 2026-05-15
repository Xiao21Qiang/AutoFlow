import "../../styles/css/admin/adminTrackingStyle.css";
import "../../styles/css/admin/adminBookingsStyle.css";
import { useEffect, useMemo, useRef, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
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
  hasRequiredWarrantyFields,
  isWarrantyExemptService,
} from "../../utils/warrantyWorkflow";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

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
  date: formatDateForInput(row?.date || ""),
  service: row?.service || "",
  vehicle: row?.vehicle || "",
  status: row?.status || "Scheduled",
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
    <div className="bookIssueMapShell">
      <div className="bookIssueMap bookIssueMapImg" style={{ backgroundImage: `url(${carDiagram})` }}>
        <img src={carDiagram} alt="Car diagram" className="bookCarDiagramImg" draggable={false} />
        {markers.map((marker, index) => {
          const tone = getMarkerTone(index);
          return (
            <button
              key={marker.id}
              className="bookIssueMarker"
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
      <div className="bookIssueLegend">
        <div className="bookIssueHint">Drag markers onto the car diagram to pinpoint separate issue spots.</div>
        <div className="bookIssueActions">
          <button className="bookIssueActionBtn" type="button" onClick={onAddMarker} disabled={disabled}>Add Marker</button>
          {markers.length > 1 && <button className="bookIssueActionBtn ghost" type="button" onClick={onRemoveMarker} disabled={disabled}>Remove Last</button>}
        </div>
      </div>
    </div>
  );
}

export default function AdminTracking() {
  const { bookings, payments, currentUser, updateBooking, generateTrackingIssueNote } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", assignedTo: "" });
  const [modal, setModal] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editForm, setEditForm] = useState(() => createEditForm({}));
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
  const issueNotesEditable = canEditIssueNotes({ booking: selectedRow, currentUser, allowAdmin: true });
  const issueNotesLockedMessage = getIssueNotesLockedMessage({ booking: selectedRow, currentUser, allowAdmin: true });
  const savedIssueNotesPresent = hasMeaningfulIssueNotes(selectedRow || {});
  const linkedPayment = getLinkedPaymentForBooking(selectedRow, payments);
  const warrantyExempt = isWarrantyExemptService(selectedRow || {});
  const warrantyEditable = canEditWarranty(selectedRow || {}, linkedPayment, currentUser, { allowAdmin: true });
  const warrantyBlockReason = getWarrantyBlockReason(selectedRow || {}, linkedPayment, currentUser, { allowAdmin: true });
  const warrantyDraft = { ...(selectedRow || {}), ...editForm };
  const warrantyReadyForCompletion = hasRequiredWarrantyFields(warrantyDraft);

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

  const resetIssueNoteAi = () => {
    setIssueNoteAi({
      status: "idle",
      message: "",
      suggestion: "",
      nextAction: "",
      customerSummary: "",
      model: "",
    });
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

  const handleSaveIssueNotes = async () => {
    setIssueNoteMessage("");
    if (!issueNotesEditable) {
      setIssueNoteMessage(issueNotesLockedMessage || "Issue notes cannot be edited for this booking.");
      return;
    }
    if (!hasMeaningfulIssueNotes(editForm)) {
      setIssueNoteMessage("Add issue notes or problem location details before saving.");
      return;
    }

    const payload = buildIssueNotePayload(editForm, selectedRow.status);
    try {
      const updated = await updateBooking(selectedRow.id, payload);
      const nextRow = { ...selectedRow, ...(updated || {}), ...payload };
      setSelectedRow(nextRow);
      setEditForm((prev) => ({ ...prev, ...createEditForm(nextRow), status: prev.status }));
      setIssueNoteMessage("Issue notes saved and ready to start service.");
      showToast("success", "Issue notes saved.");
    } catch (error) {
      const message = error.message || "Failed to save issue notes.";
      setIssueNoteMessage(message);
      showToast("error", message);
    }
  };

  const handleSaveWarranty = async () => {
    setWarrantyMessage("");
    if (!warrantyEditable) {
      setWarrantyMessage(warrantyBlockReason || "Warranty details cannot be edited for this booking.");
      return;
    }

    const payload = buildWarrantyPayload(editForm, selectedRow.status);
    try {
      const updated = await updateBooking(selectedRow.id, payload);
      const nextRow = { ...selectedRow, ...(updated || {}), ...payload };
      setSelectedRow(nextRow);
      setEditForm((prev) => ({ ...prev, ...createEditForm(nextRow), status: prev.status }));
      setWarrantyMessage("Warranty details saved.");
      showToast("success", "Warranty details saved.");
    } catch (error) {
      const message = error.message || "Failed to save warranty details.";
      setWarrantyMessage(message);
      showToast("error", message);
    }
  };

  const handleSaveTracking = (event) => {
    event.preventDefault();
    setIssueNoteMessage("");
    setWarrantyMessage("");

    if (editForm.status === "In Progress" && !savedIssueNotesPresent) {
      setIssueNoteMessage("Issue notes must be saved before starting the service.");
      return;
    }

    if (editForm.status === "Completed" && !warrantyExempt && !warrantyReadyForCompletion) {
      setWarrantyMessage("Warranty details must be completed before marking this booking as completed.");
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
    const saveTracking = async (securityPayload = {}, keepModalError = false) => {
      try {
        await updateBooking(selectedRow.id, { ...payload, ...securityPayload });
        showToast("success", "Service tracking updated.");
        setSecurityConfirm(null);
        setModal(null);
      } catch (error) {
        showToast("error", error.message || "Failed to update service tracking.");
        if (keepModalError) throw error;
      }
    };
    const needsPin = editForm.status === "Cancelled" || (releaseAllowed && !selectedRow.warrantyReleased);
    if (needsPin) {
      setSecurityConfirm({
        mode: "pin",
        title: editForm.status === "Cancelled" ? "Cancel Tracking Record" : "Release Warranty",
        message: editForm.status === "Cancelled" ? "Enter the admin special PIN before cancelling this tracking record." : "Enter the admin special PIN before releasing the warranty document.",
        onConfirm: async ({ secret }) => {
          await saveTracking({ specialPin: secret }, true);
        },
      });
      return;
    }
    saveTracking();
  };

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
              <div className="stActionsCell"><div className="stRowActions"><button className="stMiniBtn" onClick={() => { setSelectedRow(r); setEditForm(createEditForm(r)); resetIssueNoteAi(); setIssueNoteMessage(""); setWarrantyMessage(""); setModal("edit"); }}>Edit</button></div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="stPager"><button className="stPagerBtn" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="stPagerNum">{safePage}</span><button className="stPagerBtn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {modal === "edit" && selectedRow && (
        <div className="usersModalOverlay" onClick={() => setModal(null)}>
          <div className="usersModalCard" onClick={(e) => e.stopPropagation()}>
            <form className="trackEditForm" onSubmit={handleSaveTracking}>
              <div className="trackModalHead"><div className="usersModalTitle">Edit Tracking Row</div><button className="usersModalClose" type="button" onClick={() => setModal(null)}>x</button></div>
              <div className="trackModalBody">
              <label className="usersField"><span>Customer</span><input value={editForm.customer} readOnly disabled /></label>
              <label className="usersField"><span>Date</span><input type="date" value={editForm.date} readOnly disabled /></label>
              <label className="usersField"><span>Service</span><input value={editForm.service} readOnly disabled /></label>
              <label className="usersField"><span>Vehicle</span><input value={editForm.vehicle} readOnly disabled /></label>
              <label className="usersField"><span>Assigned To</span><input value={editForm.assignedTo} readOnly disabled /></label>
              <label className="usersField"><span>Status</span><select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}>{STATUS_OPTIONS.map((option) => <option key={option} disabled={(option === "In Progress" && !savedIssueNotesPresent) || (option === "Completed" && !warrantyExempt && !warrantyReadyForCompletion)}>{option}</option>)}</select>{!savedIssueNotesPresent && <div className="trackIssueHelper">Issue notes must be saved before starting the service.</div>}{!warrantyExempt && !warrantyReadyForCompletion && <div className="trackWarrantyNotice">Warranty details must be completed before marking this booking as completed.</div>}</label>
              <div className="bookIssueSection">
                <div className="bookIssueSectionHead"><div className="bookIssueTitle">Problem Location</div><div className="bookIssueSub">Issue details are managed in Service Tracking.</div></div>
                <div className="bookIssueLayout">
                  <div className="bookIssueMapPanel" ref={mapRef}>
                    <IssueMap
                      markers={editForm.issueMarkers}
                      onMarkerPointerDown={(event, markerId) => { event.preventDefault(); setActiveMarkerId(markerId); }}
                      onAddMarker={() => setEditForm((prev) => ({ ...prev, issueMarkers: [...prev.issueMarkers, { id: prev.issueMarkers.reduce((highest, marker) => Math.max(highest, marker.id), 0) + 1, x: 50, y: 50, issueType: "" }] }))}
                      onRemoveMarker={() => setEditForm((prev) => ({ ...prev, issueMarkers: prev.issueMarkers.length > 1 ? prev.issueMarkers.slice(0, -1) : prev.issueMarkers }))}
                      disabled={!issueNotesEditable}
                    />
                  </div>
                  <div className="bookIssueRightPanel">
                    <div className={issueNotesEditable ? "trackIssueHelper success" : "trackIssueHelper"}>
                      {issueNotesEditable
                        ? "Issue notes can be edited while this booking is Scheduled."
                        : issueNotesLockedMessage}
                    </div>
                    <div className="bookField">
                      <span>Marker Issue Type</span>
                      <div className="bookIssueMarkerFields">
                        {editForm.issueMarkers.map((marker, index) => {
                          const tone = getMarkerTone(index);
                          return (
                            <label key={marker.id} className="bookIssueMarkerField">
                              <div className="bookIssueMarkerFieldLabel"><span className="bookIssueMarkerLegendDot" style={{ background: tone.fill }} /><strong>Marker {marker.id}</strong></div>
                              <select value={marker.issueType || ""} disabled={!issueNotesEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, issueMarkers: prev.issueMarkers.map((item) => item.id === marker.id ? { ...item, issueType: event.target.value } : item) }))}>
                                <option value="">Select issue type</option>
                                {ISSUE_TYPES.map((option) => <option key={option}>{option}</option>)}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="bookIssueAiHelper">
                      <div className="bookIssueAiHead">
                        <div className="bookIssueAiTitle">AI Issue Note Helper</div>
                        <button className="bookIssueAiBtn" type="button" onClick={handleGenerateIssueNote} disabled={!issueNotesEditable || issueNoteAi.status === "loading"}>
                          {issueNoteAi.status === "loading" ? "Generating..." : "Generate Suggestion"}
                        </button>
                      </div>
                      <div className={`bookIssueAiStatus bookIssueAiStatus-${issueNoteAi.status}`}>
                        {issueNoteAi.status === "idle" && "Generate a technician-friendly issue note suggestion from the current problem markers."}
                        {issueNoteAi.status === "loading" && "Preparing a suggested issue note..."}
                        {issueNoteAi.status === "success" && `Suggestion ready${issueNoteAi.model ? ` • ${issueNoteAi.model}` : ""}`}
                        {issueNoteAi.status === "unavailable" && (issueNoteAi.message || "AI unavailable right now.")}
                        {issueNoteAi.status === "error" && (issueNoteAi.message || "Unable to generate analysis right now.")}
                      </div>
                      {issueNoteAi.suggestion && (
                        <div className="bookIssueAiResult">
                          <div className="bookIssueAiResultText">{issueNoteAi.suggestion}</div>
                          {issueNoteAi.nextAction && <div className="bookIssueAiMeta"><strong>Next action:</strong> {issueNoteAi.nextAction}</div>}
                          {issueNoteAi.customerSummary && <div className="bookIssueAiMeta"><strong>Customer summary:</strong> {issueNoteAi.customerSummary}</div>}
                          <button className="bookIssueAiInsertBtn" type="button" onClick={handleInsertIssueNote} disabled={!issueNotesEditable}>Insert Suggestion</button>
                        </div>
                      )}
                    </div>
                    <label className="bookField bookIssueNoteField"><span>Issue Notes</span><textarea className="bookIssueNoteTextarea" rows="5" value={editForm.issueNote} disabled={!issueNotesEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, issueNote: e.target.value }))} /></label>
                    <div className="trackIssueSaveRow">
                      <button className="usersPrimaryBtn" type="button" onClick={handleSaveIssueNotes} disabled={!issueNotesEditable}>
                        Save Issue Notes
                      </button>
                      {issueNoteMessage && <div className="trackIssueSaveMessage">{issueNoteMessage}</div>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bookIssueSection">
                <div className="bookIssueSectionHead"><div className="bookIssueTitle">Warranty Document</div><div className="bookIssueSub">Use the official checklist.pdf as the warranty document. <a href="/checklist.pdf" target="_blank" rel="noreferrer">Open PDF</a></div></div>
                <div className={warrantyEditable ? "trackWarrantyNotice success" : "trackWarrantyNotice"}>
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
                <label className="usersField"><span>Warranty Coverage</span><select value={editForm.warrantyCoveragePackage} disabled={!warrantyEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyCoveragePackage: e.target.value }))}>{WARRANTY_COVERAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
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
                    <label className="usersField" key={key}><span>{label}</span><input value={editForm.warrantyAcknowledgement[key] || ""} readOnly={key !== "dateLocation"} disabled={key !== "dateLocation" || !warrantyEditable} onChange={(event) => setEditForm((prev) => ({ ...prev, warrantyAcknowledgement: { ...prev.warrantyAcknowledgement, [key]: event.target.value } }))} /></label>
                  ))}
                </div>
                <label className="usersField"><span>Warranty Notes</span><textarea rows="3" value={editForm.warrantyChecklist} disabled={!warrantyEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyChecklist: e.target.value }))} /></label>
                <label className="usersField"><span>Release Warranty QR</span><select value={editForm.warrantyReleased ? "Released" : "Hold"} disabled={editForm.status !== "Completed" || !warrantyEditable} onChange={(e) => setEditForm((prev) => ({ ...prev, warrantyReleased: e.target.value === "Released" }))}><option>Hold</option><option>Released</option></select></label>
                {editForm.status !== "Completed" && <div className="warrantyHint">Warranty release is locked until the booking status is Completed.</div>}
                <div className="trackIssueSaveRow">
                  <button className="usersPrimaryBtn" type="button" onClick={handleSaveWarranty} disabled={!warrantyEditable}>
                    Save Warranty Details
                  </button>
                  {warrantyMessage && <div className="trackIssueSaveMessage">{warrantyMessage}</div>}
                </div>
              </div>
              </div>
              <div className="usersModalActions trackModalFoot"><button className="usersTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="usersPrimaryBtn" type="submit">Save</button></div>
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
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} scope="admin" onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
