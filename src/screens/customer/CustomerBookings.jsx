import "../../styles/css/customer/customerBookingsStyle.css";

import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { formatCurrency, getRewardPreview, getUsableCustomerRewards } from "../../utils/rewards";
import { CAR_SIZE_OPTIONS, getPriceForCarSize } from "../../utils/servicePricing";
import {
  buildPreferredDetailerPayload,
  getPreferredDetailerDisplay,
  getPreferredDetailerOptions,
} from "../../utils/bookingWorkflow";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function createEmptyForm(defaultService = "Graphene Coating") {
  return {
    date: "",
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

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBookingTime(value) {
  const time = String(value || "").trim();
  return time || "Pending Assignment";
}

function ModalSelect({ value, options, placeholder, onSelect }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="clBookSelectWrap clBookModalSelect">
      <button
        className="clBookModalSelectTrigger"
        type="button"
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
  const { bookings, services, promos, rewards, customerRewards, users, currentUser, createBooking, loading } = useAdminData();
  const bookableServices = useMemo(
    () => services.filter((service) => service.name && service.enabled !== false),
    [services]
  );
  const serviceOptions = useMemo(
    () => (bookableServices.length ? bookableServices.map((service) => service.name) : []),
    [bookableServices]
  );
  const customerName = String(currentUser?.name || "").trim().toLowerCase();
  const customerEmail = String(currentUser?.email || "").trim().toLowerCase();
  const customerBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const bookingEmail = String(booking.customerEmail || "").trim().toLowerCase();
        const bookingName = String(booking.customer || "").trim().toLowerCase();
        if (customerEmail && bookingEmail) {
          return bookingEmail === customerEmail;
        }
        return bookingName === customerName;
      }),
    [bookings, customerEmail, customerName]
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ service: "", assignedTo: "" });
  const [modal, setModal] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [form, setForm] = useState(createEmptyForm(serviceOptions[0]));
  const [formError, setFormError] = useState("");
  const todayKey = getTodayKey();
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
    () => getUsableCustomerRewards(customerRewards, currentUser).filter((reward) => activeRewardPoolIds.has(reward.rewardId)),
    [activeRewardPoolIds, customerRewards, currentUser]
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
  const promoAdjustedPrice = useMemo(() => {
    const discountPercent = Number(selectedPromo?.discountPercent || 0);
    return Math.max(0, Number(selectedServicePrice || 0) - ((Number(selectedServicePrice || 0) * discountPercent) / 100));
  }, [selectedPromo, selectedServicePrice]);
  const rewardPreview = useMemo(
    () => getRewardPreview(selectedReward, promoAdjustedPrice),
    [promoAdjustedPrice, selectedReward]
  );
  const formatPromoOptionLabel = (promo) => {
    const perUserLimit = Number(promo?.maxUsagePerUser || 0);
    return `${promo.title} (${Number(promo.discountPercent || 0)}% off${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
  };

  useEffect(() => {
    setForm((prev) => {
      if (serviceOptions.includes(prev.service)) return prev;
      return { ...prev, service: serviceOptions[0] || "" };
    });
  }, [serviceOptions]);

  useEffect(() => {
    if (!form.selectedCar) return;
    if (carOptions.includes(form.selectedCar)) return;
    setForm((prev) => ({ ...prev, selectedCar: "" }));
  }, [carOptions, form.selectedCar]);

  useEffect(() => {
    if (initialAction !== "open-add-booking") return;
    setForm(createEmptyForm(serviceOptions[0]));
    setModal("add");
    onActionHandled?.();
  }, [initialAction, onActionHandled, serviceOptions]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return customerBookings.filter((booking) => {
      const assignedTo = booking.assigned || "-";
      const matchesQuery =
        !q ||
        String(booking.id || "").toLowerCase().includes(q) ||
        String(booking.customer || "").toLowerCase().includes(q) ||
        String(booking.vehicle || "").toLowerCase().includes(q) ||
        String(booking.plate || "").toLowerCase().includes(q) ||
        String(booking.service || "").toLowerCase().includes(q) ||
        String(assignedTo).toLowerCase().includes(q) ||
        formatDate(booking.date).toLowerCase().includes(q);
      const matchesService = !filters.service || booking.service === filters.service;
      const matchesAssigned = !filters.assignedTo || assignedTo === filters.assignedTo;
      return matchesQuery && matchesService && matchesAssigned;
    });
  }, [customerBookings, query, filters]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const closeModal = () => {
    setModal(null);
    setSelectedBooking(null);
    setForm(createEmptyForm(serviceOptions[0]));
    setFormError("");
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
            setForm(createEmptyForm(serviceOptions[0]));
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
          <div>Customer</div>
          <div>Vehicle Model</div>
          <div>Plate Number</div>
          <div>Service</div>
          <div>Assigned To</div>
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
              <div>{booking.customer}</div>
              <div>{booking.vehicle}</div>
              <div>{booking.plate}</div>
              <div>{booking.service}</div>
              <div>{booking.assigned || "-"}</div>
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
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          {"<"}
        </button>
        <div>{safePage}</div>
        <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
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

                  if (form.date && form.date < todayKey) {
                    setFormError("Please select today or a future date for your booking.");
                    return;
                  }

                  try {
                    const matchedService = bookableServices.find((service) => service.name === form.service);
                    const resolvedPrice = getPriceForCarSize(matchedService, form.carSize);
                    const preferredDetailerPayload = buildPreferredDetailerPayload(form, preferredDetailerOptions);
                    await createBooking({
                      customer: currentUser?.name || "Customer",
                      customerEmail: currentUser?.email || "",
                      date: form.date,
                      vehicle: form.vehicle,
                      carSize: form.carSize,
                      plate: form.plate,
                      service: form.service,
                      promoId: form.promoId,
                      rewardId: form.rewardId,
                      originalAmount: Number(resolvedPrice || 0),
                      assigned: "",
                      time: null,
                      customerRequested: true,
                      bookingSource: "customer",
                      amount: Number(resolvedPrice || 0),
                      status: "Pending Confirmation",
                      issueNote: "",
                      issueTypes: [],
                      issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "" }],
                      ...preferredDetailerPayload,
                    });
                    setPage(1);
                    closeModal();
                  } catch (error) {
                    setFormError(error.message || "Failed to create booking.");
                  }
                }}
              >
                <div className="clBookModalTitle">New Booking</div>

                <label className="clBookField">
                  <span>Preferred Date</span>
                  <input
                    type="date"
                    min={todayKey}
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </label>

                {carOptions.length > 0 && (
                  <label className="clBookField">
                    <span>Saved Car</span>
                    <ModalSelect
                      value={form.selectedCar}
                      options={carOptions}
                      placeholder="Select saved car"
                      onSelect={(option) => {
                        const selectedCar = savedCars.find(
                          (car) => `${car.vehicle} | ${String(car.plate).toUpperCase()}` === option
                        );
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
                    onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value }))}
                    required
                  />
                </label>

                <div className="clBookFieldGrid">
                  <label className="clBookField">
                    <span>Plate Number</span>
                    <input
                      value={form.plate}
                      onChange={(e) => setForm((prev) => ({ ...prev, selectedCar: "", plate: e.target.value.toUpperCase() }))}
                      required
                    />
                  </label>

                  <label className="clBookField">
                    <span>Car Size</span>
                    <ModalSelect
                      value={form.carSize}
                      options={CAR_SIZE_OPTIONS}
                      placeholder="Select car size"
                      onSelect={(option) => setForm((prev) => ({ ...prev, carSize: option }))}
                    />
                  </label>

                  <label className="clBookField">
                    <span>Service</span>
                    <ModalSelect
                      value={form.service}
                      options={serviceOptions}
                      placeholder="Select service"
                      onSelect={(option) => setForm((prev) => ({ ...prev, service: option }))}
                    />
                  </label>
                  <label className="clBookField">
                    <span>Select Preferred Detailer</span>
                    <select
                      value={form.preferredDetailerId}
                      onChange={(e) => {
                        const option = preferredDetailerOptions.find((entry) => entry.id === e.target.value);
                        setForm((prev) => ({
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
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {activePromos.length > 0 && (
                    <label className="clBookField">
                      <span>Promo</span>
                      <select
                        value={form.promoId}
                        onChange={(e) => setForm((prev) => ({ ...prev, promoId: e.target.value }))}
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
                    <label className="clBookField">
                      <span>Claim Reward</span>
                      <select
                        value={form.rewardId}
                        onChange={(e) => setForm((prev) => ({ ...prev, rewardId: e.target.value }))}
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
                  <button className="clBookPrimaryBtn" type="submit" disabled={loading || !serviceOptions.length}>
                    Submit Booking
                  </button>
                </div>
              </form>
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

            {modal === "details" && selectedBooking && (
              <div>
                <div className="clBookModalTitle">Booking Details</div>
                <div className="clBookDetailList">
                  <div><strong>ID:</strong> {selectedBooking.id}</div>
                  <div><strong>Date:</strong> {formatDate(selectedBooking.date)}</div>
                  <div><strong>Time:</strong> {formatBookingTime(selectedBooking.time)}</div>
                  <div><strong>Vehicle:</strong> {selectedBooking.vehicle}</div>
                  <div><strong>Car Size:</strong> {selectedBooking.carSize || "-"}</div>
                  <div><strong>Plate:</strong> {selectedBooking.plate}</div>
                  <div><strong>Service:</strong> {selectedBooking.service}</div>
                  <div><strong>Preferred Detailer:</strong> {getPreferredDetailerDisplay(selectedBooking)}</div>
                  <div><strong>Assigned To:</strong> {selectedBooking.assigned || "-"}</div>
                  <div><strong>Status:</strong> {selectedBooking.status}</div>
                </div>
                <div className="clBookModalActions">
                  <button className="clBookPrimaryBtn" type="button" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Bookings"
        fields={[
          { key: "service", label: "Service", type: "select", options: [...new Set(customerBookings.map((booking) => booking.service).filter(Boolean))] },
          { key: "assignedTo", label: "Assigned To", type: "select", options: [...new Set(customerBookings.map((booking) => booking.assigned).filter(Boolean))] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ service: "", assignedTo: "" });
          setPage(1);
        }}
      />
    </div>
  );
}
