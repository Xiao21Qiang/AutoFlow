import "../../styles/css/staff/staffServicesStyle.css";

import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { CAR_SIZE_OPTIONS, createEmptyPriceBySize, formatPriceRangeLabel, getServicePriceBySize } from "../../utils/servicePricing";
import {
  buildConsumablesBySizePayload,
  createEmptyConsumableSizes,
  formatConsumableSizeLabel,
  normalizeConsumablesBySize,
} from "../../utils/serviceConsumables";
import {
  SERVICE_ARRIVAL_TIME_OPTIONS,
  formatTimeLabel,
  getDefaultArrivalTimesForDuration,
  normalizeAllowedArrivalTimes,
} from "../../utils/bookingWorkflow";
import { ACTION_KEYS, canPerformAction } from "../../utils/rbac";

const CATEGORY_OPTIONS = ["Coating", "Tinting", "Protection", "Cleaning", "Wash"];
const SERVICE_TYPE_OPTIONS = ["Basic Service", "Package"];

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

function toPriceInputState(service) {
  const priceBySize = getServicePriceBySize(service);
  return {
    sedanSmallCar: String(priceBySize.sedanSmallCar || ""),
    midsizePickupMpv: String(priceBySize.midsizePickupMpv || ""),
    suv: String(priceBySize.suv || ""),
    xlVanSemiTruck: String(priceBySize.xlVanSemiTruck || ""),
  };
}

function buildPriceBySizePayload(priceBySize) {
  return {
    sedanSmallCar: Number(priceBySize?.sedanSmallCar) || 0,
    midsizePickupMpv: Number(priceBySize?.midsizePickupMpv) || 0,
    suv: Number(priceBySize?.suv) || 0,
    xlVanSemiTruck: Number(priceBySize?.xlVanSemiTruck) || 0,
  };
}

export default function StaffServices() {
  const { services, stockMonitoring, currentUser, createService, updateService, toggleService } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", enabled: "" });
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", desc: "", serviceType: "Basic Service", category: "Coating", priceBySize: toPriceInputState({ priceBySize: createEmptyPriceBySize() }), mins: "", allowedArrivalTimes: getDefaultArrivalTimesForDuration(0), consumablesBySize: {} });
  const [addForm, setAddForm] = useState({ name: "", serviceType: "Basic Service", category: "Coating", priceBySize: toPriceInputState({ priceBySize: createEmptyPriceBySize() }), durationHours: "1", status: "Active", allowedArrivalTimes: getDefaultArrivalTimesForDuration(60), consumablesBySize: {} });
  const [serviceFormError, setServiceFormError] = useState("");
  const canManageServices = canPerformAction(currentUser, ACTION_KEYS.servicesManage);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return services.filter((service) => {
      const matchesQuery = !q || `${service.name} ${service.desc} ${service.category} ${getServiceType(service)}`.toLowerCase().includes(q);
      const matchesCategory = !filters.category || service.category === filters.category;
      const matchesEnabled = !filters.enabled || String(service.enabled) === (filters.enabled === "Enabled" ? "true" : "false");
      return matchesQuery && matchesCategory && matchesEnabled;
    });
  }, [services, query, filters]);

  const stockMonitoringOptions = useMemo(
    () =>
      stockMonitoring
        .filter((item) => item.name)
        .map((item) => ({
          id: item.id,
          name: item.name,
          stock: Number(item.currentStock || 0),
        })),
    [stockMonitoring]
  );

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedService = services.find((service) => service.id === selectedServiceId) || null;

  const openEditModal = (service) => {
    setSelectedServiceId(service.id);
    setForm({
      name: service.name,
      desc: service.desc,
      serviceType: getServiceType(service),
      category: service.category,
      priceBySize: toPriceInputState(service),
      mins: String(service.mins || ""),
      allowedArrivalTimes: normalizeAllowedArrivalTimes(service.allowedArrivalTimes, service.mins),
      consumablesBySize: normalizeConsumablesBySize(service.consumablesBySize, service.consumables),
    });
    setServiceFormError("");
    setIsEditOpen(true);
  };

  const toggleConsumable = (key, itemName) => {
    const name = String(itemName || "").trim();
    if (!name) return;

    const setter = key === "add" ? setAddForm : setForm;

    setter((prev) => {
      const current = prev.consumablesBySize || {};
      const nextConsumables = { ...current };

      if (nextConsumables[name]) {
        delete nextConsumables[name];
      } else {
        nextConsumables[name] = createEmptyConsumableSizes();
      }

      return { ...prev, consumablesBySize: nextConsumables };
    });
  };

  const updateConsumableQty = (key, itemName, sizeKey, value) => {
    const name = String(itemName || "").trim();
    if (!name) return;

    const nextValue = value.replace(/[^\d.]/g, "");
    const setter = key === "add" ? setAddForm : setForm;

    setter((prev) => ({
      ...prev,
      consumablesBySize: {
        ...(prev.consumablesBySize || {}),
        [name]: {
          ...(prev.consumablesBySize?.[name] || createEmptyConsumableSizes()),
          [sizeKey]: nextValue,
        },
      },
    }));
  };

  const renderConsumablesPicker = (mode, selectedConsumables) => (
    <div className="stSvcConsumablesPanel">
      <div className="stSvcConsumablesHeader">
        <div>
          <div className="stSvcConsumablesTitle">Consumables To Be Used</div>
          <div className="stSvcConsumablesHint">Select stock monitoring items and set how many each service uses.</div>
        </div>
        <div className="stSvcConsumablesCount">{Object.keys(selectedConsumables || {}).length} selected</div>
      </div>

      {stockMonitoringOptions.length ? (
        <div className="stSvcConsumablesGrid">
          {stockMonitoringOptions.map((item) => {
            const checked = Boolean(selectedConsumables[item.name]);

            return (
              <label className={`stSvcConsumableCard ${checked ? "selected" : ""}`} key={item.id || item.name}>
                <div className="stSvcConsumableMain">
                  <input
                    className="stSvcConsumableCheckbox"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleConsumable(mode, item.name)}
                  />
                  <div className="stSvcConsumableInfo">
                    <div className="stSvcConsumableName">{item.name}</div>
                    <div className="stSvcConsumableMeta">{item.stock} in stock</div>
                  </div>
                </div>
                <div className="stSvcConsumableQty">
                  <div className="stSvcConsumableQtyLabel">Qty By Size</div>
                  <div className="stSvcConsumableQtyGrid">
                    {CAR_SIZE_OPTIONS.map((label) => {
                      const sizeKey =
                        label === "Sedan / Small Car"
                          ? "sedanSmallCar"
                          : label === "Midsize / Pickup / MPV"
                            ? "midsizePickupMpv"
                            : label === "SUV"
                              ? "suv"
                              : "xlVanSemiTruck";

                      return (
                        <label key={label} className="stSvcConsumableQtyItem">
                          <span>{label}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={checked ? selectedConsumables[item.name]?.[sizeKey] || "" : ""}
                            onChange={(e) => updateConsumableQty(mode, item.name, sizeKey, e.target.value)}
                            placeholder="0"
                            disabled={!checked}
                            required={checked}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="stSvcConsumablesEmpty">No stock monitoring items available yet.</div>
      )}
    </div>
  );

  const renderPriceFields = (mode, priceBySize) => {
    const setter = mode === "add" ? setAddForm : setForm;
    return (
      <div className="stSvcFieldGrid">
        {CAR_SIZE_OPTIONS.map((label) => {
          const key =
            label === "Sedan / Small Car"
              ? "sedanSmallCar"
              : label === "Midsize / Pickup / MPV"
                ? "midsizePickupMpv"
                : label === "SUV"
                  ? "suv"
                  : "xlVanSemiTruck";

          return (
            <label className="stSvcField" key={label}>
              <span>{label} Price (P)</span>
              <input
                type="number"
                min="0"
                value={priceBySize?.[key] || ""}
                onChange={(e) =>
                  setter((prev) => ({
                    ...prev,
                    priceBySize: {
                      ...(prev.priceBySize || {}),
                      [key]: e.target.value,
                    },
                  }))
                }
                required
              />
            </label>
          );
        })}
      </div>
    );
  };

  const updateServiceDuration = (mode, value) => {
    if (mode === "add") {
      const mins = (Number(value) || 0) * 60;
      setAddForm((prev) => ({
        ...prev,
        durationHours: value,
        allowedArrivalTimes: getDefaultArrivalTimesForDuration(mins),
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      mins: value,
      allowedArrivalTimes: getDefaultArrivalTimesForDuration(Number(value) || 0),
    }));
  };

  const toggleArrivalTime = (mode, time) => {
    const setter = mode === "add" ? setAddForm : setForm;
    setter((prev) => {
      const current = new Set(prev.allowedArrivalTimes || []);
      if (current.has(time)) {
        current.delete(time);
      } else {
        current.add(time);
      }
      return { ...prev, allowedArrivalTimes: [...current].filter((item) => SERVICE_ARRIVAL_TIME_OPTIONS.includes(item)) };
    });
  };

  const renderArrivalTimePicker = (mode, durationMinutes, selectedTimes) => {
    const suggestedTimes = getDefaultArrivalTimesForDuration(durationMinutes);
    const visibleTimes = [...new Set([...suggestedTimes, ...(selectedTimes || [])])].filter((item) => SERVICE_ARRIVAL_TIME_OPTIONS.includes(item));
    return (
      <div className="stSvcArrivalPanel">
        <div className="stSvcConsumablesHeader">
          <div>
            <div className="stSvcConsumablesTitle">Required Time of Arrival</div>
            <div className="stSvcConsumablesHint">Select the arrival time slots customers/staff can choose for this service. Suggested slots are based on service duration.</div>
          </div>
          <div className="stSvcConsumablesCount">{(selectedTimes || []).length} selected</div>
        </div>
        <div className="stSvcArrivalGrid">
          {visibleTimes.map((time) => (
            <label className={`stSvcArrivalOption${(selectedTimes || []).includes(time) ? " selected" : ""}`} key={time}>
              <input
                type="checkbox"
                checked={(selectedTimes || []).includes(time)}
                onChange={() => toggleArrivalTime(mode, time)}
              />
              <span>{formatTimeLabel(time)}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const pagedBasicServices = paged.filter((service) => getServiceType(service) === "Basic Service");
  const pagedPackages = paged.filter((service) => getServiceType(service) === "Package");
  const getSectionDetails = (title) => {
    const isPackage = title.toLowerCase().includes("package");
    return {
      tone: isPackage ? "package" : "basic",
      label: isPackage ? "Package" : "Basic Service",
      subtitle: isPackage ? "Bundled premium protection and detailing packages." : "Quick and standard detailing services.",
    };
  };
  const getArrivalTimesLabel = (service) =>
    normalizeAllowedArrivalTimes(service.allowedArrivalTimes, service.mins)
      .map((time) => formatTimeLabel(time))
      .join(", ");
  const renderConsumablesList = (service) => {
    const entries = Object.entries(normalizeConsumablesBySize(service.consumablesBySize, service.consumables));
    return entries.length ? (
      <ul className="stSvcList">
        {entries.map(([name, quantities]) => (
          <li key={name}>{formatConsumableSizeLabel(name, quantities)}</li>
        ))}
      </ul>
    ) : (
      <div className="stSvcEmptyText">No consumables linked.</div>
    );
  };
  const renderServiceSection = (title, items) => {
    const section = getSectionDetails(title);
    return (
    items.length ? (
      <section className={`stSvcSectionBlock ${section.tone}`} key={title}>
        <div className="stSvcSectionHead">
          <div>
            <div className="stSvcSectionTitle">{title}</div>
            <div className="stSvcSectionSubtitle">{section.subtitle}</div>
          </div>
          <div className="stSvcSectionCount">{items.length}</div>
        </div>
        <div className="stSvcSectionScroll">
          <div className="stSvcCardsGrid">
          {items.map((service) => (
            <div className={`stSvcCard ${section.tone}`} key={service.id}>
              <div className="stSvcCardTop">
                <span className={`stSvcTypeBadge ${section.tone}`}>{section.label}</span>
                {service.category ? <span className="stSvcCategoryBadge">{service.category}</span> : null}
                <span className={`stSvcStatusBadge ${service.enabled ? "enabled" : "disabled"}`}>{service.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <h3 className="stSvcTitle">{service.name}</h3>
              <div className="stSvcSub">{service.desc || "No description provided."}</div>
              <div className="stSvcInfoGrid">
                <div className="stSvcInfoItem">
                  <span>Price Range</span>
                  <strong>{formatPriceRangeLabel(service)}</strong>
                </div>
                <div className="stSvcInfoItem">
                  <span>Duration</span>
                  <strong>{service.mins || 0} mins</strong>
                </div>
                <div className="stSvcInfoItem wide">
                  <span>Required Time of Arrival</span>
                  <strong>{getArrivalTimesLabel(service) || "Not configured"}</strong>
                </div>
              </div>
              <div className="stSvcSection">Consumables</div>
              <div className="stSvcConsumablesPreview">{renderConsumablesList(service)}</div>
              <div className="stSvcCardActions">
                {canManageServices ? (
                  <>
                    <button className="stSvcSmallBtn stSvcSmallBtnEdit" type="button" onClick={() => openEditModal(service)}>Edit</button>
                    <button className="stSvcSmallBtn stSvcSmallBtnOutline" type="button" onClick={() => toggleService(service)}>{service.enabled ? "Disable" : "Enable"}</button>
                  </>
                ) : (
                  <span className="stSvcSmallBtn stSvcSmallBtnView">View Only</span>
                )}
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
    <div className="stSvcWrap">
      <div className="stSvcRow">
        <div className="stSvcSearchBox">
          <img src={icoSearch} alt="" className="stSvcSearchIcon" />
          <input
            className="stSvcSearchInput"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Services..."
          />
        </div>

        <button className="stSvcFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
          <img src={icoFilter} alt="" className="stSvcFilterIcon" />
        </button>

        <div className="stSvcActionBtns">
          {canManageServices ? (
            <button className="stSvcBtn stSvcBtnGold" type="button" onClick={() => { setServiceFormError(""); setIsAddOpen(true); }}>
              Add New Service
            </button>
          ) : null}
        </div>
      </div>

      <div className="stSvcBoard">
        {renderServiceSection("Basic Services", pagedBasicServices)}
        {renderServiceSection("Packages", pagedPackages)}
      </div>

      <div className="stSvcPagerRow">
        <button className="stSvcPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>
          {"<"}
        </button>
        <span className="stSvcPagerNum">{safePage}</span>
        <button className="stSvcPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          {">"}
        </button>
      </div>

      {isEditOpen && selectedService && (
        <div className="stSvcModalOverlay">
          <div className="stSvcModalCard stSvcModalCardWide" role="dialog" aria-modal="true">
            <button className="stSvcModalClose" type="button" onClick={() => setIsEditOpen(false)}>
              x
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const priceBySize = buildPriceBySizePayload(form.priceBySize);
                if (!form.allowedArrivalTimes?.length) {
                  setServiceFormError("Select at least one required time of arrival.");
                  return;
                }
                updateService(selectedService.id, {
                  ...selectedService,
                  name: form.name.trim(),
                  desc: form.desc.trim(),
                  serviceType: form.serviceType,
                  category: form.category,
                  price: Number(priceBySize.sedanSmallCar) || 0,
                  priceBySize,
                  mins: Number(form.mins) || 0,
                  allowedArrivalTimes: form.allowedArrivalTimes,
                  consumablesBySize: buildConsumablesBySizePayload(form.consumablesBySize),
                });
                setIsEditOpen(false);
              }}
            >
              <div className="stSvcModalTitle">Edit Service</div>
              <div className="stSvcFormSection">
                <label className="stSvcField"><span>Service Name</span><input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
                <label className="stSvcField"><span>Short Description</span><input value={form.desc} onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))} required /></label>
                <div className="stSvcFieldGrid"><label className="stSvcField"><span>Service Type</span><select value={form.serviceType} onChange={(e) => setForm((prev) => ({ ...prev, serviceType: e.target.value }))}>{SERVICE_TYPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><label className="stSvcField"><span>Category</span><select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>{CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label></div>
                {renderPriceFields("edit", form.priceBySize)}
                <div className="stSvcFieldGrid">
                  <label className="stSvcField"><span>Est. Duration (Mins)</span><input type="number" min="0" value={form.mins} onChange={(e) => updateServiceDuration("edit", e.target.value)} required /></label>
                </div>
              </div>
              {renderArrivalTimePicker("edit", Number(form.mins) || 0, form.allowedArrivalTimes)}
              {renderConsumablesPicker("edit", form.consumablesBySize)}
              {serviceFormError ? <div className="stSvcFormError">{serviceFormError}</div> : null}
              <div className="stSvcModalActions"><button className="stSvcTextBtn" type="button" onClick={() => setIsEditOpen(false)}>Cancel</button><button className="stSvcPrimaryBtn" type="submit">Save Service</button></div>
            </form>
          </div>
        </div>
      )}

      {isAddOpen && (
        <div className="stSvcModalOverlay">
          <div className="stSvcModalCard stSvcModalCardWide" role="dialog" aria-modal="true">
            <button className="stSvcModalClose" type="button" onClick={() => setIsAddOpen(false)}>
              x
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const priceBySize = buildPriceBySizePayload(addForm.priceBySize);
                if (!addForm.allowedArrivalTimes?.length) {
                  setServiceFormError("Select at least one required time of arrival.");
                  return;
                }
                createService({
                  name: addForm.name.trim(),
                  desc: "",
                  serviceType: addForm.serviceType,
                  category: addForm.category,
                  price: Number(priceBySize.sedanSmallCar) || 0,
                  priceBySize,
                  mins: (Number(addForm.durationHours) || 0) * 60,
                  allowedArrivalTimes: addForm.allowedArrivalTimes,
                  enabled: addForm.status === "Active",
                  consumablesBySize: buildConsumablesBySizePayload(addForm.consumablesBySize),
                });
                setPage(1);
                setIsAddOpen(false);
              }}
            >
              <div className="stSvcModalTitle">Add Service</div>
              <div className="stSvcFormSection">
                <label className="stSvcField"><span>Service Name</span><input value={addForm.name} onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))} required /></label>
                <div className="stSvcFieldGrid">
                  <label className="stSvcField"><span>Service Type</span><select value={addForm.serviceType} onChange={(e) => setAddForm((prev) => ({ ...prev, serviceType: e.target.value }))}>{SERVICE_TYPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label className="stSvcField"><span>Category</span><select value={addForm.category} onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))}>{CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
                </div>
                {renderPriceFields("add", addForm.priceBySize)}
                <div className="stSvcFieldGrid">
                  <label className="stSvcField"><span>Duration (Hrs)</span><input type="number" min="1" value={addForm.durationHours} onChange={(e) => updateServiceDuration("add", e.target.value)} required /></label>
                  <label className="stSvcField"><span>Status</span><select value={addForm.status} onChange={(e) => setAddForm((prev) => ({ ...prev, status: e.target.value }))}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label>
                </div>
              </div>
              {renderArrivalTimePicker("add", (Number(addForm.durationHours) || 0) * 60, addForm.allowedArrivalTimes)}
              {renderConsumablesPicker("add", addForm.consumablesBySize)}
              {serviceFormError ? <div className="stSvcFormError">{serviceFormError}</div> : null}
              <div className="stSvcModalActions"><button className="stSvcTextBtn" type="button" onClick={() => setIsAddOpen(false)}>Cancel</button><button className="stSvcPrimaryBtn" type="submit">Add Service</button></div>
            </form>
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Services"
        fields={[
          { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
          { key: "enabled", label: "Status", type: "select", options: ["Enabled", "Disabled"] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ category: "", enabled: "" });
          setPage(1);
        }}
      />
    </div>
  );
}
