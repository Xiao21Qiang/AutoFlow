import "../../styles/css/staff/staffTrackingStyle.css";

import { useEffect, useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
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
  customerEmail: row?.customerEmail || "",
  date: formatDateForInput(row?.date) || "",
  service: row?.service || "",
  vehicle: row?.vehicle || "",
  status: row?.status || STATUS_OPTIONS[0],
  assignedTo: row?.assigned || "",
});

export default function StaffTracking() {
  const { bookings, updateBooking, users } = useAdminData();
  const customerOptions = useMemo(
    () =>
      users
        .filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer" && user.name)
        .map((user) => ({ name: user.name, email: user.email || "" })),
    [users]
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", assignedTo: "" });
  const [modal, setModal] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [editForm, setEditForm] = useState(createEditForm(null));
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);
  const [customerFieldError, setCustomerFieldError] = useState("");
  const matchedCustomer = useMemo(
    () =>
      customerOptions.find(
        (customer) => customer.name.trim().toLowerCase() === String(editForm.customer || "").trim().toLowerCase()
      ) || null,
    [customerOptions, editForm.customer]
  );
  const filteredCustomerOptions = useMemo(() => {
    const needle = String(editForm.customer || "").trim().toLowerCase();
    if (!needle) return customerOptions.slice(0, 12);
    return customerOptions.filter((customer) => customer.name.toLowerCase().includes(needle)).slice(0, 12);
  }, [customerOptions, editForm.customer]);

  const closeModal = () => {
    setModal(null);
    setSelectedRow(null);
    setIsCustomerMenuOpen(false);
    setCustomerFieldError("");
  };

  useEffect(() => {
    const typedName = String(editForm.customer || "").trim();
    if (!typedName) {
      setCustomerFieldError("");
      return;
    }

    if (matchedCustomer) {
      setCustomerFieldError("");
      if (editForm.customerEmail !== matchedCustomer.email) {
        setEditForm((prev) => ({
          ...prev,
          customer: matchedCustomer.name,
          customerEmail: matchedCustomer.email || "",
        }));
      }
      return;
    }

    setCustomerFieldError("This customer is not registered yet. Please choose a registered customer from the list.");
  }, [editForm.customer, editForm.customerEmail, matchedCustomer]);

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
                          setCustomerFieldError("");
                          setIsCustomerMenuOpen(false);
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
                if (!matchedCustomer) {
                  setCustomerFieldError("Please select a registered customer from the list.");
                  setIsCustomerMenuOpen(true);
                  return;
                }
                updateBooking(selectedRow.id, {
                  ...selectedRow,
                  customer: matchedCustomer.name,
                  customerEmail: matchedCustomer.email || "",
                  date: editForm.date,
                  service: editForm.service.trim(),
                  vehicle: editForm.vehicle.trim(),
                  status: editForm.status,
                  assigned: editForm.assignedTo.trim(),
                });
                closeModal();
              }}
            >
              <div className="stTrackModalTitle">Edit Service Tracking</div>

              <label className="stTrackField">
                <span>Customer Name</span>
                <div className="stTrackSuggestWrap">
                  <input
                    className={customerFieldError ? "stTrackFieldInvalidInput" : ""}
                    value={editForm.customer}
                    onFocus={() => setIsCustomerMenuOpen(true)}
                    onBlur={() => window.setTimeout(() => setIsCustomerMenuOpen(false), 120)}
                    onChange={(e) => {
                      setEditForm((prev) => ({ ...prev, customer: e.target.value, customerEmail: "" }));
                      setIsCustomerMenuOpen(true);
                    }}
                  />
                  {isCustomerMenuOpen && filteredCustomerOptions.length > 0 && (
                    <div className="stTrackSuggestMenu">
                      {filteredCustomerOptions.map((customer) => (
                        <button
                          key={`${customer.email}-${customer.name}`}
                          className="stTrackSuggestItem"
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setEditForm((prev) => ({
                              ...prev,
                              customer: customer.name,
                              customerEmail: customer.email,
                            }));
                            setCustomerFieldError("");
                            setIsCustomerMenuOpen(false);
                          }}
                        >
                          <span>{customer.name}</span>
                          <small>{customer.email}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {customerFieldError && <div className="stTrackFieldError">{customerFieldError}</div>}
              </label>

              <div className="stTrackFieldGrid">
                <label className="stTrackField">
                  <span>Booking Date</span>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
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
                  onChange={(e) => setEditForm((prev) => ({ ...prev, service: e.target.value }))}
                />
              </label>

              <label className="stTrackField">
                <span>Vehicle Model</span>
                <input
                  value={editForm.vehicle}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, vehicle: e.target.value }))}
                />
              </label>

              <label className="stTrackField">
                <span>Assigned To</span>
                <input
                  value={editForm.assignedTo}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, assignedTo: e.target.value }))}
                  placeholder="Staff member name"
                />
              </label>

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
