import "../../styles/css/admin/adminAuditLogsStyle.css";
import { useEffect, useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

export default function AdminAuditLogs() {
  const { auditLogs, archivedAuditLogs, archiveAuditLogs, unarchiveAuditLogs } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ userId: "", action: "" });
  const [showArchived, setShowArchived] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const sourceLogs = showArchived ? archivedAuditLogs : auditLogs;

  const getLogSelectionKey = (log, fallbackIndex) => String(log.id || `audit-${fallbackIndex}`);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return sourceLogs.filter((l) => {
      const matchesQuery = !q || `${l.id} ${l.userId} ${l.action} ${l.ts}`.toLowerCase().includes(q);
      const matchesUser = !filters.userId || l.userId === filters.userId;
      const matchesAction = !filters.action || l.action === filters.action;
      return matchesQuery && matchesUser && matchesAction;
    });
  }, [sourceLogs, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pagedSelectionKeys = paged.map((log, index) => getLogSelectionKey(log, (safePage - 1) * pageSize + index));
  const allPagedSelected = pagedSelectionKeys.length > 0 && pagedSelectionKeys.every((key) => selectedLogIds.includes(key));

  useEffect(() => {
    setSelectedLogIds([]);
  }, [showArchived, query, filters.userId, filters.action, sourceLogs]);

  const toggleLogSelection = (selectionKey) => {
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

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Audit Logs Report",
      subtitle: "Filtered audit trail exported in tabular format.",
      sections: [
        {
          columns: ["Audit ID", "User ID", "Action", "Target ID", "Timestamp"],
          rows: filtered.map((log) => [
            log.id || "-",
            log.userId || "-",
            log.action || "-",
            log.targetId || "-",
            log.ts || "-",
          ]),
          emptyMessage: "No audit logs found for the selected filters.",
        },
      ],
    });

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
          {!showArchived ? <button className="auditBtn auditBtnRed" type="button" onClick={archiveAuditLogs}>Archive Logs</button> : null}
          {showArchived ? <button className="auditBtn auditBtnBlue" type="button" onClick={unarchiveAuditLogs}>Restore</button> : null}
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
            const selectionKey = getLogSelectionKey(r, (safePage - 1) * pageSize + idx);
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
                    onChange={() => toggleLogSelection(selectionKey)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select audit log ${r.id || idx + 1}`}
                  />
                </span>
                <span className="auditId">{r.id}</span>
                <span>{r.userId}</span>
                <span>{r.action}</span>
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
