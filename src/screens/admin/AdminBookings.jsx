import "../../styles/css/admin/adminBookingsStyle.css";
import FilterModal from "../../components/common/FilterModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

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
  return { customer: "", customerEmail: "", selectedCar: "", vehicle: "", carSize: "", plate: "", service: defaultService, promoId: "", assigned: "", date: "", time: "", placeSlot: "", amount: "", status: "Scheduled", issueNote: "", issueTypes: [], issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "" }] };
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

function ModalSelect({ value, options, placeholder, onSelect, itemDetails = null, className = "", disabled = false }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value || placeholder;

  return (
    <div className={`bookSuggestWrap bookModalSelect ${className}`.trim()}>
      <button
        className="bookModalSelectTrigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selectedLabel}</span>
      </button>
      {open && (
        <div className="bookSuggestMenu bookModalSelectMenu">
          {options.map((option) => (
            <button
              key={option}
              className="bookSuggestItem bookModalSelectItem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
            >
              <span>{option}</span>
              {itemDetails?.[option] ? <small>{itemDetails[option]}</small> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBookings({ initialAction = null, onActionHandled }) {
  const { bookings, services, promos, users, currentUser, createBooking, updateBooking, deleteBooking } = useAdminData();
  const serviceOptions = services.length ? services.map((service) => service.name) : ["Graphene Coating"];
  const customerOptions = users
    .filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer" && user.name)
    .map((user) => ({ name: user.name, email: user.email || "", cars: Array.isArray(user.cars) ? user.cars : [] }));
  const staffOptions = users.filter((user) => ["staff", "admin"].includes(String(user.userType || "").toLowerCase())).map((user) => user.name).filter(Boolean);
  const activePromos = useMemo(
    () => promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
    [promos]
  );
  const promoOptions = useMemo(
    () => [
      "No promo",
      ...activePromos.map((promo) => {
        const perUserLimit = Number(promo.maxUsagePerUser || 0);
        return `${promo.title} (${Number(promo.discountPercent || 0)}% off${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
      }),
    ],
    [activePromos]
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ service: "", status: "", assigned: "" });
  const [modal, setModal] = useState(null);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [form, setForm] = useState(createEmptyForm(serviceOptions[0]));
  const selectedPromoLabel = useMemo(() => {
    const promo = activePromos.find((entry) => entry.id === form.promoId);
    if (!promo) return "No promo";
    const perUserLimit = Number(promo.maxUsagePerUser || 0);
    return `${promo.title} (${Number(promo.discountPercent || 0)}% off${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
  }, [activePromos, form.promoId]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);
  const [customerFieldError, setCustomerFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const todayKey = getTodayKey();
  
  const selectedBooking = useMemo(() => bookings.find((booking) => booking.id === selectedBookingId) || null, [bookings, selectedBookingId]);
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
    return bookings.filter((b) => {
      const matchesQuery = !q || [b.id, b.customer, formatDate(b.date), b.vehicle, b.plate, b.service, b.assigned, b.status].some((v) => String(v || "").toLowerCase().includes(q));
      const matchesService = !filters.service || b.service === filters.service;
      const matchesStatus = !filters.status || b.status === filters.status;
      const matchesAssigned = !filters.assigned || b.assigned === filters.assigned;
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
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (initialAction !== "open-add-booking") return;
    openAddModal();
    onActionHandled?.();
  }, [initialAction, onActionHandled]);

  useEffect(() => {
    const typedName = String(form.customer || "").trim();
    if (!typedName) {
      setCustomerFieldError("");
      return;
    }

    if (matchedCustomer) {
      setCustomerFieldError("");
      if (form.customerEmail !== matchedCustomer.email) {
        setForm((prev) => ({ ...prev, customer: matchedCustomer.name, customerEmail: matchedCustomer.email || "", selectedCar: "" }));
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
    setForm({ customer: booking.customer, customerEmail: booking.customerEmail || "", selectedCar: "", vehicle: booking.vehicle, carSize: booking.carSize || "", plate: booking.plate || "", service: booking.service, promoId: booking.promoId || "", assigned: booking.assigned, date: booking.date, time: normalizeTimeInputValue(booking.time), placeSlot: booking.placeSlot || "", amount: booking.originalAmount || booking.amount || "", status: booking.status || "Scheduled", issueNote: booking.issueNote || "", issueTypes: booking.issueTypes || [], issueMarkers: booking.issueMarkers && booking.issueMarkers.length > 0 ? booking.issueMarkers.map((marker, index) => ({ id: marker.id || index + 1, x: marker.x, y: marker.y, issueType: marker.issueType || booking.issueTypes?.[index] || "" })) : [{ id: 1, x: 50, y: 50, issueType: "" }] });
    setModal("edit");
  };

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Bookings Report",
      subtitle: "Filtered booking records exported in tabular format.",
      sections: [
        {
          columns: ["Booking ID", "Booking Date", "Customer", "Vehicle", "Plate Number", "Service", "Assigned To", "Status"],
          rows: filtered.map((booking) => [
            booking.id || "-",
            formatDate(booking.date),
            booking.customer || "-",
            booking.vehicle || "-",
            booking.plate || "-",
            booking.service || "-",
            booking.assigned || "-",
            booking.status || "-",
          ]),
          emptyMessage: "No bookings found for the selected filters.",
        },
      ],
    });

  return (
    <div className="bookingsWrap">
      <div className="bookingsRow"><div className="searchGroup"><div className="searchBox"><img src={icoSearch} alt="" className="searchIcon" /><input className="searchInput" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Bookings..." /></div><button className="filterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img src={icoFilter} alt="" className="filterIcon" /></button></div><div className="actionBtns"><button className="btn btnDark" type="button" onClick={exportPdf}>Export as PDF</button><button className="btn btnGold" type="button" onClick={openAddModal}>Add New Booking</button></div></div>

      <div className="tableCard"><table className="tbl"><thead className="tableHead"><tr><th>Booking ID</th><th>Booking Date</th><th>Customer</th><th>Vehicle Model</th><th>Plate Number</th><th>Service</th><th>Assigned To</th><th className="colActions">Actions</th></tr></thead><tbody>{pageRows.length === 0 ? <tr><td colSpan={8} style={{ padding: 16, color: "var(--muted)", fontWeight: 900 }}>No bookings found.</td></tr> : pageRows.map((b) => <tr key={b.id}><td>{b.id}</td><td>{formatDate(b.date)}</td><td>{b.customer}</td><td>{b.vehicle}</td><td>{b.plate || "-"}</td><td>{b.service}</td><td>{b.assigned}</td><td className="colActions"><button className="editBtn" type="button" onClick={() => openEditModal(b)}>Edit</button></td></tr>)}</tbody></table></div>

      <div className="pagerRow"><button className="pagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button>{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => <span key={p} className={`pagerNum${p === safePage ? " active" : ""}`} onClick={() => setPage(p)}>{p}</span>)}<button className="pagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {modal && (
        <div className="bookModalOverlay">
          <div className="bookModalCard" role="dialog" aria-modal="true">
            <button className="bookModalClose" type="button" onClick={closeModal}>x</button>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const resolvedCustomer = modal === "edit" && selectedBooking
                  ? { name: selectedBooking.customer, email: selectedBooking.customerEmail || "" }
                  : matchedCustomer;

                if (!resolvedCustomer) {
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
                const payload = {
                  ...form,
                  selectedCar: undefined,
                  placeSlot: Number(form.placeSlot || 0),
                  customer: resolvedCustomer.name,
                  customerEmail: resolvedCustomer.email || "",
                  originalAmount: Number(resolvedPrice || form.amount || 0),
                  amount: Number(resolvedPrice || form.amount || 0),
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
              <div className="bookModalTitle">{modal === "edit" ? "Edit Booking" : "New Booking"}</div>

              <div className="bookFieldGrid">
                <label className="bookField">
                  <span>Customer Name</span>
                  <div className="bookSuggestWrap">
                    <input
                      value={form.customer}
                      onFocus={() => setIsCustomerMenuOpen(true)}
                      onBlur={() => window.setTimeout(() => setIsCustomerMenuOpen(false), 120)}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, customer: e.target.value, customerEmail: "" }));
                        setIsCustomerMenuOpen(true);
                      }}
                      placeholder="Choose a registered customer"
                      className={customerFieldError ? "bookFieldInvalidInput" : ""}
                      disabled={modal === "edit"}
                      required
                    />
                    {isCustomerMenuOpen && filteredCustomerOptions.length > 0 && (
                      <div className="bookSuggestMenu">
                        {filteredCustomerOptions.map((customer) => (
                          <button
                            key={`${customer.email}-${customer.name}`}
                            className="bookSuggestItem"
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setForm((prev) => ({ ...prev, customer: customer.name, customerEmail: customer.email, selectedCar: "", vehicle: "", carSize: "", plate: "" }));
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
                  {customerFieldError && <div className="bookFieldError">{customerFieldError}</div>}
                </label>
                <label className="bookField">
                  <span>Vehicle</span>
                  {carOptions.length > 0 ? (
                    <ModalSelect
                      value={form.selectedCar}
                      options={carOptions}
                      placeholder="Select registered car"
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
                      disabled={modal === "edit"}
                    />
                  ) : (
                    <input value={form.vehicle} onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value }))} disabled={modal === "edit"} required />
                  )}
                </label>
                <label className="bookField"><span>Plate Number</span><input value={form.plate || ""} onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", plate: e.target.value.toUpperCase() }))} disabled={modal === "edit" || carOptions.length > 0} required /></label>
                <label className="bookField"><span>Service</span><ModalSelect value={form.service} options={serviceOptions} placeholder="Select service" onSelect={(option) => setForm((prev) => ({ ...prev, service: option }))} disabled={modal === "edit"} /></label>
                {promoOptions.length > 0 && (
                  <label className="bookField">
                    <span>Promo</span>
                    <ModalSelect
                      value={selectedPromoLabel}
                      options={promoOptions}
                      placeholder="Select promo"
                      disabled={modal === "edit"}
                      onSelect={(option) => {
                        if (option === "No promo") {
                          setForm((prev) => ({ ...prev, promoId: "" }));
                          return;
                        }
                        const promo = activePromos.find((entry) => {
                          const perUserLimit = Number(entry.maxUsagePerUser || 0);
                          return `${entry.title} (${Number(entry.discountPercent || 0)}% off${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})` === option;
                        });
                        setForm((prev) => ({ ...prev, promoId: promo?.id || "" }));
                      }}
                    />
                  </label>
                )}
                <label className="bookField">
                  <span>Car Size</span>
                  <ModalSelect
                    value={form.carSize}
                    options={CAR_SIZE_OPTIONS}
                    placeholder="Select car size"
                    disabled={modal === "edit"}
                    onSelect={(option) => setForm((prev) => ({ ...prev, carSize: option }))}
                  />
                </label>
                <label className="bookField"><span>Staff</span><ModalSelect value={form.assigned} options={staffOptions} placeholder="Select staff" onSelect={(option) => setForm((prev) => ({ ...prev, assigned: option }))} /></label>
                <label className="bookField"><span>Date</span><input type="date" min={todayKey} value={form.date} disabled={modal === "edit" && form.status !== "Rescheduled"} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} required /></label>
                <label className="bookField"><span>Time</span><input type="time" value={form.time} disabled={modal === "edit" && form.status !== "Rescheduled"} onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value, placeSlot: "" }))} required={modal === "add" || form.status === "Rescheduled"} />{!form.time && modal === "edit" && form.status !== "Rescheduled" ? <div className="bookSlotHint">No time selected</div> : null}</label>
                <label className="bookField">
                  <span>Status</span>
                  {isCompletedBookingLocked ? (
                    <input value={form.status} readOnly />
                  ) : (
                    <ModalSelect value={form.status} options={STATUS_OPTIONS} placeholder="Select status" onSelect={(option) => setForm((prev) => ({ ...prev, status: option }))} />
                  )}
                </label>
                {form.date && form.time && (
                  <div className="bookSlotField">
                    <span>Place Slot</span>
                    <div className="bookPlaceGrid">
                      {PLACE_SLOT_OPTIONS.map((slot) => {
                        const occupied = occupiedPlaceSlots.has(slot);
                        const selected = Number(form.placeSlot || 0) === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            className={`bookPlaceSlot${occupied ? " occupied" : ""}${selected ? " selected" : ""}`}
                            disabled={occupied}
                            onClick={() => setForm((prev) => ({ ...prev, placeSlot: String(slot) }))}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                    <div className={hasNoAvailableSlots ? "bookFieldError" : "bookSlotHint"}>
                      {hasNoAvailableSlots
                        ? "All 8 place slots are occupied for this selected schedule."
                        : `Choose 1 of 8 place slots. Selected service duration: ${selectedServiceDuration} mins.`}
                    </div>
                  </div>
                )}
              </div>
              {formError ? <div className="bookFieldError bookFormError">{formError}</div> : null}

              <div className="bookModalActions">
                {modal === "edit" && selectedBooking && (
                  <button
                    className="bookDangerBtn"
                    type="button"
                    disabled={selectedBooking.status !== "Cancelled"}
                    onClick={() => setIsDeleteConfirmOpen(true)}
                  >
                    Delete
                  </button>
                )}
                <button className="bookTextBtn" type="button" onClick={closeModal}>Cancel</button>
                <button className="bookPrimaryBtn" type="submit" disabled={modal === "add" && (!matchedCustomer || (carOptions.length > 0 && !form.selectedCar))}>Save Booking</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={isDeleteConfirmOpen}
        title="Delete Booking"
        message={selectedBooking ? `Delete booking ${selectedBooking.id}? This also removes its linked payment record.` : "Delete this booking?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
	        onConfirm={async () => {
	          if (!selectedBooking) return;
	          if (selectedBooking.status !== "Cancelled") {
	            setFormError("Only cancelled bookings can be deleted.");
	            setIsDeleteConfirmOpen(false);
	            return;
	          }
	          setSecurityConfirm({
              mode: "pin",
              title: "Delete Booking",
              message: "Enter the special PIN before deleting this cancelled booking.",
              onConfirm: async () => {
                await deleteBooking(selectedBooking.id);
                setSecurityConfirm(null);
                setIsDeleteConfirmOpen(false);
                setPage(1);
                closeModal();
              },
            });
        }}
        onClose={() => setIsDeleteConfirmOpen(false)}
      />

      <FilterModal open={isFilterOpen} title="Filter Bookings" fields={[{ key: "service", label: "Service", type: "select", options: serviceOptions }, { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { key: "assigned", label: "Assigned To", type: "select", options: staffOptions }]} values={filters} onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))} onClose={() => setIsFilterOpen(false)} onApply={() => { setPage(1); setIsFilterOpen(false); }} onReset={() => { setFilters({ service: "", status: "", assigned: "" }); setPage(1); }} />
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
    </div>
  );
}
