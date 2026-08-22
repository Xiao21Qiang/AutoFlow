import "../../styles/css/admin/adminBookingsStyle.css";
import FilterModal from "../../components/common/FilterModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { CAR_SIZE_OPTIONS, getPriceForCarSize } from "../../utils/servicePricing";
import { getDetailerStaffOptions } from "../../utils/staffRoles";
import { ACTION_KEYS, canPerformAction, getEffectiveRole } from "../../utils/rbac";
import {
  PLACE_SLOT_OPTIONS,
  canScheduleBooking,
  getServiceArrivalTimeOptions,
  getLinkedPaymentForBooking,
  getPreferredDetailerDisplay,
  getSchedulingValidationMessage,
  getShopTimeValidationMessage,
  isBookingDownPaymentSatisfied,
  isScheduledStatus,
} from "../../utils/bookingWorkflow";
import { formatCompletionReadinessMessage, getCompletionReadiness } from "../../utils/completionWorkflow";

const STATUS_OPTIONS = ["Scheduled", "Pending", "In Progress", "Completed", "Cancelled"];
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function createEmptyForm(defaultService = "") {
  return { customer: "", customerEmail: "", selectedCar: "", vehicle: "", carSize: "", plate: "", service: defaultService, promoId: "", assigned: "", date: "", time: "", placeSlot: "", amount: "", status: "Scheduled", issueNote: "", issueTypes: [], issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "" }] };
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTimeInputValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "";
}

function isRescheduledStatus(status) {
  return String(status || "").trim().toLowerCase() === "rescheduled";
}

function isPendingSchedulingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "pending" || normalized === "pending confirmation" || normalized === "pending assignment";
}

function isCancelledStatus(status) {
  return String(status || "").trim().toLowerCase() === "cancelled";
}

function isScheduleBlockingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return !["completed", "cancelled", "rejected"].includes(normalized);
}

function hasRealPlaceSlot(value) {
  return PLACE_SLOT_OPTIONS.includes(Number(value || 0));
}

const ADD_BOOKING_REQUIRED_MESSAGES = {
  customer: "Please select a registered customer from the list.",
  vehicle: "Vehicle is required.",
  plate: "Plate number is required.",
  service: "Please select a service.",
  carSize: "Please select a car size.",
  assigned: "Please select an assigned detailer.",
  date: "Booking date is required.",
  time: "Please select a time.",
  placeSlot: "Please select a place slot.",
};

const ADD_BOOKING_REQUIRED_FIELDS = Object.keys(ADD_BOOKING_REQUIRED_MESSAGES);

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

function getAddBookingValidationErrors({ form, matchedCustomer, availablePlaceSlots, hasNoAvailableSlots }) {
  const errors = {};
  if (!matchedCustomer) errors.customer = ADD_BOOKING_REQUIRED_MESSAGES.customer;
  if (!String(form.vehicle || "").trim()) errors.vehicle = ADD_BOOKING_REQUIRED_MESSAGES.vehicle;
  if (!String(form.plate || "").trim()) errors.plate = ADD_BOOKING_REQUIRED_MESSAGES.plate;
  if (!String(form.service || "").trim()) errors.service = ADD_BOOKING_REQUIRED_MESSAGES.service;
  if (!CAR_SIZE_OPTIONS.includes(String(form.carSize || "").trim())) errors.carSize = ADD_BOOKING_REQUIRED_MESSAGES.carSize;
  if (!String(form.assigned || "").trim()) errors.assigned = ADD_BOOKING_REQUIRED_MESSAGES.assigned;
  if (!String(form.date || "").trim()) errors.date = ADD_BOOKING_REQUIRED_MESSAGES.date;
  if (!String(form.time || "").trim()) errors.time = ADD_BOOKING_REQUIRED_MESSAGES.time;

  const slot = Number(form.placeSlot || 0);
  if (!PLACE_SLOT_OPTIONS.includes(slot)) {
    errors.placeSlot = hasNoAvailableSlots
      ? "No place slots are available for the selected schedule."
      : ADD_BOOKING_REQUIRED_MESSAGES.placeSlot;
  } else if (!availablePlaceSlots.includes(slot)) {
    errors.placeSlot = "That place slot is no longer available. Please choose another one.";
  }

  return errors;
}

function ModalSelect({
  value,
  options,
  placeholder,
  onSelect,
  itemDetails = null,
  className = "",
  disabled = false,
  disabledOptions = [],
  invalid = false,
  ariaDescribedBy,
  ariaLabel,
  onBlur,
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value || placeholder;
  const disabledOptionSet = new Set(disabledOptions);

  return (
    <div className={`bookSuggestWrap bookModalSelect ${className}`.trim()}>
      <button
        className={`bookModalSelectTrigger${invalid ? " bookFieldInvalidInput" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onBlur={onBlur}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selectedLabel}</span>
      </button>
      {open && (
        <div className="bookSuggestMenu bookModalSelectMenu">
          {options.map((option) => {
            const optionDisabled = disabledOptionSet.has(option);
            return (
              <button
                key={option}
                className="bookSuggestItem bookModalSelectItem"
                type="button"
                disabled={optionDisabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (optionDisabled) return;
                  onSelect(option);
                  setOpen(false);
                }}
              >
                <span>{option}</span>
                {itemDetails?.[option] ? <small>{itemDetails[option]}</small> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminBookings({ initialAction = null, onActionHandled, allowDelete = true }) {
  const { bookings, services, promos, users, payments, currentUser, createBooking, updateBooking, rescheduleBooking, deleteBooking } = useAdminData();
  const exportInFlightRef = useRef(false);
  const createInFlightRef = useRef(false);
  const serviceOptions = useMemo(
    () => services.filter((service) => service.name && service.enabled !== false).map((service) => service.name),
    [services]
  );
  const customerOptions = useMemo(
    () =>
      users
        .filter((user) => String(user.userType || user.role || "").trim().toLowerCase() === "customer" && user.name)
        .map((user) => ({ name: user.name, email: user.email || "", cars: Array.isArray(user.cars) ? user.cars : [] })),
    [users]
  );
  const staffOptions = useMemo(() => getDetailerStaffOptions(users), [users]);
  const activePromos = useMemo(
    () => promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
    [promos]
  );
  const promoOptions = useMemo(
    () => [
      "No promo",
      ...activePromos.map((promo) => {
        const perUserLimit = Number(promo.maxUsagePerUser || 0);
        const discount = promo.discountType === "Fixed" ? `P ${Number(promo.discountValue || 0)} off` : `${Number(promo.discountValue || promo.discountPercent || 0)}% off`;
        return `${promo.title} (${discount}${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
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
  const [form, setForm] = useState(createEmptyForm());
  const selectedPromoLabel = useMemo(() => {
    const promo = activePromos.find((entry) => entry.id === form.promoId);
    if (!promo) return "No promo";
    const perUserLimit = Number(promo.maxUsagePerUser || 0);
    const discount = promo.discountType === "Fixed" ? `P ${Number(promo.discountValue || 0)} off` : `${Number(promo.discountValue || promo.discountPercent || 0)}% off`;
    return `${promo.title} (${discount}${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
  }, [activePromos, form.promoId]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);
  const [customerFieldError, setCustomerFieldError] = useState("");
  const [touchedFields, setTouchedFields] = useState({});
  const [formError, setFormError] = useState("");
  const [exportState, setExportState] = useState({ status: "idle", message: "" });
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [toast, setToast] = useState(null);
  const todayKey = getTodayKey();
  
  const selectedBooking = useMemo(() => bookings.find((booking) => booking.id === selectedBookingId) || null, [bookings, selectedBookingId]);
  const isCompletedBookingLocked = modal === "edit" && isCompletedStatus(selectedBooking?.status);
  const isCancelledBookingLocked = modal === "edit" && isCancelledStatus(selectedBooking?.status);
  const isPendingBookingEdit = modal === "edit" && isPendingSchedulingStatus(selectedBooking?.status);
  const isScheduledBookingEdit = modal === "edit" && isScheduledStatus(selectedBooking?.status);
  const linkedPayment = useMemo(
    () => getLinkedPaymentForBooking(selectedBooking, payments),
    [payments, selectedBooking]
  );
  const draftBookingForScheduling = useMemo(
    () => ({
      ...(selectedBooking || {}),
      ...form,
      placeSlot: Number(form.placeSlot || 0),
    }),
    [form, selectedBooking]
  );
  const downPaymentSatisfied = isBookingDownPaymentSatisfied(draftBookingForScheduling, linkedPayment);
  const currentUserRole = getEffectiveRole(currentUser);
  const canRescheduleCancelledBooking = useCallback((booking) => {
    if (!booking || !isCancelledStatus(booking.status)) return false;
    const bookingPayment = getLinkedPaymentForBooking(booking, payments);
    return Boolean(
      isBookingDownPaymentSatisfied(booking, bookingPayment) &&
      canPerformAction(currentUser, ACTION_KEYS.bookingUpdateStatus) &&
      (currentUserRole === "admin" || currentUserRole === "general manager" || currentUserRole === "sales associate")
    );
  }, [currentUser, currentUserRole, payments]);
  const canUseCancelledRescheduleWorkflow = Boolean(selectedBooking && canRescheduleCancelledBooking(selectedBooking));
  const scheduleRequirementsMet = canScheduleBooking(draftBookingForScheduling, linkedPayment);
  const schedulingValidationMessage = getSchedulingValidationMessage(draftBookingForScheduling, linkedPayment);
  const completionDraft = useMemo(
    () => ({
      ...(selectedBooking || {}),
      ...form,
      status: selectedBooking?.status || form.status,
      placeSlot: Number(form.placeSlot || selectedBooking?.placeSlot || 0),
    }),
    [form, selectedBooking]
  );
  const completionReadiness = getCompletionReadiness(completionDraft, linkedPayment);
  const completionReadinessMessage = formatCompletionReadinessMessage(completionReadiness);
  const canEditExistingSchedule = modal === "edit" && !isCancelledBookingLocked && !isPendingBookingEdit && downPaymentSatisfied;
  const canEditScheduleFields = modal === "add" || isRescheduledStatus(form.status) || (isScheduledStatus(form.status) && (modal !== "edit" || canEditExistingSchedule)) || (isPendingBookingEdit && downPaymentSatisfied);
  const canEditPlaceSlot = modal === "add" || isRescheduledStatus(form.status) || (isScheduledStatus(form.status) && (modal !== "edit" || canEditExistingSchedule)) || (isPendingBookingEdit && downPaymentSatisfied && Boolean(String(form.assigned || "").trim()));
  const assignedStaffLocked = modal === "edit" && !isPendingBookingEdit;
  const disabledStatusOptions = useMemo(() => {
    if (isCompletedBookingLocked || isCancelledBookingLocked) return [];
    const disabledOptions = [];
    if (isPendingBookingEdit && !scheduleRequirementsMet) disabledOptions.push("Scheduled");
    if (isScheduledBookingEdit) disabledOptions.push("Pending");
    if (modal === "add" || !completionReadiness.canComplete) disabledOptions.push("Completed");
    return disabledOptions;
  }, [completionReadiness.canComplete, isCancelledBookingLocked, isCompletedBookingLocked, isPendingBookingEdit, isScheduledBookingEdit, modal, scheduleRequirementsMet]);
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
  const selectedServiceForSchedule = useMemo(
    () => services.find((service) => service.name === form.service) || null,
    [services, form.service]
  );
  const selectedServiceDuration = Math.max(1, Number(serviceDurationByName[form.service] || 0));
  const timeOptions = useMemo(
    () => getServiceArrivalTimeOptions(selectedServiceForSchedule || { mins: selectedServiceDuration }, form.time),
    [selectedServiceForSchedule, selectedServiceDuration, form.time]
  );
  const overlappingBookings = useMemo(() => {
    if (!form.date || !form.time) return [];

    return bookings.filter((booking) => {
      if (selectedBooking && booking.id === selectedBooking.id) return false;
      if (String(booking.date || "") !== String(form.date || "")) return false;
      if (String(booking.time || "") !== String(form.time || "")) return false;
      if (!isScheduleBlockingStatus(booking.status)) return false;
      if (!hasRealPlaceSlot(booking.placeSlot)) return false;
      return true;
    });
  }, [bookings, form.date, form.time, selectedBooking]);
  const occupiedPlaceSlots = useMemo(() => {
    const occupied = new Set();

    overlappingBookings.forEach((booking) => {
      const slot = Number(booking.placeSlot || 0);
      if (hasRealPlaceSlot(slot)) {
        occupied.add(slot);
      }
    });

    return occupied;
  }, [overlappingBookings]);
  const availablePlaceSlots = useMemo(
    () => PLACE_SLOT_OPTIONS.filter((slot) => !occupiedPlaceSlots.has(slot)),
    [occupiedPlaceSlots]
  );
  const hasNoAvailableSlots = Boolean(form.date && form.time) && availablePlaceSlots.length === 0;
  const placeSlotOptions = useMemo(() => PLACE_SLOT_OPTIONS.map((slot) => `Place Slot ${slot}`), []);
  const disabledPlaceSlotOptions = useMemo(
    () => PLACE_SLOT_OPTIONS.filter((slot) => occupiedPlaceSlots.has(slot)).map((slot) => `Place Slot ${slot}`),
    [occupiedPlaceSlots]
  );
  const addBookingErrors = useMemo(
    () => modal === "add"
      ? getAddBookingValidationErrors({ form, matchedCustomer, availablePlaceSlots, hasNoAvailableSlots })
      : {},
    [availablePlaceSlots, form, hasNoAvailableSlots, matchedCustomer, modal]
  );
  const isAddBookingFormValid = modal !== "add" || (Object.keys(addBookingErrors).length === 0 && !customerFieldError);
  const saveBookingDisabled = (modal === "add" && (!isAddBookingFormValid || isCreatingBooking)) || isCancelledBookingLocked;
  const markFieldTouched = useCallback((field) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
  }, []);
  const getTouchedFieldError = useCallback((field) => (
    touchedFields[field] ? addBookingErrors[field] || "" : ""
  ), [addBookingErrors, touchedFields]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openAddModal = useCallback(() => {
    setSelectedBookingId(null);
    setTouchedFields({});
    setFormError("");
    setCustomerFieldError("");
    setForm(createEmptyForm());
    setModal("add");
  }, []);

  useEffect(() => {
    if (initialAction !== "open-add-booking") return;
    openAddModal();
    onActionHandled?.();
  }, [initialAction, onActionHandled, openAddModal]);

  useEffect(() => {
    const typedName = String(form.customer || "").trim();
    if (!typedName) {
      if (customerFieldError) {
        setCustomerFieldError("");
      }
      return;
    }

    if (matchedCustomer) {
      if (customerFieldError) {
        setCustomerFieldError("");
      }
      if (form.customerEmail !== matchedCustomer.email) {
        setForm((prev) => ({ ...prev, customer: matchedCustomer.name, customerEmail: matchedCustomer.email || "", selectedCar: "" }));
      }
      return;
    }

    const unregisteredMessage = "This customer is not registered yet. Please choose a registered customer from the list.";
    if (customerFieldError !== unregisteredMessage) {
      setCustomerFieldError(unregisteredMessage);
    }
  }, [customerFieldError, form.customer, form.customerEmail, matchedCustomer]);
  useEffect(() => {
    if (!form.placeSlot) return;
    if (!(modal === "add" || modal === "reschedule" || canEditPlaceSlot)) return;
    if (availablePlaceSlots.includes(Number(form.placeSlot))) return;

    setForm((prev) => (prev.placeSlot ? { ...prev, placeSlot: "" } : prev));
  }, [availablePlaceSlots, canEditPlaceSlot, form.placeSlot, modal]);

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
    setTouchedFields({});
    setFormError("");
    setForm(createEmptyForm());
  };

  const openEditModal = (booking) => {
    setSelectedBookingId(booking.id);
    setTouchedFields({});
    setFormError("");
    setForm({ customer: booking.customer, customerEmail: booking.customerEmail || "", selectedCar: "", vehicle: booking.vehicle, carSize: booking.carSize || "", plate: booking.plate || "", service: booking.service, promoId: booking.promoId || "", assigned: booking.assigned, date: booking.date, time: normalizeTimeInputValue(booking.time), placeSlot: booking.placeSlot || "", amount: booking.originalAmount || booking.amount || "", status: booking.status || "Scheduled", issueNote: booking.issueNote || "", issueTypes: booking.issueTypes || [], issueMarkers: booking.issueMarkers && booking.issueMarkers.length > 0 ? booking.issueMarkers.map((marker, index) => ({ id: marker.id || index + 1, x: marker.x, y: marker.y, issueType: marker.issueType || booking.issueTypes?.[index] || "" })) : [{ id: 1, x: 50, y: 50, issueType: "" }] });
    setModal("edit");
  };

  const openRescheduleModal = (booking = selectedBooking) => {
    if (!booking || !canRescheduleCancelledBooking(booking)) return;
    setSelectedBookingId(booking.id);
    setTouchedFields({});
    setFormError("");
    setForm((prev) => ({
      ...prev,
      date: booking.date || "",
      time: normalizeTimeInputValue(booking.time),
      placeSlot: booking.placeSlot || "",
    }));
    setModal("reschedule");
  };

  const openDeleteConfirm = (booking) => {
    if (!booking) return;
    setSelectedBookingId(booking.id);
    setFormError("");
    setIsDeleteConfirmOpen(true);
  };

  const exportPdf = async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportState({ status: "loading", message: "" });
    try {
      await downloadAuthenticatedFile(buildReportDownloadPath("bookings", "pdf"), "autoflow-bookings-report.pdf");
      setExportState({ status: "success", message: "Bookings report export started." });
    } catch (error) {
      setExportState({ status: "error", message: error.message || "Could not download report." });
    } finally {
      exportInFlightRef.current = false;
    }
  };

  return (
    <div className="bookingsWrap">
      <div className="bookingsRow"><div className="searchGroup"><div className="searchBox"><img src={icoSearch} alt="" className="searchIcon" /><input className="searchInput" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Bookings..." /></div><button className="filterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img src={icoFilter} alt="" className="filterIcon" /></button></div><div className="actionBtns"><button className="btn btnDark" type="button" onClick={exportPdf} disabled={exportState.status === "loading"}>{exportState.status === "loading" ? "Exporting..." : "Export as PDF"}</button><button className="btn btnGold" type="button" onClick={openAddModal}>Add New Booking</button></div></div>
      {exportState.message ? <div className="bookSlotHint" role={exportState.status === "error" ? "alert" : "status"}>{exportState.message}</div> : null}

      <div className="tableCard"><table className="tbl"><thead className="tableHead"><tr><th>Booking ID</th><th>Booking Date</th><th>Customer</th><th>Vehicle Model</th><th>Plate Number</th><th>Service</th><th>Assigned To</th><th className="colActions">Actions</th></tr></thead><tbody>{pageRows.length === 0 ? <tr><td colSpan={8} style={{ padding: 16, color: "var(--muted)", fontWeight: 900 }}>No bookings found.</td></tr> : pageRows.map((b) => {
        const canRescheduleRow = canRescheduleCancelledBooking(b);
        const canDeleteRow = allowDelete && isCancelledStatus(b.status);
        return (
          <tr key={b.id}><td>{b.id}</td><td>{formatDate(b.date)}</td><td>{b.customer}</td><td>{b.vehicle}</td><td>{b.plate || "-"}</td><td>{b.service}</td><td>{b.assigned}</td><td className="colActions"><div className="bookRowActions"><button className="editBtn" type="button" onClick={() => openEditModal(b)}>Edit</button>{canRescheduleRow ? <button className="editBtn bookActionReschedule" type="button" onClick={() => openRescheduleModal(b)}>Reschedule</button> : null}{canDeleteRow ? <button className="editBtn bookActionDelete" type="button" aria-label={`Delete ${b.id}`} onClick={() => openDeleteConfirm(b)}>Delete</button> : null}</div></td></tr>
        );
      })}</tbody></table></div>

      <div className="pagerRow"><button className="pagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button>{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => <span key={p} className={`pagerNum${p === safePage ? " active" : ""}`} onClick={() => setPage(p)}>{p}</span>)}<button className="pagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {modal && (
        <div className="bookModalOverlay">
          <div className="bookModalCard" role="dialog" aria-modal="true">
            <button className="bookModalClose" type="button" onClick={closeModal}>x</button>
            {modal === "reschedule" && selectedBooking ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canUseCancelledRescheduleWorkflow) {
                  setFormError("Down payment must be verified as paid before this booking can be rescheduled.");
                  return;
                }
                if (form.date && form.date < todayKey) {
                  setFormError("Please select today or a future date for the booking.");
                  return;
                }
                if (!form.date) {
                  setFormError("Booking date is required before rescheduling.");
                  return;
                }
                if (!form.time) {
                  setFormError("Please choose a booking time before rescheduling.");
                  return;
                }
                const shopTimeError = getShopTimeValidationMessage(form.time, selectedServiceDuration);
                if (shopTimeError) {
                  setFormError(shopTimeError);
                  return;
                }
                if (!form.placeSlot) {
                  setFormError(hasNoAvailableSlots ? "No place slots are available for the selected schedule." : "A place slot is required before rescheduling.");
                  return;
                }
                if (!availablePlaceSlots.includes(Number(form.placeSlot))) {
                  setFormError("That place slot is no longer available. Please choose another one.");
                  return;
                }

                setFormError("");
                setSecurityConfirm({
                  mode: "pin",
                  actionKey: ACTION_KEYS.bookingUpdateStatus,
                  title: "Reschedule Booking",
                  message: "Enter the special PIN before saving this reschedule.",
                  onConfirm: async ({ secret }) => {
                    try {
                      await rescheduleBooking(selectedBooking.id, {
                        date: form.date,
                        time: form.time,
                        placeSlot: Number(form.placeSlot || 0),
                        specialPin: secret,
                      });
                      setToast({ type: "success", message: "Booking rescheduled.", id: Date.now() });
                      setSecurityConfirm(null);
                      setPage(1);
                      closeModal();
                    } catch (error) {
                      setToast({ type: "error", message: error.message || "Failed to reschedule booking.", id: Date.now() });
                      setFormError(error.message || "Failed to reschedule booking.");
                      throw error;
                    }
                  },
                });
              }}
            >
              <div className="bookModalTitle">Reschedule Booking</div>
              <div className="bookFieldGrid">
                <label className="bookField"><span>Booking ID</span><input value={selectedBooking.id || ""} readOnly /></label>
                <label className="bookField"><span>Customer Name</span><input value={selectedBooking.customer || ""} readOnly /></label>
                <label className="bookField"><span>Vehicle</span><input value={selectedBooking.vehicle || ""} readOnly /></label>
                <label className="bookField"><span>Service</span><input value={selectedBooking.service || ""} readOnly /></label>
                <label className="bookField">
                  <span>Date</span>
                  <input
                    type="date"
                    aria-label="Date"
                    min={todayKey}
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value, placeSlot: "" }))}
                    required
                  />
                </label>
                <label className="bookField">
                  <span>Time</span>
                  <select
                    value={form.time}
                    aria-label="Time"
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value, placeSlot: "" }))}
                    required
                  >
                    <option value="">Select time</option>
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="bookField">
                  <span>Place Slot</span>
                  <ModalSelect
                    value={form.placeSlot ? `Place Slot ${form.placeSlot}` : ""}
                    options={placeSlotOptions}
                    placeholder="Select place slot"
                    disabled={!form.date || !form.time || hasNoAvailableSlots}
                    disabledOptions={disabledPlaceSlotOptions}
                    ariaLabel="Place Slot"
                    onSelect={(option) => {
                      const slot = Number(String(option).replace(/[^0-9]/g, ""));
                      setForm((prev) => ({ ...prev, placeSlot: String(slot || "") }));
                    }}
                  />
                  <div className={hasNoAvailableSlots ? "bookFieldError" : "bookSlotHint"}>
                    {!form.date || !form.time
                      ? "Select a date and time before choosing a place slot."
                      : hasNoAvailableSlots
                        ? "No place slots are available for the selected schedule."
                        : `Choose an available place slot. Selected service duration: ${selectedServiceDuration} mins.`}
                  </div>
                </label>
              </div>
              {formError ? <div className="bookFieldError bookFormError">{formError}</div> : null}
              <div className="bookModalActions">
                <button className="bookTextBtn" type="button" onClick={closeModal}>Cancel</button>
                <button className="bookPrimaryBtn" type="submit">Confirm Reschedule</button>
              </div>
            </form>
            ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isCancelledBookingLocked) {
                  setFormError("Cancelled bookings are locked and cannot be edited.");
                  return;
                }
                if (modal === "add" && !isAddBookingFormValid) {
                  setTouchedFields(Object.fromEntries(ADD_BOOKING_REQUIRED_FIELDS.map((field) => [field, true])));
                  if (addBookingErrors.customer) {
                    setCustomerFieldError(addBookingErrors.customer);
                    setIsCustomerMenuOpen(true);
                  }
                  setFormError(Object.values(addBookingErrors)[0] || customerFieldError || "Please complete the required booking fields.");
                  return;
                }
                const resolvedCustomer = modal === "edit" && selectedBooking
                  ? { name: selectedBooking.customer, email: selectedBooking.customerEmail || "" }
                  : matchedCustomer;

                if (!resolvedCustomer) {
                  setCustomerFieldError("Please select a registered customer from the list.");
                  setIsCustomerMenuOpen(true);
                  return;
                }

                setFormError("");
                if (modal === "add" && !form.service) {
                  setFormError("Please choose an active service before creating this booking.");
                  return;
                }
                const isReschedule = isRescheduledStatus(form.status);
                const isScheduledEdit = modal === "edit" && selectedBooking && isScheduledStatus(form.status);
                const isSchedulingPending = isPendingBookingEdit && isScheduledStatus(form.status);
                const canPersistScheduleEdit = isReschedule || isSchedulingPending;
                const hasScheduleChanged = isScheduledEdit && (
                  String(selectedBooking.date || "") !== String(form.date || "") ||
                  String(selectedBooking.time || "") !== String(form.time || "") ||
                  String(selectedBooking.placeSlot || "") !== String(form.placeSlot || "")
                );
                const canPersistScheduleUpdate = canPersistScheduleEdit || hasScheduleChanged;
                const requiresTime = modal === "add" || canPersistScheduleEdit || hasScheduleChanged || isScheduledEdit;

                if ((modal === "add" || isReschedule) && form.date && form.date < todayKey) {
                  setFormError("Please select today or a future date for the booking.");
                  return;
                }

                if (isSchedulingPending) {
                  const schedulingError = getSchedulingValidationMessage(draftBookingForScheduling, linkedPayment);
                  if (schedulingError) {
                    setFormError(schedulingError);
                    return;
                  }
                }

                if (requiresTime && !form.time) {
                  setFormError(isReschedule ? "Please choose a booking time before rescheduling." : "A valid time is required before scheduling.");
                  return;
                }

                const shopTimeError = requiresTime ? getShopTimeValidationMessage(form.time, selectedServiceDuration) : "";
                if (shopTimeError) {
                  setFormError(shopTimeError);
                  return;
                }

                if (requiresTime && !form.placeSlot) {
                  setFormError(hasNoAvailableSlots ? "No place slots are available for the selected schedule." : "A place slot is required before scheduling.");
                  return;
                }

                if (requiresTime && !availablePlaceSlots.includes(Number(form.placeSlot))) {
                  setFormError("That place slot is no longer available. Please choose another one.");
                  return;
                }

                if (String(form.status || "").trim().toLowerCase() === "completed" && !completionReadiness.canComplete) {
                  setFormError(completionReadinessMessage || "Booking cannot be completed yet.");
                  return;
                }

                const matchedService = services.find((service) => service.name === form.service);
                const resolvedPrice = getPriceForCarSize(matchedService, form.carSize);
                const payload = {
                  ...form,
                  selectedCar: undefined,
                  placeSlot: Number(form.placeSlot || 0),
                  status: isSchedulingPending || isReschedule ? "Scheduled" : form.status,
                  customer: resolvedCustomer.name,
                  customerEmail: resolvedCustomer.email || "",
                  originalAmount: Number(resolvedPrice || form.amount || 0),
                  amount: Number(resolvedPrice || form.amount || 0),
                };
                if (modal === "edit" && selectedBooking && !canPersistScheduleUpdate) {
                  payload.date = selectedBooking.date;
                  payload.time = selectedBooking.time || "";
                  payload.placeSlot = selectedBooking.placeSlot || 0;
                }

                try {
                  if (modal === "add") {
                    if (createInFlightRef.current) return;
                    createInFlightRef.current = true;
                    setIsCreatingBooking(true);
                    try {
                      await createBooking(payload);
                      setToast({ type: "success", message: "Booking created.", id: Date.now() });
                    } finally {
                      createInFlightRef.current = false;
                      setIsCreatingBooking(false);
                    }
                  } else if (selectedBooking) {
                    const saveEdit = async (securityPayload = {}) => {
                      await updateBooking(selectedBooking.id, { ...selectedBooking, ...payload, ...securityPayload });
                      setToast({ type: "success", message: "Booking updated.", id: Date.now() });
                      setPage(1);
                      closeModal();
                    };
                    const needsCancelPin = form.status === "Cancelled" && selectedBooking.status !== "Cancelled";
                    const needsReschedulePin = isReschedule || hasScheduleChanged;
                    if (needsReschedulePin && !downPaymentSatisfied) {
                      setFormError("Down payment must be verified as paid before this booking can be rescheduled.");
                      return;
                    }
                    if (needsCancelPin || needsReschedulePin) {
                      setSecurityConfirm({
                        mode: "pin",
                        actionKey: ACTION_KEYS.bookingUpdateStatus,
                        title: needsCancelPin ? "Cancel Booking" : "Reschedule Booking",
                        message: needsCancelPin ? "Enter the special PIN before cancelling this booking." : "Enter the special PIN before saving this reschedule.",
                        onConfirm: async ({ secret }) => {
                          try {
                            await saveEdit({ specialPin: secret });
                            setSecurityConfirm(null);
                          } catch (error) {
                            setToast({ type: "error", message: error.message || "Failed to update booking.", id: Date.now() });
                            throw error;
                          }
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
                  setToast({ type: "error", message: error.message || `Failed to ${modal === "edit" ? "update" : "create"} booking.`, id: Date.now() });
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
                      onBlur={() => {
                        markFieldTouched("customer");
                        window.setTimeout(() => setIsCustomerMenuOpen(false), 120);
                      }}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, customer: e.target.value, customerEmail: "" }));
                        setIsCustomerMenuOpen(true);
                      }}
                      placeholder="Choose a registered customer"
                      aria-label="Customer Name"
                      className={(customerFieldError || getTouchedFieldError("customer")) ? "bookFieldInvalidInput" : ""}
                      disabled={modal === "edit"}
                      required
                      aria-invalid={(customerFieldError || getTouchedFieldError("customer")) ? "true" : undefined}
                      aria-describedby={(customerFieldError || getTouchedFieldError("customer")) ? "admin-booking-customer-error" : undefined}
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
                  {(customerFieldError || getTouchedFieldError("customer")) && <div id="admin-booking-customer-error" className="bookFieldError">{customerFieldError || getTouchedFieldError("customer")}</div>}
                </label>
                <label className="bookField">
                  <span>Vehicle</span>
                  {carOptions.length > 0 ? (
                    <ModalSelect
                      value={form.selectedCar}
                      options={carOptions}
                      placeholder="Select registered car"
                      invalid={Boolean(getTouchedFieldError("vehicle"))}
                      ariaLabel="Vehicle"
                      ariaDescribedBy={getTouchedFieldError("vehicle") ? "admin-booking-vehicle-error" : undefined}
                      onBlur={() => markFieldTouched("vehicle")}
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
                    <input
                      value={form.vehicle}
                      aria-label="Vehicle"
                      onBlur={() => markFieldTouched("vehicle")}
                      onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value }))}
                      disabled={modal === "edit"}
                      className={getTouchedFieldError("vehicle") ? "bookFieldInvalidInput" : ""}
                      required
                      aria-invalid={getTouchedFieldError("vehicle") ? "true" : undefined}
                      aria-describedby={getTouchedFieldError("vehicle") ? "admin-booking-vehicle-error" : undefined}
                    />
                  )}
                  {getTouchedFieldError("vehicle") ? <div id="admin-booking-vehicle-error" className="bookFieldError">{getTouchedFieldError("vehicle")}</div> : null}
                </label>
                <label className="bookField"><span>Plate Number</span><input value={form.plate || ""} aria-label="Plate Number" onBlur={() => markFieldTouched("plate")} onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", plate: e.target.value.toUpperCase() }))} disabled={modal === "edit" || carOptions.length > 0} className={getTouchedFieldError("plate") ? "bookFieldInvalidInput" : ""} required aria-invalid={getTouchedFieldError("plate") ? "true" : undefined} aria-describedby={getTouchedFieldError("plate") ? "admin-booking-plate-error" : undefined} />{getTouchedFieldError("plate") ? <div id="admin-booking-plate-error" className="bookFieldError">{getTouchedFieldError("plate")}</div> : null}</label>
                <label className="bookField"><span>Service</span><ModalSelect value={form.service} options={serviceOptions} placeholder="Select service" invalid={Boolean(getTouchedFieldError("service"))} ariaLabel="Service" ariaDescribedBy={getTouchedFieldError("service") ? "admin-booking-service-error" : undefined} onBlur={() => markFieldTouched("service")} onSelect={(option) => setForm((prev) => ({ ...prev, service: option, time: "", placeSlot: "" }))} disabled={modal === "edit"} />{getTouchedFieldError("service") ? <div id="admin-booking-service-error" className="bookFieldError">{getTouchedFieldError("service")}</div> : null}</label>
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
                          const discount = entry.discountType === "Fixed" ? `P ${Number(entry.discountValue || 0)} off` : `${Number(entry.discountValue || entry.discountPercent || 0)}% off`;
                          return `${entry.title} (${discount}${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})` === option;
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
                    invalid={Boolean(getTouchedFieldError("carSize"))}
                    ariaLabel="Car Size"
                    ariaDescribedBy={getTouchedFieldError("carSize") ? "admin-booking-car-size-error" : undefined}
                    onBlur={() => markFieldTouched("carSize")}
                    onSelect={(option) => setForm((prev) => ({ ...prev, carSize: option }))}
                  />
                  {getTouchedFieldError("carSize") ? <div id="admin-booking-car-size-error" className="bookFieldError">{getTouchedFieldError("carSize")}</div> : null}
                </label>
                {modal === "edit" && (
                  <label className="bookField">
                    <span>Preferred Detailer</span>
                    <input value={getPreferredDetailerDisplay(selectedBooking)} readOnly />
                  </label>
                )}
                <label className="bookField">
                  <span>Assigned Detailer</span>
                  <ModalSelect
                    value={form.assigned}
                    options={staffOptions}
                    placeholder="Select detailer"
                    invalid={Boolean(getTouchedFieldError("assigned"))}
                    ariaLabel="Assigned Detailer"
                    ariaDescribedBy={getTouchedFieldError("assigned") ? "admin-booking-assigned-error" : undefined}
                    onBlur={() => markFieldTouched("assigned")}
                    onSelect={(option) => setForm((prev) => ({ ...prev, assigned: option }))}
                    disabled={assignedStaffLocked}
                  />
                  {getTouchedFieldError("assigned") ? <div id="admin-booking-assigned-error" className="bookFieldError">{getTouchedFieldError("assigned")}</div> : null}
                  {isPendingBookingEdit && !String(form.assigned || "").trim() ? (
                    <div className="bookFieldError">Assigned staff is required before scheduling this booking.</div>
                  ) : null}
                </label>
                <label className="bookField">
                  <span>Date</span>
                  <input
                    type="date"
                    aria-label="Date"
                    min={todayKey}
                    value={form.date}
                    disabled={modal === "edit" && !canEditScheduleFields}
                    onBlur={() => markFieldTouched("date")}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value, placeSlot: "" }))}
                    className={getTouchedFieldError("date") ? "bookFieldInvalidInput" : ""}
                    required
                    aria-invalid={getTouchedFieldError("date") ? "true" : undefined}
                    aria-describedby={getTouchedFieldError("date") ? "admin-booking-date-error" : undefined}
                  />
                  {getTouchedFieldError("date") ? <div id="admin-booking-date-error" className="bookFieldError">{getTouchedFieldError("date")}</div> : null}
                </label>
                <label className="bookField">
                  <span>Time</span>
                  <select
                    value={form.time}
                    aria-label="Time"
                    disabled={modal === "edit" && !canEditScheduleFields}
                    onBlur={() => markFieldTouched("time")}
                    onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value, placeSlot: "" }))}
                    className={getTouchedFieldError("time") ? "bookFieldInvalidInput" : ""}
                    required={modal === "add" || isRescheduledStatus(form.status) || String(form.status || "").trim().toLowerCase() === "scheduled"}
                    aria-invalid={getTouchedFieldError("time") ? "true" : undefined}
                    aria-describedby={getTouchedFieldError("time") ? "admin-booking-time-error" : undefined}
                  >
                    <option value="">Select time</option>
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {getTouchedFieldError("time") ? <div id="admin-booking-time-error" className="bookFieldError">{getTouchedFieldError("time")}</div> : null}
                  {modal === "edit" && !isCancelledBookingLocked && isPendingBookingEdit && !downPaymentSatisfied ? (
                    <div className="bookSlotHint">Down payment must be verified as paid before this booking can be scheduled.</div>
                  ) : null}
                  {modal === "edit" && !isCancelledBookingLocked && isScheduledBookingEdit && !downPaymentSatisfied ? (
                    <div className="bookSlotHint">Down payment must be verified as paid before this booking can be rescheduled.</div>
                  ) : null}
                  {!form.time && modal === "edit" && !isRescheduledStatus(form.status) && !isPendingBookingEdit ? <div className="bookSlotHint">No time selected</div> : null}
                </label>
                <label className="bookField">
                  <span>Status</span>
                  {isCompletedBookingLocked || isCancelledBookingLocked ? (
                    <input value={form.status} readOnly />
                  ) : (
                    <ModalSelect
                      value={form.status}
                      options={STATUS_OPTIONS}
                      placeholder="Select status"
                      disabledOptions={disabledStatusOptions}
                      onSelect={(option) => setForm((prev) => ({ ...prev, status: option }))}
                    />
                  )}
                  {isPendingBookingEdit && schedulingValidationMessage ? (
                    <div className="bookSlotHint">{schedulingValidationMessage}</div>
                  ) : null}
                  {isCancelledBookingLocked ? (
                    <div className="bookSlotHint">Cancelled bookings are locked and cannot be edited.</div>
                  ) : null}
                  {modal === "edit" && !completionReadiness.canComplete ? (
                    <div className="bookSlotHint">{completionReadinessMessage}</div>
                  ) : null}
                </label>
                <label className="bookField">
                  <span>Place Slot</span>
                  <ModalSelect
                    value={form.placeSlot ? `Place Slot ${form.placeSlot}` : ""}
                    options={placeSlotOptions}
                    placeholder="Select place slot"
                    disabled={!form.date || !form.time || !canEditPlaceSlot || hasNoAvailableSlots}
                    disabledOptions={disabledPlaceSlotOptions}
                    invalid={Boolean(getTouchedFieldError("placeSlot"))}
                    ariaLabel="Place Slot"
                    ariaDescribedBy={getTouchedFieldError("placeSlot") ? "admin-booking-place-slot-error" : undefined}
                    onBlur={() => markFieldTouched("placeSlot")}
                    onSelect={(option) => {
                      const slot = Number(String(option).replace(/[^0-9]/g, ""));
                      setForm((prev) => ({ ...prev, placeSlot: String(slot || "") }));
                    }}
                  />
                  {getTouchedFieldError("placeSlot") ? <div id="admin-booking-place-slot-error" className="bookFieldError">{getTouchedFieldError("placeSlot")}</div> : null}
                  <div className={hasNoAvailableSlots ? "bookFieldError" : "bookSlotHint"}>
                    {!form.date || !form.time
                      ? "Select a date and time before choosing a place slot."
                      : hasNoAvailableSlots
                        ? "No place slots are available for the selected schedule."
                        : canEditPlaceSlot
                          ? `Choose an available place slot. Selected service duration: ${selectedServiceDuration} mins.`
                          : "Assign staff and verify the down payment before selecting a place slot."}
                  </div>
                </label>
              </div>
              {formError ? <div className="bookFieldError bookFormError">{formError}</div> : null}
              {modal === "edit" && selectedBooking && isCancelledStatus(selectedBooking.status) && !downPaymentSatisfied ? (
                <div className="bookFieldError bookFormError">Down payment must be verified as paid before this booking can be rescheduled.</div>
              ) : null}

              <div className="bookModalActions">
                {modal === "edit" && selectedBooking && canUseCancelledRescheduleWorkflow ? (
                  <button className="bookPrimaryBtn" type="button" onClick={openRescheduleModal}>Reschedule Booking</button>
                ) : null}
                {allowDelete && modal === "edit" && selectedBooking && (
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
                <button className="bookPrimaryBtn" type="submit" disabled={saveBookingDisabled}>{isCreatingBooking ? "Saving..." : "Save Booking"}</button>
              </div>
            </form>
            )}
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
	          if (!isCancelledStatus(selectedBooking.status)) {
	            setFormError("Only cancelled bookings can be deleted.");
	            setIsDeleteConfirmOpen(false);
	            return;
	          }
	          setSecurityConfirm({
              mode: "pin",
              actionKey: ACTION_KEYS.bookingDelete,
              title: "Delete Booking",
              message: "Enter the special PIN before deleting this cancelled booking.",
              onConfirm: async ({ secret }) => {
                try {
                  await deleteBooking(selectedBooking.id, { specialPin: secret });
                  setToast({ type: "success", message: "Booking deleted.", id: Date.now() });
                  setSecurityConfirm(null);
                  setIsDeleteConfirmOpen(false);
                  setPage(1);
                  closeModal();
                } catch (error) {
                  setToast({ type: "error", message: error.message || "Failed to delete booking.", id: Date.now() });
                  throw error;
                }
              },
            });
        }}
        onClose={() => setIsDeleteConfirmOpen(false)}
      />

      <FilterModal open={isFilterOpen} title="Filter Bookings" fields={[{ key: "service", label: "Service", type: "select", options: serviceOptions }, { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS }, { key: "assigned", label: "Assigned To", type: "select", options: staffOptions }]} values={filters} onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))} onClose={() => setIsFilterOpen(false)} onApply={() => { setPage(1); setIsFilterOpen(false); }} onReset={() => { setFilters({ service: "", status: "", assigned: "" }); setPage(1); }} />
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} actionKey={securityConfirm?.actionKey}
        onConfirm={securityConfirm?.onConfirm} />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
