import "../../styles/css/admin/adminAuditLogsStyle.css";
import { useEffect, useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

function getAuditDetail(log) {
  const meta = log?.meta || {};
  if (meta.message) return String(meta.message);
  if (meta.proofSubmittedAtDisplay) return `Submitted on ${meta.proofSubmittedAtDisplay}`;
  return "";
}

export default function AdminAuditLogs() {
  const { auditLogs, archivedAuditLogs, archiveAuditLogs, unarchiveAuditLogs, getActiveAuditLogIds, currentUser } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ userId: "", action: "" });
  const [showArchived, setShowArchived] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const sourceLogs = showArchived ? archivedAuditLogs : auditLogs;
  const canArchiveLogs = String(currentUser?.userType || "").trim().toLowerCase() === "admin";

  const getLogSelectionKey = (log) => String(log?.id || log?._id || "").trim();
  const activeLogIds = useMemo(
    () => auditLogs.map(getLogSelectionKey).filter(Boolean),
    [auditLogs]
  );

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return sourceLogs.filter((l) => {
      const matchesQuery = !q || `${l.id} ${l.userId} ${l.action} ${l.ts} ${getAuditDetail(l)}`.toLowerCase().includes(q);
      const matchesUser = !filters.userId || l.userId === filters.userId;
      const matchesAction = !filters.action || l.action === filters.action;
      return matchesQuery && matchesUser && matchesAction;
    });
  }, [sourceLogs, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedSelectionKeys = paged.map(getLogSelectionKey).filter(Boolean);
  const allPagedSelected = pagedSelectionKeys.length > 0 && pagedSelectionKeys.every((key) => selectedLogIds.includes(key));

  useEffect(() => {
    setSelectedLogIds([]);
  }, [showArchived]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleLogSelection = (selectionKey) => {
    if (!selectionKey) return;
    setSelectedLogIds((prev) => (
      prev.includes(selectionKey)
        ? prev.filter((value) => value !== selectionKey)
        : [...prev, selectionKey]
    ));
  };

  const togglePageSelection = () => {
    setSelectedLogIds((prev) => {
      if (allPagedSelected) {
        return prev.filter((value) => !pagedSelectionKeys.includes(value));
      }

      return [...new Set([...prev, ...pagedSelectionKeys])];
    });
  };

  const selectAllActiveLogs = async () => {
    if (showArchived) return;
    setIsSelectingAll(true);
    try {
      const result = typeof getActiveAuditLogIds === "function" ? await getActiveAuditLogIds() : { ids: activeLogIds };
      const ids = Array.isArray(result) ? result : result?.ids;
      setSelectedLogIds([...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))]);
    } finally {
      setIsSelectingAll(false);
    }
  };

  const archiveSelectedLogs = async () => {
    const idsToArchive = [...new Set(selectedLogIds.map((id) => String(id || "").trim()).filter(Boolean))];
    if (!idsToArchive.length) return;
    await archiveAuditLogs(idsToArchive);
    setSelectedLogIds((prev) => prev.filter((id) => !idsToArchive.includes(id)));
  };

  const exportPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("audit-logs", "pdf"), "autoflow-audit-log-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));

  return (
    <div className="auditWrap">
      <div className="auditTopRow">
        <div className="auditSearchBox">
          <img className="auditSearchIcon" src={icoSearch} alt="" />
          <input className="auditSearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Logs..." />
        </div>

        <div className="auditToggle">
          <button
            className={`auditToggleBtn${!showArchived ? " active" : ""}`}
            type="button"
            onClick={() => {
              setShowArchived(false);
              setPage(1);
            }}
          >
            Active
          </button>
          <button
            className={`auditToggleBtn${showArchived ? " active" : ""}`}
            type="button"
            onClick={() => {
              setShowArchived(true);
              setPage(1);
            }}
          >
            Archived
          </button>
        </div>

        <button className="auditFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
          <img className="auditFilterIcon" src={icoFilter} alt="" />
        </button>

        <div className="auditBtns">
          <div className="auditSelectionMeta">{selectedLogIds.length ? `${selectedLogIds.length} selected` : "Select logs"}</div>
          <button className="auditBtn auditBtnDark" type="button" onClick={exportPdf}>Export as PDF</button>
          {canArchiveLogs && !showArchived ? <button className="auditBtn auditBtnLight" type="button" onClick={selectAllActiveLogs} disabled={isSelectingAll}>{isSelectingAll ? "Selecting..." : "Select All"}</button> : null}
          {canArchiveLogs && !showArchived ? <button className="auditBtn auditBtnRed" type="button" onClick={archiveSelectedLogs} disabled={!selectedLogIds.length}>Archive Logs</button> : null}
          {canArchiveLogs && showArchived ? <button className="auditBtn auditBtnBlue" type="button" onClick={unarchiveAuditLogs}>Restore</button> : null}
        </div>
      </div>

      <div className="auditBoard">
        <div className="auditTableHead">
          <label className="auditSelectCell auditSelectHead">
            <input type="checkbox" checked={allPagedSelected} onChange={togglePageSelection} aria-label="Select all visible logs" />
          </label>
          <div>ID</div>
          <div>User ID</div>
          <div>Action</div>
          <div>Timestamp</div>
        </div>
        {paged.length === 0 ? (
          <div className="auditEmptyRow"><div className="auditEmptyText">{showArchived ? "No archived audit records yet" : "No audit records yet"}</div></div>
        ) : (
          paged.map((r, idx) => {
            const selectionKey = getLogSelectionKey(r);
            const isSelected = selectedLogIds.includes(selectionKey);

            return (
              <button
                className={`auditTableRow${isSelected ? " selected" : ""}`}
                key={selectionKey}
                type="button"
                onClick={() => toggleLogSelection(selectionKey)}
              >
                <span className="auditSelectCell">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!selectionKey}
                    onChange={() => toggleLogSelection(selectionKey)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select audit log ${r.id || idx + 1}`}
                  />
                </span>
                <span className="auditId">{r.id}</span>
                <span>{r.userId}</span>
                <span>
                  <span>{r.action}</span>
                  {getAuditDetail(r) ? <span className="auditActionDetail">{getAuditDetail(r)}</span> : null}
                </span>
                <span className="auditTime">{r.ts}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="auditPagerRow">
        <button className="auditPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
        <span className="auditPagerNum">{safePage}</span>
        <button className="auditPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
      </div>

      <FilterModal
        open={isFilterOpen}
        title="Filter Audit Logs"
        fields={[
          { key: "userId", label: "User", type: "select", options: [...new Set(sourceLogs.map((l) => l.userId).filter(Boolean))] },
          { key: "action", label: "Action", type: "select", options: [...new Set(sourceLogs.map((l) => l.action).filter(Boolean))] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => { setPage(1); setIsFilterOpen(false); }}
        onReset={() => { setFilters({ userId: "", action: "" }); setPage(1); }}
      />
    </div>
  );
}
