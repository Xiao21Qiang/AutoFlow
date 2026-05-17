import "../../styles/css/customer/customerServicesStyle.css";

import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { formatCurrency, getRewardPreview, getUsableCustomerRewards } from "../../utils/rewards";
import { CAR_SIZE_OPTIONS, formatPriceRangeLabel, getPriceForCarSize } from "../../utils/servicePricing";
import {
  buildPreferredDetailerPayload,
  getPreferredDetailerOptions,
} from "../../utils/bookingWorkflow";

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

export default function CustomerServices() {
  const { services, promos, rewards, customerRewards, payments, users, currentUser, createBooking, loading } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ maxMins: "", maxPrice: "" });
  const [selectedService, setSelectedService] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    date: "",
    selectedCar: "",
    vehicle: "",
    carSize: "",
    plate: "",
    notes: "",
    promoId: "",
    rewardId: "",
    preferredDetailer: "",
    preferredDetailerName: "",
    preferredDetailerId: "",
  });
  const [bookingError, setBookingError] = useState("");
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
    return `${promo.title} (${Number(promo.discountPercent || 0)}% off${perUserLimit > 0 ? `, max ${perUserLimit}/user` : ""})`;
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
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const selectedServicePrice = useMemo(
    () => (selectedService ? getPriceForCarSize(selectedService, bookingForm.carSize) : 0),
    [selectedService, bookingForm.carSize]
  );
  const promoAdjustedPrice = useMemo(() => {
    const discountPercent = Number(selectedPromo?.discountPercent || 0);
    return Math.max(0, Number(selectedServicePrice || 0) - ((Number(selectedServicePrice || 0) * discountPercent) / 100));
  }, [selectedPromo, selectedServicePrice]);
  const rewardPreview = useMemo(
    () => getRewardPreview(selectedReward, promoAdjustedPrice),
    [promoAdjustedPrice, selectedReward]
  );

  const closeModal = () => {
    setSelectedService(null);
    setBookingForm({
      date: "",
      selectedCar: "",
      vehicle: "",
      carSize: "",
      plate: "",
      notes: "",
      promoId: "",
      rewardId: "",
      preferredDetailer: "",
      preferredDetailerName: "",
      preferredDetailerId: "",
    });
    setBookingError("");
  };

  const pageBasicServices = pageRows.filter((service) => getServiceType(service) === "Basic Service");
  const pagePackages = pageRows.filter((service) => getServiceType(service) === "Package");
  const renderServiceSection = (title, items) => (
    items.length ? (
      <section className="clSvcSectionBlock" key={title}>
        <div className="clSvcSectionHead">
          <div className="clSvcSectionTitle">{title}</div>
          <div className="clSvcSectionCount">{items.length}</div>
        </div>
        <div className="clSvcGrid">
          {items.map((service) => (
            <div className="clSvcCard" key={service.id}>
              <div className="clSvcTitle">{service.name}</div>
              <div className="clSvcSub">{service.desc}</div>
              <div className="clSvcMeta">
                Price: {formatPriceRangeLabel(service)} • Est: {service.mins} mins
              </div>
              <button className="clSvcBookBtn" type="button" onClick={() => setSelectedService(service)}>
                Book
              </button>
            </div>
          ))}
        </div>
      </section>
    ) : null
  );

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
        <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          {"<"}
        </button>
        <div>{safePage}</div>
        <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
          {">"}
        </button>
      </div>

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

                if (bookingForm.date && bookingForm.date < todayKey) {
                  setBookingError("Please select today or a future date for this booking.");
                  return;
                }

                try {
                  const preferredDetailerPayload = buildPreferredDetailerPayload(bookingForm, preferredDetailerOptions);
                  await createBooking({
                    customer: currentUser?.name || "Customer",
                    customerEmail: currentUser?.email || "",
                    date: bookingForm.date,
                    vehicle: bookingForm.vehicle,
                    carSize: bookingForm.carSize,
                    plate: bookingForm.plate,
                    service: selectedService.name,
                    promoId: bookingForm.promoId,
                    rewardId: bookingForm.rewardId,
                    originalAmount: Number(selectedServicePrice || 0),
                    assigned: "",
                    time: null,
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
                  setBookingError(error.message || "Failed to create booking.");
                }
              }}
            >
              <div className="clSvcModalTitle">Book Service</div>

              <div className="clSvcSummary">
                <div className="clSvcSummaryTitle">{selectedService.name}</div>
                <div>{bookingForm.carSize ? `P ${Number(selectedServicePrice || 0).toLocaleString()}` : formatPriceRangeLabel(selectedService)}</div>
                <div>{selectedService.mins} mins estimated</div>
                {selectedPromo ? (
                  <div>
                    {selectedPromo.title} applies {Number(selectedPromo.discountPercent || 0)}% off
                    {Number(selectedPromo.maxUsagePerUser || 0) > 0 ? ` with a max of ${Number(selectedPromo.maxUsagePerUser || 0)} use(s) per user` : ""}
                  </div>
                ) : null}
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
                <input
                  type="date"
                  min={todayKey}
                  value={bookingForm.date}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </label>

              {carOptions.length > 0 && <label className="clSvcField"><span>Saved Car</span><select value={bookingForm.selectedCar} onChange={(e) => { const option = e.target.value; const selectedCar = savedCars.find((car) => `${car.vehicle} | ${String(car.plate).toUpperCase()}` === option); setBookingForm((prev) => ({ ...prev, selectedCar: option, vehicle: selectedCar?.vehicle || prev.vehicle, carSize: String(selectedCar?.size || prev.carSize || ""), plate: String(selectedCar?.plate || prev.plate).toUpperCase() })); }}><option value="">Select saved car</option>{carOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}

              <label className="clSvcField">
                <span>Vehicle Model</span>
                <input
                  value={bookingForm.vehicle}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, selectedCar: "", vehicle: e.target.value }))}
                  required
                />
              </label>

              <label className="clSvcField">
                <span>Plate Number</span>
                <input
                  value={bookingForm.plate}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, selectedCar: "", plate: e.target.value.toUpperCase() }))}
                  required
                />
              </label>

              <label className="clSvcField">
                <span>Car Size</span>
                <select
                  value={bookingForm.carSize}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, carSize: e.target.value }))}
                  required
                >
                  <option value="">Select car size</option>
                  {CAR_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
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
                      {option.name}
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
                <button className="clSvcPrimaryBtn" type="submit" disabled={loading}>
                  Confirm Booking
                </button>
              </div>
            </form>
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
