import "../../styles/css/customer/customerServicesStyle.css";

import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import BookingDatePicker from "../../components/customer/BookingDatePicker";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { formatCurrency, getRewardPreview, getUsableCustomerRewards } from "../../utils/rewards";
import { CAR_SIZE_OPTIONS, formatPriceRangeLabel, getPriceForCarSize } from "../../utils/servicePricing";
import {
  buildPreferredDetailerPayload,
  formatTime12Hour,
  getServiceArrivalTimeOptions,
  getPreferredDetailerOptions,
} from "../../utils/bookingWorkflow";
import {
  CUSTOMER_BOOKING_REQUIRED_FIELDS,
  getCustomerBookingValidationErrors,
  getRequiredCarSizeForService,
  normalizeCustomerPlateInput,
} from "../../utils/customerBookingValidation";

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getServiceType(service) {
  const raw = String(service?.serviceType || "").trim().toLowerCase();
  if (raw === "package") return "Package";
  if (raw === "basic service") return "Basic Service";

  const combined = `${String(service?.name || "").trim()} ${String(service?.desc || "").trim()}`.toLowerCase();
  if (combined.includes("+") || combined.includes(" package") || combined.includes("bundle") || combined.includes("combo")) {
    return "Package";
  }

  return "Basic Service";
}

function requiresDownPayment(service) {
  return String(service?.name || service || "").trim().toLowerCase().replace(/\s+/g, " ") !== "car wash";
}

function getServiceDescription(service) {
  const description = String(service?.desc || "").trim();
  return description || "No description available.";
}

function createEmptyBookingForm(service = null) {
  return {
    date: "",
    time: "",
    selectedCar: "",
    vehicle: "",
    carSize: getRequiredCarSizeForService(service),
    plate: "",
    notes: "",
    promoId: "",
    rewardId: "",
    preferredDetailer: "",
    preferredDetailerName: "",
    preferredDetailerId: "",
  };
}

export default function CustomerServices() {
  const { services, promos, rewards, customerRewards, payments, users, currentUser, createBooking, loading } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ maxMins: "", maxPrice: "" });
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDetailsService, setSelectedDetailsService] = useState(null);
  const [bookingForm, setBookingForm] = useState(() => createEmptyBookingForm());
  const [bookingError, setBookingError] = useState("");
  const [bookingFieldErrors, setBookingFieldErrors] = useState({});
  const [bookingTouchedFields, setBookingTouchedFields] = useState({});
  const [showDownPaymentConfirm, setShowDownPaymentConfirm] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const todayKey = getTodayKey();
  const savedCars = useMemo(() => (Array.isArray(currentUser?.cars) ? currentUser.cars : []).filter((car) => car?.vehicle && car?.plate), [currentUser]);
  const carOptions = useMemo(() => savedCars.map((car) => `${car.vehicle} | ${String(car.plate).toUpperCase()}`), [savedCars]);
  const preferredDetailerOptions = useMemo(() => getPreferredDetailerOptions(users), [users]);
  const activePromos = useMemo(
    () => promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
    [promos]
  );
  const selectedPromo = useMemo(
    () => activePromos.find((promo) => promo.id === bookingForm.promoId) || null,
    [activePromos, bookingForm.promoId]
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
    () => usableRewards.find((reward) => reward.id === bookingForm.rewardId) || null,
    [bookingForm.rewardId, usableRewards]
  );
  const formatPromoOptionLabel = (promo) => {
    const perUserLimit = Number(promo?.maxUsagePerUser || 0);
    const discount = promo.discountType === "Fixed" ? `P ${Number(promo.discountValue || 0)} off` : `${Number(promo.discountValue || promo.discountPercent || 0)}% off`;
    return `${promo.title} (${discount}${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
  };

  const visibleServices = useMemo(
    () => services.filter((service) => service.name && service.enabled !== false),
    [services]
  );

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return visibleServices.filter((service) => {
      const matchesQuery =
        !q ||
        String(service.name || "").toLowerCase().includes(q) ||
        String(service.desc || "").toLowerCase().includes(q);
      const matchesMins = !filters.maxMins || Number(service.mins || 0) <= Number(filters.maxMins);
      const matchesPrice = !filters.maxPrice || Number(getPriceForCarSize(service, "") || 0) <= Number(filters.maxPrice);
      return matchesQuery && matchesMins && matchesPrice;
    });
  }, [visibleServices, query, filters]);

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const selectedServicePrice = useMemo(
    () => (selectedService ? getPriceForCarSize(selectedService, bookingForm.carSize) : 0),
    [selectedService, bookingForm.carSize]
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
  const timeOptions = useMemo(
    () => getServiceArrivalTimeOptions(selectedService || {}, bookingForm.time, formatTime12Hour),
    [selectedService, bookingForm.time]
  );
  const requiredCarSize = getRequiredCarSizeForService(selectedService);
  const bookingValidationErrors = useMemo(
    () => selectedService ? getCustomerBookingValidationErrors({
      form: { ...bookingForm, service: selectedService.name },
      services: visibleServices,
      minDate: todayKey,
      timeOptions,
    }) : {},
    [bookingForm, selectedService, timeOptions, todayKey, visibleServices]
  );

  const setBookingField = (field, value) => {
    setBookingFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setBookingForm((prev) => ({ ...prev, [field]: value }));
  };
  const markBookingFieldTouched = (field) => {
    setBookingTouchedFields((prev) => ({ ...prev, [field]: true }));
  };
  const getBookingFieldError = (field) => bookingFieldErrors[field] || (bookingTouchedFields[field] ? bookingValidationErrors[field] || "" : "");
  const touchAllBookingFields = () => {
    setBookingTouchedFields(Object.fromEntries(CUSTOMER_BOOKING_REQUIRED_FIELDS.map((field) => [field, true])));
  };

  const openBookingModal = (service) => {
    setSelectedService(service);
    setBookingForm(createEmptyBookingForm(service));
    setBookingFieldErrors({});
    setBookingTouchedFields({});
    setBookingError("");
    setShowDownPaymentConfirm(false);
  };

  const closeModal = () => {
    setSelectedService(null);
    setBookingForm(createEmptyBookingForm());
    setBookingError("");
    setBookingFieldErrors({});
    setBookingTouchedFields({});
    setShowDownPaymentConfirm(false);
    setIsSubmittingBooking(false);
  };

  const submitServiceBooking = async () => {
    if (!selectedService || isSubmittingBooking) return;
    if (Object.keys(bookingValidationErrors).length) {
      touchAllBookingFields();
      setShowDownPaymentConfirm(false);
      return;
    }
    try {
      setIsSubmittingBooking(true);
      const preferredDetailerPayload = buildPreferredDetailerPayload(bookingForm, preferredDetailerOptions);
      await createBooking({
        customer: currentUser?.name || "Customer",
        customerEmail: currentUser?.email || "",
        date: bookingForm.date,
        time: bookingForm.time,
        vehicle: String(bookingForm.vehicle || "").trim().replace(/\s+/g, " "),
        carSize: bookingForm.carSize,
        plate: String(bookingForm.plate || "").toUpperCase().replace(/[^A-Z0-9-]/g, ""),
        service: selectedService.name,
        promoId: bookingForm.promoId,
        rewardId: bookingForm.rewardId,
        originalAmount: Number(selectedServicePrice || 0),
        assigned: "",
        customerRequested: true,
        bookingSource: "customer",
        amount: Number(selectedServicePrice || 0),
        status: "Pending Confirmation",
        issueNote: bookingForm.notes,
        issueTypes: [],
        issueMarkers: [{ id: 1, x: 50, y: 50 }],
        ...preferredDetailerPayload,
      });
      closeModal();
    } catch (error) {
      const backendErrors = error.errors && typeof error.errors === "object" ? error.errors : {};
      const nextFieldErrors = {
        ...backendErrors,
        ...(error.field && !backendErrors[error.field] ? { [error.field]: error.message } : {}),
      };
      setBookingFieldErrors(nextFieldErrors);
      if (Object.keys(nextFieldErrors).length) {
        setBookingTouchedFields((prev) => ({
          ...prev,
          ...Object.fromEntries(Object.keys(nextFieldErrors).map((field) => [field, true])),
        }));
      }
      setBookingError(Object.keys(nextFieldErrors).length ? "" : error.message || "Failed to create booking.");
      setShowDownPaymentConfirm(false);
      setIsSubmittingBooking(false);
    }
  };

  const pageBasicServices = pageRows.filter((service) => getServiceType(service) === "Basic Service");
  const pagePackages = pageRows.filter((service) => getServiceType(service) === "Package");
  const getSectionDetails = (title) => {
    const isPackage = title.toLowerCase().includes("package");
    return {
      tone: isPackage ? "package" : "basic",
      label: isPackage ? "Package" : "Basic Service",
      subtitle: isPackage ? "Bundled premium protection and detailing packages." : "Quick and standard detailing services.",
    };
  };
  const getArrivalPreview = (service) => {
    const options = getServiceArrivalTimeOptions(service || {}, "", formatTime12Hour);
    if (!options.length) return "No time slots configured";
    return options.map((option) => option.label).join(", ");
  };
  const renderPriceBreakdown = (service) => (
    <div className="clSvcDetailsPriceGrid">
      {CAR_SIZE_OPTIONS.map((size) => (
        <div className="clSvcDetailsPriceItem" key={size}>
          <span>{size}</span>
          <strong>P {Number(getPriceForCarSize(service, size) || 0).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
  const renderServiceSection = (title, items) => {
    const section = getSectionDetails(title);
    return (
    items.length ? (
      <section className={`clSvcSectionBlock ${section.tone}`} key={title}>
        <div className="clSvcSectionHead">
          <div>
            <div className="clSvcSectionTitle">{title}</div>
            <div className="clSvcSectionSubtitle">{section.subtitle}</div>
          </div>
          <div className="clSvcSectionCount">{items.length}</div>
        </div>
        <div className="clSvcSectionScroll">
          <div className="clSvcGrid">
          {items.map((service) => (
            <div className={`clSvcCard ${section.tone}`} key={service.id}>
              <div className="clSvcCardTop">
                <span className={`clSvcTypeBadge ${section.tone}`}>{section.label}</span>
                {service.category ? <span className="clSvcCategoryBadge">{service.category}</span> : null}
              </div>
              <div className="clSvcTitle">{service.name}</div>
              <div className="clSvcSub">{getServiceDescription(service)}</div>
              <div className="clSvcInfoGrid">
                <div className="clSvcInfoItem">
                  <span>Price</span>
                  <strong>{formatPriceRangeLabel(service)}</strong>
                </div>
                <div className="clSvcInfoItem">
                  <span>Duration</span>
                  <strong>{service.mins || 0} mins</strong>
                </div>
              </div>
              <div className={`clSvcPaymentChip${requiresDownPayment(service) ? "" : " exempt"}`}>
                {requiresDownPayment(service) ? "Down payment required" : "No down payment required"}
              </div>
              <div className="clSvcCardActions">
                <button className="clSvcDetailsBtn" type="button" onClick={() => setSelectedDetailsService(service)}>
                  View Details
                </button>
                <button className="clSvcBookBtn" type="button" onClick={() => openBookingModal(service)}>
                  Book
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>
      </section>
    ) : null
    );
  };

  return (
    <div className="clSvcWrap">
      <div className="clSvcTop">
        <div className="clSvcSearchWrap">
          <div className="clSvcSearchBox">
            <img src={icoSearch} alt="" className="clSvcSearchIcon" />
            <input
              className="clSvcSearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Services..."
            />
          </div>
          <button className="clSvcFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="clSvcFilterIcon" />
          </button>
        </div>
      </div>

      <div className="clSvcBoard">
        {renderServiceSection("Basic Services", pageBasicServices)}
        {renderServiceSection("Packages", pagePackages)}
      </div>

      <div className="clSvcPager">
        <button type="button" disabled={safePage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          {"<"}
        </button>
        <div>{safePage}</div>
        <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
          {">"}
        </button>
      </div>

      {selectedDetailsService && (
        <div className="clSvcModalOverlay" onClick={() => setSelectedDetailsService(null)}>
          <div className="clSvcModalCard clSvcDetailsCard" role="dialog" aria-modal="true" aria-labelledby="clSvcDetailsTitle" onClick={(e) => e.stopPropagation()}>
            <button className="clSvcModalClose" type="button" onClick={() => setSelectedDetailsService(null)}>
              x
            </button>
            <div className="clSvcModalTitle" id="clSvcDetailsTitle">Service Details</div>
            <div className="clSvcDetailsHeader">
              <span className={`clSvcTypeBadge ${getServiceType(selectedDetailsService) === "Package" ? "package" : "basic"}`}>
                {getServiceType(selectedDetailsService)}
              </span>
              {selectedDetailsService.category ? <span className="clSvcCategoryBadge">{selectedDetailsService.category}</span> : null}
            </div>
            <div className="clSvcDetailsName">{selectedDetailsService.name}</div>
            <div className="clSvcDetailsDesc">{getServiceDescription(selectedDetailsService)}</div>
            <div className="clSvcDetailsGrid">
              <div className="clSvcDetailsBlock">
                <span>Price Range</span>
                <strong>{formatPriceRangeLabel(selectedDetailsService)}</strong>
              </div>
              <div className="clSvcDetailsBlock">
                <span>Duration</span>
                <strong>{selectedDetailsService.mins || 0} mins</strong>
              </div>
              <div className="clSvcDetailsBlock wide">
                <span>Allowed Arrival Times</span>
                <strong>{getArrivalPreview(selectedDetailsService)}</strong>
              </div>
            </div>
            {renderPriceBreakdown(selectedDetailsService)}
            <div className="clSvcModalActions">
              <button className="clSvcTextBtn" type="button" onClick={() => setSelectedDetailsService(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedService && (
        <div className="clSvcModalOverlay" onClick={closeModal}>
          <div className="clSvcModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="clSvcModalClose" type="button" onClick={closeModal}>
              x
            </button>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBookingError("");
                setShowDownPaymentConfirm(false);

                if (Object.keys(bookingValidationErrors).length) {
                  touchAllBookingFields();
                  return;
                }

                if (requiresDownPayment(selectedService)) {
                  setShowDownPaymentConfirm(true);
                  return;
                }

                await submitServiceBooking();
              }}
            >
              <div className="clSvcModalTitle">Book Service</div>

              <div className="clSvcSummary">
                <div className="clSvcSummaryTitle">{selectedService.name}</div>
                <div>{bookingForm.carSize ? `P ${Number(selectedServicePrice || 0).toLocaleString()}` : formatPriceRangeLabel(selectedService)}</div>
                <div>{selectedService.mins} mins estimated</div>
                {selectedPromo ? (
                  <div>
                    {selectedPromo.title} applies {selectedPromo.discountType === "Fixed" ? `P ${Number(selectedPromo.discountValue || 0)} off` : `${Number(selectedPromo.discountValue || selectedPromo.discountPercent || 0)}% off`}
                    {Number(selectedPromo.maxUsagePerUser || 0) > 0 ? ` with a max of ${Number(selectedPromo.maxUsagePerUser || 0)} use(s) per user` : ""}
                  </div>
                ) : null}
              </div>

              <div className={`clSvcDownPaymentNotice${requiresDownPayment(selectedService) ? "" : " exempt"}`}>
                {requiresDownPayment(selectedService)
                  ? "Down payment is required to secure your slot. The down payment is non-refundable and must be paid within 24 hours after booking. Bookings without submitted down-payment proof within 24 hours will be automatically cancelled."
                  : "This service does not require a down payment."}
              </div>

              {activePromos.length > 0 && (
                <label className="clSvcField">
                  <span>Promo</span>
                  <select
                    value={bookingForm.promoId}
                    onChange={(e) => setBookingForm((prev) => ({ ...prev, promoId: e.target.value }))}
                  >
                    <option value="">No promo</option>
                    {activePromos.map((promo) => (
                      <option key={promo.id} value={promo.id}>
                        {formatPromoOptionLabel(promo)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {usableRewards.length > 0 && (
                <label className="clSvcField">
                  <span>Claim Reward</span>
                  <select
                    value={bookingForm.rewardId}
                    onChange={(e) => setBookingForm((prev) => ({ ...prev, rewardId: e.target.value }))}
                  >
                    <option value="">No reward</option>
                    {usableRewards.map((reward) => (
                      <option key={reward.id} value={reward.id}>
                        {reward.rewardName} - {reward.rewardValue || reward.rewardType}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {selectedReward ? (
                <div className="clSvcRewardPreview">
                  <strong>{selectedReward.rewardName}</strong>
                  <span>{selectedReward.rewardType} • {selectedReward.rewardValue || "Reward benefit"}</span>
                  <span>Discount preview: -{formatCurrency(rewardPreview.discountAmount)}</span>
                  <span>Estimated total: {formatCurrency(rewardPreview.finalAmount)}</span>
                  <small>{selectedReward.expirationDate ? `Expires ${selectedReward.expirationDate}` : "No expiration date"}</small>
                </div>
              ) : null}

              <label className="clSvcField">
                <span>Preferred Date</span>
                <BookingDatePicker
                  min={todayKey}
                  value={bookingForm.date}
                  onChange={(value) => setBookingField("date", value)}
                  onBlur={() => markBookingFieldTouched("date")}
                  invalid={Boolean(getBookingFieldError("date"))}
                  describedBy={getBookingFieldError("date") ? "service-booking-date-error" : undefined}
                />
                {getBookingFieldError("date") ? <div id="service-booking-date-error" className="clSvcFieldError">{getBookingFieldError("date")}</div> : null}
              </label>

              <label className="clSvcField">
                <span>Preferred Time</span>
                <select
                  value={bookingForm.time}
                  aria-label="Preferred Time"
                  onBlur={() => markBookingFieldTouched("time")}
                  onChange={(e) => setBookingField("time", e.target.value)}
                  className={getBookingFieldError("time") ? "clSvcFieldInvalidInput" : ""}
                  aria-invalid={getBookingFieldError("time") ? "true" : undefined}
                  aria-describedby={getBookingFieldError("time") ? "service-booking-time-error" : undefined}
                >
                  <option value="">Select time</option>
                  {timeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="clSvcSlotHint">
                  {timeOptions.length
                    ? "Available time slots depend on the selected service."
                    : "No available time slots configured for this service."}
                </div>
                {getBookingFieldError("time") ? <div id="service-booking-time-error" className="clSvcFieldError">{getBookingFieldError("time")}</div> : null}
              </label>

              {carOptions.length > 0 && <label className="clSvcField"><span>Saved Car</span><select value={bookingForm.selectedCar} onChange={(e) => { const option = e.target.value; const selectedCar = savedCars.find((car) => `${car.vehicle} | ${String(car.plate).toUpperCase()}` === option); setBookingFieldErrors((prev) => { const next = { ...prev }; delete next.vehicle; delete next.carSize; delete next.plate; return next; }); setBookingForm((prev) => ({ ...prev, selectedCar: option, vehicle: selectedCar?.vehicle || prev.vehicle, carSize: requiredCarSize || String(selectedCar?.size || prev.carSize || ""), plate: String(selectedCar?.plate || prev.plate).toUpperCase() })); }}><option value="">Select saved car</option>{carOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}

              <label className="clSvcField">
                <span>Vehicle Model</span>
                <input
                  aria-label="Vehicle Model"
                  value={bookingForm.vehicle}
                  onBlur={() => markBookingFieldTouched("vehicle")}
                  onChange={(e) => { setBookingFieldErrors((prev) => { const next = { ...prev }; delete next.vehicle; return next; }); setBookingForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value })); }}
                  className={getBookingFieldError("vehicle") ? "clSvcFieldInvalidInput" : ""}
                  aria-invalid={getBookingFieldError("vehicle") ? "true" : undefined}
                  aria-describedby={getBookingFieldError("vehicle") ? "service-booking-vehicle-error" : undefined}
                />
                {getBookingFieldError("vehicle") ? <div id="service-booking-vehicle-error" className="clSvcFieldError">{getBookingFieldError("vehicle")}</div> : null}
              </label>

              <label className="clSvcField">
                <span>Plate Number</span>
                <input
                  aria-label="Plate Number"
                  value={bookingForm.plate}
                  onBlur={() => markBookingFieldTouched("plate")}
                  onChange={(e) => { setBookingFieldErrors((prev) => { const next = { ...prev }; delete next.plate; return next; }); setBookingForm((prev) => ({ ...prev, selectedCar: "", plate: normalizeCustomerPlateInput(e.target.value) })); }}
                  className={getBookingFieldError("plate") ? "clSvcFieldInvalidInput" : ""}
                  aria-invalid={getBookingFieldError("plate") ? "true" : undefined}
                  aria-describedby={getBookingFieldError("plate") ? "service-booking-plate-error" : undefined}
                />
                {getBookingFieldError("plate") ? <div id="service-booking-plate-error" className="clSvcFieldError">{getBookingFieldError("plate")}</div> : null}
              </label>

              <label className="clSvcField">
                <span>Car Size</span>
                <select
                  aria-label="Car Size"
                  value={bookingForm.carSize}
                  onBlur={() => markBookingFieldTouched("carSize")}
                  onChange={(e) => setBookingField("carSize", e.target.value)}
                  disabled={Boolean(requiredCarSize)}
                  className={getBookingFieldError("carSize") ? "clSvcFieldInvalidInput" : ""}
                  aria-invalid={getBookingFieldError("carSize") ? "true" : undefined}
                  aria-describedby={getBookingFieldError("carSize") ? "service-booking-car-size-error" : undefined}
                >
                  <option value="">Select car size</option>
                  {CAR_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {requiredCarSize ? <option value={requiredCarSize}>{requiredCarSize}</option> : null}
                </select>
                {getBookingFieldError("carSize") ? <div id="service-booking-car-size-error" className="clSvcFieldError">{getBookingFieldError("carSize")}</div> : null}
              </label>

              <label className="clSvcField">
                <span>Select Preferred Detailer</span>
                <select
                  value={bookingForm.preferredDetailerId}
                  onChange={(e) => {
                    const option = preferredDetailerOptions.find((entry) => entry.id === e.target.value);
                    setBookingForm((prev) => ({
                      ...prev,
                      preferredDetailerId: option?.id || "",
                      preferredDetailerName: option?.name || "",
                      preferredDetailer: option?.name || "",
                    }));
                  }}
                >
                  <option value="">No preference</option>
                  {preferredDetailerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="clSvcField">
                <span>Notes</span>
                <textarea
                  rows="4"
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional requests or reminders..."
                />
              </label>
              {bookingError ? <div className="clSvcFieldError">{bookingError}</div> : null}

              <div className="clSvcModalActions">
                <button className="clSvcTextBtn" type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button className="clSvcPrimaryBtn" type="submit" disabled={loading || isSubmittingBooking}>
                  {isSubmittingBooking ? "Submitting..." : "Confirm Booking"}
                </button>
              </div>
            </form>
            {showDownPaymentConfirm && (
              <div className="clSvcConfirmOverlay" onClick={() => setShowDownPaymentConfirm(false)}>
                <div className="clSvcConfirmCard" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                  <div className="clSvcModalTitle">Down Payment Policy</div>
                  <p>
                    Down payment is required to secure your slot. The down payment is non-refundable and must be paid within 24 hours after booking. Bookings without submitted down-payment proof within 24 hours will be automatically cancelled.
                  </p>
                  <div className="clSvcModalActions">
                    <button className="clSvcTextBtn" type="button" onClick={() => setShowDownPaymentConfirm(false)} disabled={isSubmittingBooking}>
                      Cancel
                    </button>
                    <button className="clSvcPrimaryBtn" type="button" onClick={submitServiceBooking} disabled={isSubmittingBooking}>
                      {isSubmittingBooking ? "Submitting..." : "I am willing to pay the DP"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Services"
        fields={[
          { key: "maxMins", label: "Max Duration (Mins)", type: "number", placeholder: "e.g. 240" },
          { key: "maxPrice", label: "Max Price", type: "number", placeholder: "e.g. 15000" },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ maxMins: "", maxPrice: "" });
          setPage(1);
        }}
      />
    </div>
  );
}
