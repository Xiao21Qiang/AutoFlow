import "../../styles/css/customer/customerBookingsStyle.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { formatCurrency, getRewardPreview, getUsableCustomerRewards } from "../../utils/rewards";
import { CAR_SIZE_OPTIONS, getPriceForCarSize } from "../../utils/servicePricing";
import {
  getServiceArrivalTimeOptions,
  getPreferredDetailerDisplay,
  getPreferredDetailerOptions,
} from "../../utils/bookingWorkflow";
import { CANONICAL_BOOKING_STATUSES, normalizeBookingStatus, toAppDateKey } from "../../utils/businessMetrics";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function createEmptyForm(defaultService = "") {
  return {
    date: "",
    time: "",
    selectedCar: "",
    vehicle: "",
    carSize: "",
    plate: "",
    service: defaultService,
    promoId: "",
    rewardId: "",
    preferredDetailer: "",
    preferredDetailerName: "",
    preferredDetailerId: "",
  };
}

function formatBookingTime(value) {
  const time = String(value || "").trim();
  return time || "No time selected";
}

function requiresDownPayment(service) {
  return String(service?.name || service || "").trim().toLowerCase().replace(/\s+/g, " ") !== "car wash";
}

const CUSTOMER_BOOKING_REQUIRED_MESSAGES = {
  vehicle: "Vehicle is required.",
  plate: "Plate number is required.",
  service: "Please select a service.",
  carSize: "Please select a car size.",
  date: "Booking date is required.",
  time: "Please select a preferred time.",
};

const CUSTOMER_BOOKING_REQUIRED_FIELDS = Object.keys(CUSTOMER_BOOKING_REQUIRED_MESSAGES);

function getCustomerBookingValidationErrors({ form, serviceOptions }) {
  const errors = {};
  const vehicle = String(form.vehicle || "").trim().replace(/\s+/g, " ");
  const rawPlate = String(form.plate || "").trim();
  const normalizedPlate = rawPlate.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!vehicle) errors.vehicle = CUSTOMER_BOOKING_REQUIRED_MESSAGES.vehicle;
  else if (vehicle.length < 2 || vehicle.length > 80) errors.vehicle = "Vehicle model must be 2 to 80 characters.";
  else if (!/^[A-Za-z0-9][A-Za-z0-9\s.'()/-]*$/.test(vehicle)) errors.vehicle = "Vehicle model contains unsupported characters.";
  if (!rawPlate) errors.plate = CUSTOMER_BOOKING_REQUIRED_MESSAGES.plate;
  else if (/[^A-Za-z0-9\s-]/.test(rawPlate)) errors.plate = "Plate number contains unsupported characters.";
  else if (normalizedPlate.length < 3 || normalizedPlate.length > 16) errors.plate = "Plate number must be 3 to 16 letters or numbers.";
  if (!serviceOptions.includes(String(form.service || "").trim())) errors.service = CUSTOMER_BOOKING_REQUIRED_MESSAGES.service;
  if (!CAR_SIZE_OPTIONS.includes(String(form.carSize || "").trim())) errors.carSize = CUSTOMER_BOOKING_REQUIRED_MESSAGES.carSize;
  if (!String(form.date || "").trim()) errors.date = CUSTOMER_BOOKING_REQUIRED_MESSAGES.date;
  if (!String(form.time || "").trim()) errors.time = CUSTOMER_BOOKING_REQUIRED_MESSAGES.time;
  return errors;
}

function normalizePlateInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9-\s]/g, "").slice(0, 20);
}

function getAssignedDetailerDisplay(booking = {}) {
  return String(booking.assigned || booking.assignedDetailerName || booking.assignedDetailerId || "").trim() || "-";
}

function getCustomerBookingSearchText(booking = {}) {
  return [
    booking.id,
    booking.service,
    booking.vehicle,
    booking.plate,
    formatDate(booking.date),
    booking.date,
    normalizeBookingStatus(booking.status, booking.status || ""),
    getPreferredDetailerDisplay(booking),
    getAssignedDetailerDisplay(booking),
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");
}

function ModalSelect({ value, options, placeholder, onSelect, invalid = false, ariaLabel, ariaDescribedBy, onBlur }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="clBookSelectWrap clBookModalSelect">
      <button
        className={`clBookModalSelectTrigger${invalid ? " clBookFieldInvalidInput" : ""}`}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onBlur={onBlur}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{value || placeholder}</span>
      </button>
      {open && (
        <div className="clBookModalSelectMenu">
          {options.map((option) => (
            <button
              key={option}
              className="clBookModalSelectItem"
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

export default function CustomerBookings({ initialAction = null, onActionHandled }) {
  const { bookings, services, promos, rewards, customerRewards, payments, users, currentUser, createBooking, loading } = useAdminData();
  const bookableServices = useMemo(
    () => services.filter((service) => service.name && service.enabled !== false),
    [services]
  );
  const serviceOptions = useMemo(
    () => (bookableServices.length ? bookableServices.map((service) => service.name) : []),
    [bookableServices]
  );
  const customerBookings = useMemo(
    () => (Array.isArray(bookings) ? bookings : []),
    [bookings]
  );
  const paymentByBookingId = useMemo(
    () => new Map(payments.map((payment) => [payment.bookingId, payment])),
    [payments]
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ service: "", status: "" });
  const [modal, setModal] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [showDownPaymentConfirm, setShowDownPaymentConfirm] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const bookingSubmitInFlightRef = useRef(false);
  const todayKey = toAppDateKey();
  const savedCars = useMemo(
    () => (Array.isArray(currentUser?.cars) ? currentUser.cars : []).filter((car) => car?.vehicle && car?.plate),
    [currentUser]
  );
  const carOptions = useMemo(
    () => savedCars.map((car) => `${car.vehicle} | ${String(car.plate).toUpperCase()}`),
    [savedCars]
  );
  const preferredDetailerOptions = useMemo(() => getPreferredDetailerOptions(users), [users]);
  const activePromos = useMemo(
    () => promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
    [promos]
  );
  const activeRewardPoolIds = useMemo(
    () => new Set((rewards || []).filter((reward) => reward.active !== false).map((reward) => reward.id)),
    [rewards]
  );
  const usableRewards = useMemo(
    () => getUsableCustomerRewards(customerRewards, currentUser, payments).filter((reward) => activeRewardPoolIds.has(reward.rewardId)),
    [activeRewardPoolIds, customerRewards, currentUser, payments]
  );
  const selectedReward = useMemo(
    () => usableRewards.find((reward) => reward.id === form.rewardId) || null,
    [form.rewardId, usableRewards]
  );
  const selectedService = useMemo(
    () => bookableServices.find((service) => service.name === form.service) || null,
    [bookableServices, form.service]
  );
  const selectedPromo = useMemo(
    () => activePromos.find((promo) => promo.id === form.promoId) || null,
    [activePromos, form.promoId]
  );
  const selectedServicePrice = useMemo(
    () => getPriceForCarSize(selectedService, form.carSize),
    [selectedService, form.carSize]
  );
  const timeOptions = useMemo(
    () => getServiceArrivalTimeOptions(selectedService || {}, form.time),
    [selectedService, form.time]
  );
  const promoAdjustedPrice = useMemo(() => {
    const base = Number(selectedServicePrice || 0);
    const value = Number(selectedPromo?.discountValue || selectedPromo?.discountPercent || 0);
    const discount = selectedPromo?.discountType === "Fixed" ? value : (base * value) / 100;
    return Math.max(0, base - discount);
  }, [selectedPromo, selectedServicePrice]);
  const rewardPreview = useMemo(
    () => getRewardPreview(selectedReward, promoAdjustedPrice),
    [promoAdjustedPrice, selectedReward]
  );
  const formatPromoOptionLabel = (promo) => {
    const perUserLimit = Number(promo?.maxUsagePerUser || 0);
    const discount = promo.discountType === "Fixed" ? `P ${Number(promo.discountValue || 0)} off` : `${Number(promo.discountValue || promo.discountPercent || 0)}% off`;
    return `${promo.title} (${discount}${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
  };

  useEffect(() => {
    setForm((prev) => {
      if (serviceOptions.includes(prev.service)) return prev;
      return { ...prev, service: "", time: "" };
    });
  }, [serviceOptions]);

  useEffect(() => {
    if (!form.selectedCar) return;
    if (carOptions.includes(form.selectedCar)) return;
    setForm((prev) => ({ ...prev, selectedCar: "" }));
  }, [carOptions, form.selectedCar]);

  useEffect(() => {
    if (initialAction !== "open-add-booking") return;
    setForm(createEmptyForm());
    setTouchedFields({});
    setFieldErrors({});
    setFormError("");
    setModal("add");
    onActionHandled?.();
  }, [initialAction, onActionHandled]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return customerBookings.filter((booking) => {
      const bookingStatus = normalizeBookingStatus(booking.status, booking.status || "");
      const matchesQuery = !q || getCustomerBookingSearchText(booking).includes(q);
      const matchesService = !filters.service || booking.service === filters.service;
      const matchesStatus = !filters.status || bookingStatus === filters.status;
      return matchesQuery && matchesService && matchesStatus;
    });
  }, [customerBookings, query, filters]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);
  const bookingValidationErrors = useMemo(
    () => modal === "add" ? getCustomerBookingValidationErrors({ form, serviceOptions }) : {},
    [form, modal, serviceOptions]
  );
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const selectedBookingDetails = useMemo(
    () => customerBookings.find((booking) => String(booking.id || "") === String(selectedBooking?.id || "")) || selectedBooking,
    [customerBookings, selectedBooking]
  );
  const isCustomerBookingFormValid = modal !== "add" || Object.keys(bookingValidationErrors).length === 0;
  const setFormField = (field, value) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setForm((prev) => ({ ...prev, [field]: value }));
  };
  const markFieldTouched = (field) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
  };
  const getTouchedFieldError = (field) => fieldErrors[field] || (touchedFields[field] ? bookingValidationErrors[field] || "" : "");
  const touchAllRequiredFields = () => {
    setTouchedFields(Object.fromEntries(CUSTOMER_BOOKING_REQUIRED_FIELDS.map((field) => [field, true])));
  };

  const closeModal = () => {
    setModal(null);
    setSelectedBooking(null);
    setForm(createEmptyForm());
    setTouchedFields({});
    setFormError("");
    setFieldErrors({});
    setShowDownPaymentConfirm(false);
    setIsSubmittingBooking(false);
    bookingSubmitInFlightRef.current = false;
  };

  const submitCustomerBooking = async () => {
    if (isSubmittingBooking || bookingSubmitInFlightRef.current) return;
    if (!isCustomerBookingFormValid) {
      touchAllRequiredFields();
      return;
    }
    try {
      bookingSubmitInFlightRef.current = true;
      setIsSubmittingBooking(true);
      await createBooking({
        date: form.date,
        time: form.time,
        vehicle: String(form.vehicle || "").trim().replace(/\s+/g, " "),
        carSize: form.carSize,
        plate: String(form.plate || "").toUpperCase().replace(/[^A-Z0-9-]/g, ""),
        service: form.service,
        promoId: form.promoId,
        rewardId: form.rewardId,
        customerRequested: true,
        bookingSource: "customer",
        preferredDetailerId: form.preferredDetailerId,
      });
      setPage(1);
      closeModal();
    } catch (error) {
      const backendErrors = error.errors && typeof error.errors === "object" ? error.errors : {};
      const nextFieldErrors = {
        ...backendErrors,
        ...(error.field && !backendErrors[error.field] ? { [error.field]: error.message } : {}),
      };
      setFieldErrors(nextFieldErrors);
      if (Object.keys(nextFieldErrors).length) {
        setTouchedFields((prev) => ({
          ...prev,
          ...Object.fromEntries(Object.keys(nextFieldErrors).map((field) => [field, true])),
        }));
      }
      setFormError(Object.keys(nextFieldErrors).length ? "" : error.message || "Failed to create booking.");
      setShowDownPaymentConfirm(false);
      setIsSubmittingBooking(false);
      bookingSubmitInFlightRef.current = false;
    }
  };

  return (
    <div className="clBookWrap">
      <div className="clBookTop">
        <div className="clBookSearchWrap">
          <div className="clBookSearchBox">
            <img src={icoSearch} alt="" className="clBookSearchIcon" />
            <input
              className="clBookSearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Bookings..."
            />
          </div>
          <button className="clBookFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="clBookFilterIcon" />
          </button>
        </div>
        <button
          className="clBookAddBtn"
          type="button"
          onClick={() => {
            setForm(createEmptyForm());
            setTouchedFields({});
            setFieldErrors({});
            setFormError("");
            setModal("add");
          }}
        >
          Add New Booking
        </button>
      </div>

      <div className="clBookBoard">
        <div className="clBookHead">
          <div>Booking ID</div>
          <div>Booking Date</div>
          <div>Vehicle Model</div>
          <div>Plate Number</div>
          <div>Service</div>
          <div>Status</div>
          <div>Preferred Detailer</div>
          <div>Assigned Detailer</div>
          <div>Details</div>
        </div>

        {pageRows.length === 0 ? (
          <div className="clBookEmptyRow">
            <div className="clBookEmptyTxt">No bookings found.</div>
          </div>
        ) : (
          pageRows.map((booking) => (
            <div className="clBookRow" key={booking.id}>
              <div>{booking.id}</div>
              <div>{formatDate(booking.date)}</div>
              <div>{booking.vehicle}</div>
              <div>{booking.plate}</div>
              <div>{booking.service}</div>
              <div>{normalizeBookingStatus(booking.status, booking.status || "-")}</div>
              <div>{getPreferredDetailerDisplay(booking)}</div>
              <div>{getAssignedDetailerDisplay(booking)}</div>
              <div>
                <button
                  className="clBookViewBtn"
                  type="button"
                  onClick={() => {
                    setSelectedBooking(booking);
                    setModal("details");
                  }}
                >
                  View
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="clBookPager">
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1}>
          {"<"}
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={pageNumber}
            className={pageNumber === safePage ? "active" : ""}
            type="button"
            onClick={() => setPage(pageNumber)}
            aria-current={pageNumber === safePage ? "page" : undefined}
          >
            {pageNumber}
          </button>
        ))}
        <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={safePage >= totalPages}>
          {">"}
        </button>
      </div>

      {modal && (
        <div className="clBookModalOverlay" onClick={closeModal}>
          <div
            className={`clBookModalCard ${modal === "details" ? "compact" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="clBookModalClose" type="button" onClick={closeModal}>
              x
            </button>

            {modal === "add" && serviceOptions.length > 0 && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setFormError("");
                  setShowDownPaymentConfirm(false);

                  if (!isCustomerBookingFormValid) {
                    touchAllRequiredFields();
                    return;
                  }
                  if (form.date && form.date < todayKey) {
                    setFieldErrors((prev) => ({ ...prev, date: "Please select today or a future date for your booking." }));
                    setTouchedFields((prev) => ({ ...prev, date: true }));
                    return;
                  }
                  if (requiresDownPayment(selectedService || form.service)) {
                    setShowDownPaymentConfirm(true);
                    return;
                  }

                  await submitCustomerBooking();
                }}
              >
                <div className="clBookModalTitle">New Booking</div>

                <div className={`clBookDownPaymentNotice${requiresDownPayment(selectedService || form.service) ? "" : " exempt"}`}>
                  {requiresDownPayment(selectedService || form.service)
                    ? "Down payment is required to secure your slot. The down payment is non-refundable and must be paid within 24 hours after booking. Bookings without submitted down-payment proof within 24 hours will be automatically cancelled."
                    : "This service does not require a down payment."}
                </div>

                <label className="clBookField">
                  <span>Preferred Date</span>
                  <input
                    type="date"
                    aria-label="Preferred Date"
                    min={todayKey}
                    value={form.date}
                    onBlur={() => markFieldTouched("date")}
                    onChange={(e) => setFormField("date", e.target.value)}
                    className={getTouchedFieldError("date") ? "clBookFieldInvalidInput" : ""}
                    required
                    aria-invalid={getTouchedFieldError("date") ? "true" : undefined}
                    aria-describedby={getTouchedFieldError("date") ? "customer-booking-date-error" : undefined}
                  />
                  {getTouchedFieldError("date") ? <div id="customer-booking-date-error" className="clBookFieldError">{getTouchedFieldError("date")}</div> : null}
                </label>

                {carOptions.length > 0 && (
                  <label className="clBookField">
                    <span>Saved Car</span>
                    <ModalSelect
                      value={form.selectedCar}
                      options={carOptions}
                      placeholder="Select saved car"
                      ariaLabel="Saved Car"
                      onSelect={(option) => {
                        const selectedCar = savedCars.find(
                          (car) => `${car.vehicle} | ${String(car.plate).toUpperCase()}` === option
                        );
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.selectedCar;
                          delete next.vehicle;
                          delete next.carSize;
                          delete next.plate;
                          return next;
                        });
                        setForm((prev) => ({
                          ...prev,
                          selectedCar: option,
                          vehicle: selectedCar?.vehicle || prev.vehicle,
                          carSize: String(selectedCar?.size || prev.carSize || ""),
                          plate: String(selectedCar?.plate || prev.plate).toUpperCase(),
                        }));
                      }}
                    />
                  </label>
                )}

                <label className="clBookField">
                  <span>Vehicle Model</span>
                  <input
                    value={form.vehicle}
                    aria-label="Vehicle Model"
                    onBlur={() => markFieldTouched("vehicle")}
                    onChange={(e) => {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.selectedCar;
                        delete next.vehicle;
                        return next;
                      });
                      setForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value }));
                    }}
                    className={getTouchedFieldError("vehicle") ? "clBookFieldInvalidInput" : ""}
                    required
                    aria-invalid={getTouchedFieldError("vehicle") ? "true" : undefined}
                    aria-describedby={getTouchedFieldError("vehicle") ? "customer-booking-vehicle-error" : undefined}
                  />
                  {getTouchedFieldError("vehicle") ? <div id="customer-booking-vehicle-error" className="clBookFieldError">{getTouchedFieldError("vehicle")}</div> : null}
                </label>

                <div className="clBookFieldGrid">
                  <label className="clBookField">
                    <span>Plate Number</span>
                    <input
                      value={form.plate}
                      aria-label="Plate Number"
                      onBlur={() => markFieldTouched("plate")}
                      onChange={(e) => {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.selectedCar;
                          delete next.plate;
                          return next;
                        });
                        setForm((prev) => ({ ...prev, selectedCar: "", plate: normalizePlateInput(e.target.value) }));
                      }}
                      className={getTouchedFieldError("plate") ? "clBookFieldInvalidInput" : ""}
                      required
                      aria-invalid={getTouchedFieldError("plate") ? "true" : undefined}
                      aria-describedby={getTouchedFieldError("plate") ? "customer-booking-plate-error" : undefined}
                    />
                    {getTouchedFieldError("plate") ? <div id="customer-booking-plate-error" className="clBookFieldError">{getTouchedFieldError("plate")}</div> : null}
                  </label>

                  <label className="clBookField">
                    <span>Car Size</span>
                    <ModalSelect
                      value={form.carSize}
                      options={CAR_SIZE_OPTIONS}
                      placeholder="Select car size"
                      invalid={Boolean(getTouchedFieldError("carSize"))}
                      ariaLabel="Car Size"
                      ariaDescribedBy={getTouchedFieldError("carSize") ? "customer-booking-car-size-error" : undefined}
                      onBlur={() => markFieldTouched("carSize")}
                      onSelect={(option) => setFormField("carSize", option)}
                    />
                    {getTouchedFieldError("carSize") ? <div id="customer-booking-car-size-error" className="clBookFieldError">{getTouchedFieldError("carSize")}</div> : null}
                  </label>

                  <label className="clBookField">
                    <span>Service</span>
                    <ModalSelect
                      value={form.service}
                      options={serviceOptions}
                      placeholder="Select service"
                      invalid={Boolean(getTouchedFieldError("service"))}
                      ariaLabel="Service"
                      ariaDescribedBy={getTouchedFieldError("service") ? "customer-booking-service-error" : undefined}
                      onBlur={() => markFieldTouched("service")}
                      onSelect={(option) => {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.service;
                          delete next.time;
                          return next;
                        });
                        setForm((prev) => ({ ...prev, service: option, time: "" }));
                      }}
                    />
                    {getTouchedFieldError("service") ? <div id="customer-booking-service-error" className="clBookFieldError">{getTouchedFieldError("service")}</div> : null}
                  </label>
                  <label className="clBookField">
                    <span>Preferred Time</span>
                    <select
                      value={form.time}
                      aria-label="Preferred Time"
                      onBlur={() => markFieldTouched("time")}
                      onChange={(e) => setFormField("time", e.target.value)}
                      disabled={!selectedService}
                      className={getTouchedFieldError("time") ? "clBookFieldInvalidInput" : ""}
                      required
                      aria-invalid={getTouchedFieldError("time") ? "true" : undefined}
                      aria-describedby={getTouchedFieldError("time") ? "customer-booking-time-error" : undefined}
                    >
                      <option value="">{selectedService ? "Select time" : "Select a service first"}</option>
                      {timeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="clBookSlotHint">
                      {selectedService
                        ? timeOptions.length
                          ? "Available time slots depend on the selected service."
                          : "No available time slots configured for this service."
                        : "Select a service first."}
                    </div>
                    {getTouchedFieldError("time") ? <div id="customer-booking-time-error" className="clBookFieldError">{getTouchedFieldError("time")}</div> : null}
                  </label>
                  <label className="clBookField">
                    <span>Select Preferred Detailer</span>
                    <select
                      value={form.preferredDetailerId}
                      onChange={(e) => {
                        const option = preferredDetailerOptions.find((entry) => entry.id === e.target.value);
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.preferredDetailerId;
                          return next;
                        });
                        setForm((prev) => ({
                          ...prev,
                          preferredDetailerId: option?.id || "",
                          preferredDetailerName: option?.name || "",
                          preferredDetailer: option?.name || "",
                        }));
                      }}
                      className={getTouchedFieldError("preferredDetailerId") ? "clBookFieldInvalidInput" : ""}
                      aria-invalid={getTouchedFieldError("preferredDetailerId") ? "true" : undefined}
                      aria-describedby={getTouchedFieldError("preferredDetailerId") ? "customer-booking-preferred-detailer-error" : undefined}
                    >
                      <option value="">No preference</option>
                      {preferredDetailerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {getTouchedFieldError("preferredDetailerId") ? <div id="customer-booking-preferred-detailer-error" className="clBookFieldError">{getTouchedFieldError("preferredDetailerId")}</div> : null}
                  </label>
                  {activePromos.length > 0 && (
                    <label className="clBookField">
                      <span>Promo</span>
                      <select
                        value={form.promoId}
                        onChange={(e) => setFormField("promoId", e.target.value)}
                        className={getTouchedFieldError("promoId") ? "clBookFieldInvalidInput" : ""}
                        aria-invalid={getTouchedFieldError("promoId") ? "true" : undefined}
                        aria-describedby={getTouchedFieldError("promoId") ? "customer-booking-promo-error" : undefined}
                      >
                        <option value="">No promo</option>
                        {activePromos.map((promo) => (
                          <option key={promo.id} value={promo.id}>
                            {formatPromoOptionLabel(promo)}
                          </option>
                        ))}
                      </select>
                      {getTouchedFieldError("promoId") ? <div id="customer-booking-promo-error" className="clBookFieldError">{getTouchedFieldError("promoId")}</div> : null}
                    </label>
                  )}
                  {usableRewards.length > 0 && (
                    <label className="clBookField">
                      <span>Claim Reward</span>
                      <select
                        value={form.rewardId}
                        onChange={(e) => setFormField("rewardId", e.target.value)}
                        className={getTouchedFieldError("rewardId") ? "clBookFieldInvalidInput" : ""}
                        aria-invalid={getTouchedFieldError("rewardId") ? "true" : undefined}
                        aria-describedby={getTouchedFieldError("rewardId") ? "customer-booking-reward-error" : undefined}
                      >
                        <option value="">No reward</option>
                        {usableRewards.map((reward) => (
                          <option key={reward.id} value={reward.id}>
                            {reward.rewardName} - {reward.rewardValue || reward.rewardType}
                          </option>
                        ))}
                      </select>
                      {getTouchedFieldError("rewardId") ? <div id="customer-booking-reward-error" className="clBookFieldError">{getTouchedFieldError("rewardId")}</div> : null}
                    </label>
                  )}
                </div>
                {selectedReward ? (
                  <div className="clBookRewardPreview">
                    <strong>{selectedReward.rewardName}</strong>
                    <span>{selectedReward.rewardType} • {selectedReward.rewardValue || "Reward benefit"}</span>
                    <span>{selectedReward.rewardValue ? `Discount preview: -${formatCurrency(rewardPreview.discountAmount)}` : selectedReward.rewardType}</span>
                    <span>Estimated total: {formatCurrency(rewardPreview.finalAmount)}</span>
                    <small>{selectedReward.expirationDate ? `Expires ${selectedReward.expirationDate}` : "No expiration date"}</small>
                  </div>
                ) : null}
                {formError ? <div className="clBookFieldError">{formError}</div> : null}

                <div className="clBookModalActions">
                  <button className="clBookTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="clBookPrimaryBtn" type="submit" disabled={loading || isSubmittingBooking || !serviceOptions.length || !isCustomerBookingFormValid}>
                    {isSubmittingBooking ? "Submitting..." : "Save Booking"}
                  </button>
                </div>
              </form>
            )}

            {modal === "add" && showDownPaymentConfirm && (
              <div className="clBookConfirmOverlay" onClick={() => setShowDownPaymentConfirm(false)}>
                <div className="clBookConfirmCard" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="clBookModalTitle">Down Payment Policy</div>
                  <p>
                    Down payment is required to secure your slot. The down payment is non-refundable and must be paid within 24 hours after booking. Bookings without submitted down-payment proof within 24 hours will be automatically cancelled.
                  </p>
                  <div className="clBookModalActions">
                    <button className="clBookTextBtn" type="button" onClick={() => setShowDownPaymentConfirm(false)} disabled={isSubmittingBooking}>
                      Cancel
                    </button>
                    <button className="clBookPrimaryBtn" type="button" onClick={submitCustomerBooking} disabled={isSubmittingBooking}>
                      {isSubmittingBooking ? "Submitting..." : "I am willing to pay the DP"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {modal === "add" && !serviceOptions.length && (
              <div className="clBookDetailList">
                <div><strong>No services available.</strong></div>
                <div>There are currently no active services to book.</div>
                <div className="clBookModalActions">
                  <button className="clBookPrimaryBtn" type="button" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {modal === "details" && selectedBookingDetails && (() => {
              const detailBooking = selectedBookingDetails;
              const linkedPayment = paymentByBookingId.get(detailBooking.id);
              const placeSlot = Number(detailBooking.placeSlot || 0);
              const note = String(detailBooking.notes || detailBooking.specialInstructions || detailBooking.customerNotes || "").trim();
              const cancellationInfo = String(detailBooking.cancellationReason || detailBooking.cancelReason || "").trim();
              return (
                <div>
                  <div className="clBookModalTitle">Booking Details</div>
                  <div className="clBookDetailList">
                    <div><strong>Booking ID:</strong> {detailBooking.id}</div>
                    <div><strong>Service:</strong> {detailBooking.service}</div>
                    <div><strong>Vehicle:</strong> {detailBooking.vehicle}</div>
                    <div><strong>Plate Number:</strong> {detailBooking.plate}</div>
                    <div><strong>Car Size:</strong> {detailBooking.carSize || "-"}</div>
                    <div><strong>Date:</strong> {formatDate(detailBooking.date)}</div>
                    <div><strong>Time:</strong> {formatBookingTime(detailBooking.time)}</div>
                    <div><strong>Booking Status:</strong> {normalizeBookingStatus(detailBooking.status, detailBooking.status || "-")}</div>
                    <div><strong>Preferred Detailer:</strong> {getPreferredDetailerDisplay(detailBooking)}</div>
                    <div><strong>Assigned Detailer:</strong> {getAssignedDetailerDisplay(detailBooking)}</div>
                    {placeSlot > 0 ? <div><strong>Place Slot:</strong> {placeSlot}</div> : null}
                    {detailBooking.promoTitle || detailBooking.promoCode ? (
                      <div><strong>Promo:</strong> {detailBooking.promoTitle || detailBooking.promoCode}</div>
                    ) : null}
                    {detailBooking.rewardName ? <div><strong>Reward:</strong> {detailBooking.rewardName}</div> : null}
                    {note ? <div><strong>Special Instructions:</strong> {note}</div> : null}
                    {linkedPayment?.downPaymentDueAt && linkedPayment?.downPaymentRequired === true ? (
                      <div><strong>Down Payment Due:</strong> {formatDateTime(linkedPayment.downPaymentDueAt)}</div>
                    ) : null}
                    {linkedPayment ? (
                      <div><strong>Payment:</strong> Down payment {linkedPayment.downPaymentStatus || "-"}; final payment {linkedPayment.finalPaymentStatus || linkedPayment.status || "-"}</div>
                    ) : null}
                    {normalizeBookingStatus(detailBooking.status, "") === "Cancelled" && cancellationInfo ? (
                      <div><strong>Cancellation:</strong> {cancellationInfo}</div>
                    ) : null}
                  </div>
                  <div className="clBookModalActions">
                    <button className="clBookPrimaryBtn" type="button" onClick={closeModal}>
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Bookings"
        fields={[
          { key: "service", label: "Service", type: "select", options: [...new Set(customerBookings.map((booking) => booking.service).filter(Boolean))] },
          { key: "status", label: "Booking Status", type: "select", options: CANONICAL_BOOKING_STATUSES },
        ]}
        values={filters}
        onChange={(key, value) => {
          setFilters((prev) => ({ ...prev, [key]: value }));
          setPage(1);
        }}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ service: "", status: "" });
          setPage(1);
        }}
      />
    </div>
  );
}
