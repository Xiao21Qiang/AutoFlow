import "../../styles/css/staff/staffBookingsStyle.css";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";

import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { CAR_SIZE_OPTIONS, getPriceForCarSize } from "../../utils/servicePricing";

const STATUS_OPTIONS = ["Scheduled", "Pending", "In Progress", "Rescheduled", "Completed", "Cancelled"];

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function createEmptyForm(defaultService = "Graphene Coating") {
  return {
    customer: "",
    customerEmail: "",
    selectedCar: "",
    vehicle: "",
    carSize: "",
    plate: "",
    service: defaultService,
    assigned: "",
    date: "",
    time: "",
    status: "Scheduled",
    issueNote: "",
    issueTypes: [],
    issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "" }],
  };
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const PLACE_SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function normalizeTimeInputValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "";
}

function isRescheduledStatus(status) {
  return String(status || "").trim().toLowerCase() === "rescheduled";
}

function isScheduleBlockingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized !== "completed" && normalized !== "cancelled";
}

function isCompletedStatus(status) {
  return String(status || "").trim().toLowerCase() === "completed";
}

function normalizeCustomerCars(cars) {
  if (!Array.isArray(cars)) return [];
  return cars
    .map((car) => ({
      vehicle: String(car?.vehicle || "").trim(),
      size: String(car?.size || "").trim(),
      plate: String(car?.plate || "").trim().toUpperCase(),
    }))
    .filter((car) => car.vehicle && car.plate);
}

function ModalSelect({ value, options, placeholder, onSelect, className = "", disabled = false }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`stBookSuggestWrap stBookModalSelect ${className}`.trim()}>
      <button
        className="stBookModalSelectTrigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{value || placeholder}</span>
      </button>
      {open && (
        <div className="stBookSuggestMenu stBookModalSelectMenu">
          {options.map((option) => (
            <button
              key={option}
              className="stBookSuggestItem stBookModalSelectItem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
            >
              <span>{option}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StaffBookings() {
  const { bookings, services, users, currentUser, createBooking, updateBooking } = useAdminData();
  const serviceOptions = services.length ? services.map((service) => service.name) : ["Graphene Coating"];
  const customerOptions = users
    .filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer" && user.name)
    .map((user) => ({ name: user.name, email: user.email || "", cars: Array.isArray(user.cars) ? user.cars : [] }));
  const staffOptions = users
    .filter((user) => ["staff", "admin"].includes(String(user.userType || "").toLowerCase()))
    .map((user) => user.name)
    .filter(Boolean);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ service: "", status: "", assigned: "" });
  const [modal, setModal] = useState(null);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [form, setForm] = useState(createEmptyForm(serviceOptions[0]));
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);
  const [customerFieldError, setCustomerFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const todayKey = getTodayKey();

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) || null,
    [bookings, selectedBookingId]
  );
  const isCompletedBookingLocked = modal === "edit" && isCompletedStatus(selectedBooking?.status);
  const matchedCustomer = useMemo(
    () =>
      customerOptions.find(
        (customer) => customer.name.trim().toLowerCase() === String(form.customer || "").trim().toLowerCase()
      ) || null,
    [customerOptions, form.customer]
  );
  const selectedCustomerCars = useMemo(() => normalizeCustomerCars(matchedCustomer?.cars), [matchedCustomer]);
  const carOptions = useMemo(() => selectedCustomerCars.map((car) => `${car.vehicle} | ${car.plate}`), [selectedCustomerCars]);
  const matchedSelectedCar = useMemo(
    () =>
      selectedCustomerCars.find(
        (car) =>
          String(car.vehicle || "").trim().toLowerCase() === String(form.vehicle || "").trim().toLowerCase() &&
          String(car.plate || "").trim().toLowerCase() === String(form.plate || "").trim().toLowerCase()
      ) || null,
    [selectedCustomerCars, form.vehicle, form.plate]
  );
  const matchedSelectedCarOption = useMemo(
    () => (matchedSelectedCar ? `${matchedSelectedCar.vehicle} | ${matchedSelectedCar.plate}` : ""),
    [matchedSelectedCar]
  );
  const filteredCustomerOptions = useMemo(() => {
    const needle = String(form.customer || "").trim().toLowerCase();
    if (!needle) return customerOptions.slice(0, 12);
    return customerOptions.filter((customer) => customer.name.toLowerCase().includes(needle)).slice(0, 12);
  }, [customerOptions, form.customer]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesQuery =
        !q ||
        [
          booking.id,
          booking.customer,
          formatDate(booking.date),
          booking.vehicle,
          booking.plate,
          booking.service,
          booking.assigned,
          booking.status,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesService = !filters.service || booking.service === filters.service;
      const matchesStatus = !filters.status || booking.status === filters.status;
      const matchesAssigned = !filters.assigned || booking.assigned === filters.assigned;
      return matchesQuery && matchesService && matchesStatus && matchesAssigned;
    });
  }, [bookings, query, filters]);

  const serviceDurationByName = useMemo(
    () => Object.fromEntries(services.map((service) => [service.name, Math.max(1, Number(service.mins) || 0)])),
    [services]
  );
  const selectedServiceDuration = Math.max(1, Number(serviceDurationByName[form.service] || 0));
  const overlappingBookings = useMemo(() => {
    if (!form.date || !form.time) return [];

    const requestedStart = timeToMinutes(form.time);
    if (requestedStart === null) return [];
    const requestedEnd = requestedStart + selectedServiceDuration;

    return bookings.filter((booking) => {
      if (selectedBooking && booking.id === selectedBooking.id) return false;
      if (String(booking.date || "") !== String(form.date || "")) return false;
      if (!isScheduleBlockingStatus(booking.status)) return false;

      const bookingStart = timeToMinutes(booking.time);
      if (bookingStart === null) return false;
      const bookingDuration = Math.max(1, Number(serviceDurationByName[booking.service] || 0));
      const bookingEnd = bookingStart + bookingDuration;
      return requestedStart < bookingEnd && bookingStart < requestedEnd;
    });
  }, [bookings, form.date, form.time, selectedBooking, selectedServiceDuration, serviceDurationByName]);
  const occupiedPlaceSlots = useMemo(() => {
    const occupied = new Set();

    overlappingBookings.forEach((booking) => {
      const slot = Number(booking.placeSlot || 0);
      if (PLACE_SLOT_OPTIONS.includes(slot)) {
        occupied.add(slot);
      }
    });

    overlappingBookings.forEach((booking) => {
      const slot = Number(booking.placeSlot || 0);
      if (PLACE_SLOT_OPTIONS.includes(slot)) return;
      const fallbackSlot = PLACE_SLOT_OPTIONS.find((candidate) => !occupied.has(candidate));
      if (fallbackSlot) occupied.add(fallbackSlot);
    });

    return occupied;
  }, [overlappingBookings]);
  const availablePlaceSlots = useMemo(
    () => PLACE_SLOT_OPTIONS.filter((slot) => !occupiedPlaceSlots.has(slot)),
    [occupiedPlaceSlots]
  );
  const hasNoAvailableSlots = Boolean(form.date && form.time) && availablePlaceSlots.length === 0;

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  useEffect(() => {
    const typedName = String(form.customer || "").trim();
    if (!typedName) {
      setCustomerFieldError("");
      return;
    }

    if (matchedCustomer) {
      setCustomerFieldError("");
      if (form.customerEmail !== matchedCustomer.email) {
        setForm((prev) => ({
          ...prev,
          customer: matchedCustomer.name,
          customerEmail: matchedCustomer.email || "",
        }));
      }
      return;
    }

    setCustomerFieldError("This customer is not registered yet. Please choose a registered customer from the list.");
  }, [form.customer, form.customerEmail, matchedCustomer]);

  useEffect(() => {
    if (!form.placeSlot) return;
    if (availablePlaceSlots.includes(Number(form.placeSlot))) return;

    setForm((prev) => (prev.placeSlot ? { ...prev, placeSlot: "" } : prev));
  }, [availablePlaceSlots, form.placeSlot]);

  useEffect(() => {
    if (!selectedCustomerCars.length) {
      setForm((prev) => (prev.selectedCar || prev.vehicle || prev.plate ? { ...prev, selectedCar: "" } : prev));
      return;
    }

    if (matchedSelectedCarOption) {
      if (form.selectedCar === matchedSelectedCarOption) return;
      setForm((prev) => ({ ...prev, selectedCar: matchedSelectedCarOption }));
      return;
    }

    if (selectedCustomerCars.some((car) => `${car.vehicle} | ${car.plate}` === form.selectedCar)) {
      return;
    }

    setForm((prev) => ({ ...prev, selectedCar: "" }));
  }, [selectedCustomerCars, matchedSelectedCarOption, form.selectedCar]);

  const closeModal = () => {
    setModal(null);
    setSelectedBookingId(null);
    setIsCustomerMenuOpen(false);
    setCustomerFieldError("");
    setForm(createEmptyForm(serviceOptions[0]));
  };

  const openAddModal = () => {
    setSelectedBookingId(null);
    setForm(createEmptyForm(serviceOptions[0]));
    setModal("add");
  };

  const openEditModal = (booking) => {
    setSelectedBookingId(booking.id);
    setForm({
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      selectedCar: "",
      vehicle: booking.vehicle,
      carSize: booking.carSize || "",
      plate: booking.plate || "",
      service: booking.service,
      assigned: booking.assigned,
      date: booking.date,
      time: normalizeTimeInputValue(booking.time),
      placeSlot: booking.placeSlot || "",
      status: booking.status || "Scheduled",
      issueNote: booking.issueNote || "",
      issueTypes: booking.issueTypes || [],
      issueMarkers:
        booking.issueMarkers && booking.issueMarkers.length > 0
          ? booking.issueMarkers.map((marker, index) => ({
              id: marker.id || index + 1,
              x: marker.x,
              y: marker.y,
              issueType: marker.issueType || booking.issueTypes?.[index] || "",
            }))
          : [{ id: 1, x: 50, y: 50, issueType: "" }],
    });
    setModal("edit");
  };

  return (
    <div className="stBookWrap">
      <div className="stBookTop">
        <div className="stSearchGroup">
          <div className="stSearchBox">
            <img src={icoSearch} alt="" className="stSearchIcon" />
            <input
              className="stSearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Bookings..."
            />
          </div>
          <button className="stFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="stFilterIcon" />
          </button>
        </div>

        <div className="stBookActions">
          <button className="stBookAddBtn" type="button" onClick={openAddModal}>
            Add New Booking
          </button>
        </div>
      </div>

      <div className="stTableCard">
        <table className="stTbl">
          <thead>
            <tr>
              <th>Booking ID</th>
              <th>Booking Date</th>
              <th>Customer</th>
              <th>Vehicle Model</th>
              <th>Plate Number</th>
              <th>Service</th>
              <th>Assigned To</th>
              <th className="stColActions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="stBookEmpty">
                  No bookings found.
                </td>
              </tr>
            ) : (
              pageRows.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.id}</td>
                  <td>{formatDate(booking.date)}</td>
                  <td>{booking.customer}</td>
                  <td>{booking.vehicle}</td>
                  <td>{booking.plate || "-"}</td>
                  <td>{booking.service}</td>
                  <td>{booking.assigned}</td>
                  <td className="stColActions">
                    <button
                      className="stEditBtn"
                      type="button"
                      onClick={() => openEditModal(booking)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="stPagerRow">
        <button
          className="stPagerBtn"
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          {"<"}
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <span
            key={pageNumber}
            className={`stPagerNum${pageNumber === safePage ? " active" : ""}`}
            onClick={() => setPage(pageNumber)}
          >
            {pageNumber}
          </span>
        ))}
        <button
          className="stPagerBtn"
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          {">"}
        </button>
      </div>

      {modal && (
        <div className="stBookModalOverlay">
          <div className="stBookModalCard" role="dialog" aria-modal="true">
            <button className="stBookModalClose" type="button" onClick={closeModal}>
              x
            </button>

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (modal === "add" && !matchedCustomer) {
                  setCustomerFieldError("Please select a registered customer from the list.");
                  setIsCustomerMenuOpen(true);
                  return;
                }

                setFormError("");
                const isReschedule = isRescheduledStatus(form.status);
                const requiresTime = modal === "add" || isReschedule;

                if ((modal === "add" || isReschedule) && form.date && form.date < todayKey) {
                  setFormError("Please select today or a future date for the booking.");
                  return;
                }

                if (requiresTime && !form.time) {
                  setFormError(isReschedule ? "Please choose a booking time before rescheduling." : "Please assign a booking time before creating this booking.");
                  return;
                }

                if (requiresTime && !form.placeSlot) {
                  setFormError(hasNoAvailableSlots ? "No place slots are available for the selected schedule." : "Please choose one of the 8 place slots.");
                  return;
                }

                if (requiresTime && !availablePlaceSlots.includes(Number(form.placeSlot))) {
                  setFormError("That place slot is no longer available. Please choose another one.");
                  return;
                }

                const matchedService = services.find((service) => service.name === form.service);
                const resolvedPrice = getPriceForCarSize(matchedService, form.carSize);
                const resolvedCustomer = modal === "edit" && selectedBooking
                  ? { name: selectedBooking.customer, email: selectedBooking.customerEmail || "" }
                  : matchedCustomer;
                if (!resolvedCustomer) {
                  setCustomerFieldError("Please select a registered customer from the list.");
                  setIsCustomerMenuOpen(true);
                  return;
                }

                const payload = {
                  ...form,
                  selectedCar: undefined,
                  placeSlot: Number(form.placeSlot || 0),
                  customer: resolvedCustomer.name,
                  customerEmail: resolvedCustomer.email || "",
                  originalAmount: Number(resolvedPrice || 0),
                  amount: Number(resolvedPrice || 0),
                };
                if (modal === "edit" && selectedBooking && !isReschedule) {
                  payload.date = selectedBooking.date;
                  payload.time = selectedBooking.time || "";
                  payload.placeSlot = selectedBooking.placeSlot || 0;
                }

                try {
                  if (modal === "add") {
                    await createBooking(payload);
                  } else if (selectedBooking) {
                    const saveEdit = async () => {
                      await updateBooking(selectedBooking.id, { ...selectedBooking, ...payload });
                      setPage(1);
                      closeModal();
                    };
                    const needsCancelPin = form.status === "Cancelled" && selectedBooking.status !== "Cancelled";
                    const needsReschedulePin = isReschedule;
                    if (needsCancelPin || needsReschedulePin) {
                      setSecurityConfirm({
                        mode: "pin",
                        title: needsCancelPin ? "Cancel Booking" : "Reschedule Booking",
                        message: needsCancelPin ? "Enter the special PIN before cancelling this booking." : "Enter the special PIN before saving this reschedule.",
                        onConfirm: async () => {
                          await saveEdit();
                          setSecurityConfirm(null);
                        },
                      });
                      return;
                    }
                    await saveEdit();
                  }

                  if (modal === "add") {
                    setPage(1);
                    closeModal();
                  }
                } catch (error) {
                  setFormError(error.message || `Failed to ${modal === "edit" ? "update" : "create"} booking.`);
                }
              }}
            >
              <div className="stBookModalTitle">
                {modal === "edit" ? "Edit Booking" : "New Booking"}
              </div>

              <div className="stBookFieldGrid">
                <label className="stBookField">
                  <span>Customer Name</span>
                  <div className="stBookSuggestWrap">
                    <input
                      value={form.customer}
                      onFocus={() => setIsCustomerMenuOpen(true)}
                      onBlur={() => window.setTimeout(() => setIsCustomerMenuOpen(false), 120)}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, customer: e.target.value, customerEmail: "" }));
                        setIsCustomerMenuOpen(true);
                      }}
                      placeholder="Choose a registered customer"
                      className={customerFieldError ? "stBookFieldInvalidInput" : ""}
                      disabled={modal === "edit"}
                      required
                    />
                    {isCustomerMenuOpen && filteredCustomerOptions.length > 0 && (
                      <div className="stBookSuggestMenu">
                        {filteredCustomerOptions.map((customer) => (
                          <button
                            key={`${customer.email}-${customer.name}`}
                            className="stBookSuggestItem"
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                customer: customer.name,
                                customerEmail: customer.email,
                                selectedCar: "",
                                vehicle: "",
                                carSize: "",
                                plate: "",
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
                  {customerFieldError && <div className="stBookFieldError">{customerFieldError}</div>}
                </label>

                <label className="stBookField">
                  <span>Vehicle</span>
                  {carOptions.length > 0 ? (
                    <ModalSelect
                      value={form.selectedCar}
                      options={carOptions}
                      placeholder="Select registered car"
                      disabled={modal === "edit"}
                      onSelect={(option) => {
                        const selectedCar = selectedCustomerCars.find((car) => `${car.vehicle} | ${car.plate}` === option);
                        setForm((prev) => ({
                          ...prev,
                          selectedCar: option,
                          vehicle: selectedCar?.vehicle || "",
                          carSize: selectedCar?.size || "",
                          plate: selectedCar?.plate || "",
                        }));
                      }}
                    />
                  ) : (
                    <input
                      value={form.vehicle}
                      onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value }))}
                      disabled={modal === "edit"}
                      required
                    />
                  )}
                </label>

                <label className="stBookField">
                  <span>Plate Number</span>
                  <input
                    value={form.plate}
                    onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", plate: e.target.value.toUpperCase() }))}
                    disabled={modal === "edit" || carOptions.length > 0}
                  />
                </label>

                <label className="stBookField">
                  <span>Service</span>
                  <ModalSelect
                    value={form.service}
                    options={serviceOptions}
                    placeholder="Select service"
                    disabled={modal === "edit"}
                    onSelect={(option) => setForm((prev) => ({ ...prev, service: option }))}
                  />
                </label>

                <label className="stBookField">
                  <span>Car Size</span>
                  <ModalSelect
                    value={form.carSize}
                    options={CAR_SIZE_OPTIONS}
                    placeholder="Select car size"
                    disabled={modal === "edit"}
                    onSelect={(option) => setForm((prev) => ({ ...prev, carSize: option }))}
                  />
                </label>

                <label className="stBookField">
                  <span>Mechanic / Staff</span>
                  <ModalSelect
                    value={form.assigned}
                    options={staffOptions}
                    placeholder="Select staff"
                    onSelect={(option) => setForm((prev) => ({ ...prev, assigned: option }))}
                  />
                </label>

                <label className="stBookField">
                  <span>Date</span>
                  <input
                    type="date"
                    min={todayKey}
                    value={form.date}
                    disabled={modal === "edit" && form.status !== "Rescheduled"}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </label>

                <label className="stBookField">
                  <span>Time</span>
                  <input
                    type="time"
                    value={form.time}
                    disabled={modal === "edit" && form.status !== "Rescheduled"}
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value, placeSlot: "" }))}
                    required={modal === "add" || form.status === "Rescheduled"}
                  />
                  {!form.time && modal === "edit" && form.status !== "Rescheduled" ? <div className="stBookSlotHint">No time selected</div> : null}
                </label>

                <label className="stBookField">
                  <span>Status</span>
                  {isCompletedBookingLocked ? (
                    <input value={form.status} readOnly />
                  ) : (
                    <ModalSelect
                      value={form.status}
                      options={STATUS_OPTIONS}
                      placeholder="Select status"
                      onSelect={(option) => setForm((prev) => ({ ...prev, status: option }))}
                    />
                  )}
                </label>

                {form.date && form.time && (
                  <div className="stBookSlotField">
                    <span>Place Slot</span>
                    <div className="stBookPlaceGrid">
                      {PLACE_SLOT_OPTIONS.map((slot) => {
                        const occupied = occupiedPlaceSlots.has(slot);
                        const selected = Number(form.placeSlot || 0) === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            className={`stBookPlaceSlot${occupied ? " occupied" : ""}${selected ? " selected" : ""}`}
                            disabled={occupied}
                            onClick={() => setForm((prev) => ({ ...prev, placeSlot: String(slot) }))}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                    <div className={hasNoAvailableSlots ? "stBookFieldError" : "stBookSlotHint"}>
                      {hasNoAvailableSlots
                        ? "All 8 place slots are occupied for this selected schedule."
                        : `Choose 1 of 8 place slots. Selected service duration: ${selectedServiceDuration} mins.`}
                    </div>
                  </div>
                )}
              </div>
              {formError ? <div className="stBookFieldError">{formError}</div> : null}

              <div className="stBookModalActions">
                <button className="stBookTextBtn" type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button className="stBookPrimaryBtn" type="submit" disabled={modal === "add" && carOptions.length > 0 && !form.selectedCar}>
                  Save Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Bookings"
        fields={[
          { key: "service", label: "Service", type: "select", options: serviceOptions },
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
          { key: "assigned", label: "Assigned To", type: "select", options: staffOptions },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ service: "", status: "", assigned: "" });
          setPage(1);
        }}
      />
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
    </div>
  );
}
