import "../../styles/css/customer/customerTrackingStyle.css";

import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function resolvePublicClientUrl() {
  const configuredUrl = String(process.env.REACT_APP_PUBLIC_CLIENT_URL || "").trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.protocol}//${window.location.host}`;
}

function buildTrackingUrl(bookingId) {
  const safeId = encodeURIComponent(String(bookingId || "").trim());
  const publicClientUrl = resolvePublicClientUrl();

  if (!safeId || !publicClientUrl) {
    return "";
  }

  return `${publicClientUrl}/tracking/${safeId}`;
}

const statusMeta = (status) => {
  const s = String(status || "").toLowerCase();
  if (s.includes("in progress")) return { cls: "progress", label: "In Progress" };
  if (s.includes("complete")) return { cls: "completed", label: "Completed" };
  if (s.includes("arriv")) return { cls: "arrived", label: "Arrived" };
  return { cls: "booked", label: status || "Booked" };
};

const buildTrackingSteps = (status) => {
  const normalized = String(status || "").toLowerCase();
  return [
    { label: "Booking received", active: true },
    { label: "Schedule confirmed", active: normalized !== "pending" },
    { label: "Work in progress", active: normalized === "in progress" || normalized === "completed" },
    { label: "Ready for release", active: normalized === "completed" },
  ];
};

export default function CustomerTracking() {
  const { bookings, currentUser } = useAdminData();
  const customerName = String(currentUser?.name || "").trim().toLowerCase();
  const customerEmail = String(currentUser?.email || "").trim().toLowerCase();
  const data = useMemo(
    () =>
      bookings.filter((booking) => {
        const bookingCustomer = String(booking.customer || "").trim().toLowerCase();
        const bookingEmail = String(booking.customerEmail || "").trim().toLowerCase();
        return bookingEmail ? bookingEmail === customerEmail : bookingCustomer === customerName;
      }),
    [bookings, customerEmail, customerName]
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", assignedTo: "" });
  const [selectedRow, setSelectedRow] = useState(null);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return data.filter((row) => {
      const assignedTo = row.assigned || "-";
      const matchesQuery =
        !q ||
        String(row.id || "").toLowerCase().includes(q) ||
        String(row.customer || "").toLowerCase().includes(q) ||
        String(row.vehicle || "").toLowerCase().includes(q) ||
        String(row.service || "").toLowerCase().includes(q) ||
        String(row.status || "").toLowerCase().includes(q) ||
        String(assignedTo).toLowerCase().includes(q) ||
        formatDate(row.date).toLowerCase().includes(q);
      const matchesStatus = !filters.status || row.status === filters.status;
      const matchesAssigned = !filters.assignedTo || assignedTo === filters.assignedTo;
      return matchesQuery && matchesStatus && matchesAssigned;
    });
  }, [data, query, filters]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const qrValue = selectedRow ? buildTrackingUrl(selectedRow.id) : "";
  const qrImageUrl = selectedRow
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrValue)}`
    : "";

  return (
    <div className="clTrackWrap">
      <div className="clTrackTop">
        <div className="clTrackSearchWrap">
          <div className="clTrackSearchBox">
            <img src={icoSearch} alt="" className="clTrackSearchIcon" />
            <input
              className="clTrackSearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Bookings..."
            />
          </div>
          <button className="clTrackFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="clTrackFilterIcon" />
          </button>
        </div>
      </div>

      <div className="clTrackBoard">
        <div className="clTrackHead">
          <div>Booking ID</div>
          <div>Booking Date</div>
          <div>Customer</div>
          <div>Vehicle Model</div>
          <div>Service</div>
          <div>Status</div>
          <div>Assigned To</div>
          <div>Details</div>
        </div>

        {pageRows.length === 0 ? (
          <div className="clTrackEmptyRow"><div>No records found.</div></div>
        ) : (
          pageRows.map((row) => {
            const meta = statusMeta(row.status);
            return (
              <div className="clTrackRow" key={row.id}>
                <div>{row.id}</div>
                <div>{formatDate(row.date)}</div>
                <div>{row.customer}</div>
                <div>{row.vehicle}</div>
                <div>{row.service}</div>
                <div>
                  <span className={`clTrackBadge ${meta.cls}`}>{meta.label}</span>
                </div>
                <div>{row.assigned || "-"}</div>
                <div>
                  <button className="clTrackViewBtn" type="button" onClick={() => setSelectedRow(row)}>
                    View
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="clTrackPager">
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          {"<"}
        </button>
        <div>{safePage}</div>
        <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
          {">"}
        </button>
      </div>

      {selectedRow && (
        <div className="clTrackModalOverlay" onClick={() => setSelectedRow(null)}>
          <div className="clTrackModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="clTrackModalClose" type="button" onClick={() => setSelectedRow(null)}>
              x
            </button>
            <div className="clTrackModalTitle">Tracking Details</div>
            <div className="clTrackDetailList">
              <div><strong>Booking:</strong> {selectedRow.id}</div>
              <div><strong>Date:</strong> {formatDate(selectedRow.date)}</div>
              <div><strong>Service:</strong> {selectedRow.service}</div>
              <div><strong>Vehicle:</strong> {selectedRow.vehicle}</div>
              <div><strong>Plate Number:</strong> {selectedRow.plate || "-"}</div>
              <div><strong>Status:</strong> {selectedRow.status}</div>
              <div><strong>Assigned To:</strong> {selectedRow.assigned || "-"}</div>
            </div>
            <div className="clTrackTimeline">
              {buildTrackingSteps(selectedRow.status).map((step) => (
                <div key={step.label} className={step.active ? "active" : ""}>
                  {step.label}
                </div>
              ))}
            </div>
            <div className="clTrackQrCard">
              <div className="clTrackQrHead">
                <div className="clTrackQrTitle">QR Access</div>
                <div className="clTrackQrSub">Scan to open the full read-only tracking page with the issue diagram, colored markers, issue types, and notes.</div>
              </div>
              <div className="clTrackQrBody">
                <img className="clTrackQrImage" src={qrImageUrl} alt={`QR code for booking ${selectedRow.id}`} />
                <div className="clTrackQrMeta">
                  <a href={qrValue} target="_blank" rel="noreferrer" className="clTrackQrLink">
                    Open tracking page
                  </a>
                  <code>{qrValue}</code>
                </div>
              </div>
            </div>
            <div className="clTrackModalActions">
              <button className="clTrackPrimaryBtn" type="button" onClick={() => setSelectedRow(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Tracking"
        fields={[
          { key: "status", label: "Status", type: "select", options: [...new Set(data.map((row) => row.status).filter(Boolean))] },
          { key: "assignedTo", label: "Assigned To", type: "select", options: [...new Set(data.map((row) => row.assigned).filter(Boolean))] },
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
