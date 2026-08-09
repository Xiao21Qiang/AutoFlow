import "../../styles/css/admin/adminServicesStyle.css";
import FilterModal from "../../components/common/FilterModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "../../utils/downloadExport";
import { CAR_SIZE_OPTIONS, createEmptyPriceBySize, formatPriceRangeLabel, getServicePriceBySize } from "../../utils/servicePricing";
import {
  buildConsumablesBySizePayload,
  alignConsumablesToStockItems,
  createEmptyConsumableSizes,
  createSelectedConsumableKeys,
  filterConsumablesBySelectedKeys,
  findConsumableEntryKey,
  formatConsumableSizeLabel,
  getStockConsumableKey,
  normalizeConsumablesBySize,
  normalizeConsumableDisplayName,
} from "../../utils/serviceConsumables";
import {
  SERVICE_ARRIVAL_TIME_OPTIONS,
  formatTimeLabel,
  getDefaultArrivalTimesForDuration,
  normalizeAllowedArrivalTimes,
} from "../../utils/bookingWorkflow";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const CATEGORY_OPTIONS = ["Coating", "Tinting", "Protection", "Cleaning", "Wash"];
const SERVICE_TYPE_OPTIONS = ["Basic Service", "Package"];
const DUPLICATE_SERVICE_MESSAGE = "A service with this name already exists.";
const MISSING_CONSUMABLE_MESSAGE = "Please select at least one consumable.";
const PRICE_FIELD_LABELS = {
  sedanSmallCar: "Sedan / Small Car price",
  midsizePickupMpv: "Midsize / Pickup / MPV price",
  suv: "SUV price",
  xlVanSemiTruck: "XL / Van / Semi Truck price",
};
const ADD_SERVICE_FIELDS = ["name", "category", "status", "durationHours", "allowedArrivalTimes", "consumables", ...Object.keys(PRICE_FIELD_LABELS)];

function normalizeServiceNameKey(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
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

function createEmptyAddServiceForm() {
  return {
    name: "",
    serviceType: "Basic Service",
    category: "",
    priceBySize: toPriceInputState({ priceBySize: createEmptyPriceBySize() }),
    durationHours: "",
    status: "",
    allowedArrivalTimes: getDefaultArrivalTimesForDuration(0),
    consumablesBySize: {},
  };
}

function parseRequiredNonNegativeNumber(value, label) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return { value: 0, error: `${label} is required.` };
  const number = Number(rawValue);
  if (!Number.isFinite(number)) return { value: 0, error: `${label} must be a valid number.` };
  if (number < 0) return { value: number, error: `${label} cannot be negative.` };
  return { value: number, error: "" };
}

function getAddServiceFieldErrors({ form, duplicateNameError = "", consumablesError = "" }) {
  const errors = {};
  if (!String(form.name || "").trim()) {
    errors.name = "Service name is required.";
  } else if (duplicateNameError) {
    errors.name = duplicateNameError;
  }
  if (!CATEGORY_OPTIONS.includes(String(form.category || "").trim())) {
    errors.category = "Please select a valid service category.";
  }
  if (!["Active", "Inactive"].includes(String(form.status || "").trim())) {
    errors.status = "Please select a service status.";
  }

  Object.entries(PRICE_FIELD_LABELS).forEach(([key, label]) => {
    const parsed = parseRequiredNonNegativeNumber(form.priceBySize?.[key], label);
    if (parsed.error) errors[key] = parsed.error;
  });

  const duration = parseRequiredNonNegativeNumber(form.durationHours, "Duration");
  if (duration.error) {
    errors.durationHours = duration.error;
  } else if (duration.value <= 0) {
    errors.durationHours = "Duration must be greater than zero.";
  }

  if (!form.allowedArrivalTimes?.length) {
    errors.allowedArrivalTimes = "Select at least one required time of arrival.";
  }
  if (consumablesError) {
    errors.consumables = consumablesError;
  }

  return errors;
}

export default function AdminServices({ initialAction = null, onActionHandled }) {
  const { services, stockMonitoring, currentUser, createService, updateService, toggleService, deleteService } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", enabled: "" });
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [addTouchedFields, setAddTouchedFields] = useState({});
  const [editTouchedFields, setEditTouchedFields] = useState({});
  const [addSelectedConsumableKeys, setAddSelectedConsumableKeys] = useState([]);
  const [editSelectedConsumableKeys, setEditSelectedConsumableKeys] = useState([]);
  const [addSubmitAttempted, setAddSubmitAttempted] = useState(false);
  const [isAddServiceSubmitting, setIsAddServiceSubmitting] = useState(false);
  const isAddServiceSubmittingRef = useRef(false);
  const [form, setForm] = useState({
    name: "",
    desc: "",
    serviceType: "Basic Service",
    category: "",
    priceBySize: toPriceInputState({ priceBySize: createEmptyPriceBySize() }),
    mins: "",
    allowedArrivalTimes: getDefaultArrivalTimesForDuration(0),
    consumablesBySize: {},
  });
  const [addForm, setAddForm] = useState(createEmptyAddServiceForm);
  const [serviceFormError, setServiceFormError] = useState("");

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
          _id: item._id,
          name: normalizeConsumableDisplayName(item.name),
          stock: Number(item.currentStock || 0),
        }))
        .filter((item) => item.name),
    [stockMonitoring]
  );
  const addConsumableCount = addSelectedConsumableKeys.length;
  const hasAddSelectedConsumable = addConsumableCount > 0;
  const addConsumablesError = hasAddSelectedConsumable ? "" : MISSING_CONSUMABLE_MESSAGE;
  const addDuplicateNameError = useMemo(() => {
    const requestedKey = normalizeServiceNameKey(addForm.name);
    if (!requestedKey) return "";
    return services.some((service) => normalizeServiceNameKey(service.name) === requestedKey)
      ? DUPLICATE_SERVICE_MESSAGE
      : "";
  }, [addForm.name, services]);
  const addFieldErrors = getAddServiceFieldErrors({
    form: addForm,
    duplicateNameError: addDuplicateNameError,
    consumablesError: addConsumablesError,
  });
  const isAddServiceReady = hasAddSelectedConsumable && !addDuplicateNameError && !isAddServiceSubmitting;

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedService = services.find((service) => service.id === selectedServiceId) || null;
  const editConsumableCount = editSelectedConsumableKeys.length;
  const hasEditSelectedConsumable = editConsumableCount > 0;
  const editConsumablesError = hasEditSelectedConsumable ? "" : MISSING_CONSUMABLE_MESSAGE;
  const editDuplicateNameError = useMemo(() => {
    const requestedKey = normalizeServiceNameKey(form.name);
    if (!requestedKey || !selectedService) return "";
    return services.some((service) => {
      if (String(service.id || "") === String(selectedService.id || "")) return false;
      return normalizeServiceNameKey(service.name) === requestedKey;
    })
      ? DUPLICATE_SERVICE_MESSAGE
      : "";
  }, [form.name, selectedService, services]);
  const isEditServiceReady = hasEditSelectedConsumable && !editDuplicateNameError;

  const resetAddServiceState = ({ resetValues = false } = {}) => {
    setAddTouchedFields({});
    setAddSubmitAttempted(false);
    setAddSelectedConsumableKeys([]);
    setServiceFormError("");
    setIsAddServiceSubmitting(false);
    isAddServiceSubmittingRef.current = false;
    if (resetValues) setAddForm(createEmptyAddServiceForm());
  };

  const markAddFieldTouched = (field) => {
    setAddTouchedFields((prev) => ({ ...prev, [field]: true }));
  };

  const getAddFieldError = (field) => (
    addTouchedFields[field] || addSubmitAttempted ? addFieldErrors[field] || "" : ""
  );

  useEffect(() => {
    if (initialAction !== "open-add-service") return;
    resetAddServiceState({ resetValues: true });
    setIsAddOpen(true);
    onActionHandled?.();
  }, [initialAction, onActionHandled]);

  const openEditModal = (service) => {
    setSelectedServiceId(service.id);
    const consumablesBySize = alignConsumablesToStockItems(
      normalizeConsumablesBySize(service.consumablesBySize, service.consumables),
      stockMonitoringOptions
    );
    setForm({
      name: service.name,
      desc: service.desc,
      serviceType: getServiceType(service),
      category: service.category,
      priceBySize: toPriceInputState(service),
      mins: String(service.mins),
      allowedArrivalTimes: normalizeAllowedArrivalTimes(service.allowedArrivalTimes, service.mins),
      consumablesBySize,
    });
    setServiceFormError("");
    setEditTouchedFields({});
    setEditSelectedConsumableKeys(createSelectedConsumableKeys(consumablesBySize, stockMonitoringOptions));
    setIsEditOpen(true);
  };

  const toggleConsumable = (key, item) => {
    const name = normalizeConsumableDisplayName(item?.name);
    const selectionKey = getStockConsumableKey(item);
    if (!name || !selectionKey) return;

    const setter = key === "add" ? setAddForm : setForm;
    const selectionSetter = key === "add" ? setAddSelectedConsumableKeys : setEditSelectedConsumableKeys;
    if (key === "add") {
      setAddTouchedFields((prev) => ({ ...prev, consumables: true }));
      setServiceFormError("");
    } else {
      setEditTouchedFields((prev) => ({ ...prev, consumables: true }));
      setServiceFormError("");
    }

    selectionSetter((prev) => {
      const current = [...new Set((prev || []).filter(Boolean))];
      return current.includes(selectionKey)
        ? current.filter((keyValue) => keyValue !== selectionKey)
        : [...current, selectionKey];
    });

    setter((prev) => {
      const current = prev.consumablesBySize || {};
      const nextConsumables = { ...current };
      const existingKey = findConsumableEntryKey(nextConsumables, name);

      if (!existingKey) {
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
        [findConsumableEntryKey(prev.consumablesBySize, name) || name]: {
          ...(prev.consumablesBySize?.[findConsumableEntryKey(prev.consumablesBySize, name) || name] || createEmptyConsumableSizes()),
          [sizeKey]: nextValue,
        },
      },
    }));
  };

  const renderConsumablesPicker = (mode, selectedConsumables, selectedConsumableKeys = []) => {
    const selectedKeySet = new Set(selectedConsumableKeys);
    const selectedCount = selectedConsumableKeys.length;
    const consumablesError =
      mode === "add" && addTouchedFields.consumables
        ? addConsumablesError
        : mode === "edit" && editTouchedFields.consumables
          ? editConsumablesError
          : "";
    const errorId = mode === "edit" ? "edit-service-consumables-error" : "add-service-consumables-error";
    return (
    <div className="svcConsumablesPanel" aria-invalid={consumablesError ? "true" : undefined} aria-describedby={consumablesError ? errorId : undefined}>
      <div className="svcConsumablesHeader">
        <div>
          <div className="svcConsumablesTitle">Consumables To Be Used</div>
          <div className="svcConsumablesHint">Select stock monitoring items and set how many each service uses.</div>
        </div>
        <div className="svcConsumablesCount">{selectedCount} selected</div>
      </div>

      {stockMonitoringOptions.length ? (
        <div className="svcConsumablesGrid">
          {stockMonitoringOptions.map((item) => {
            const selectedKey = findConsumableEntryKey(selectedConsumables, item.name);
            const checked = selectedKeySet.has(getStockConsumableKey(item));
            const selectedQuantities = selectedKey ? selectedConsumables[selectedKey] : {};

            return (
              <label className={`svcConsumableCard ${checked ? "selected" : ""}`} key={item.id || item._id || item.name}>
                <div className="svcConsumableMain">
                  <input
                    className="svcConsumableCheckbox"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleConsumable(mode, item)}
                  />
                  <div className="svcConsumableInfo">
                    <div className="svcConsumableName">{item.name}</div>
                    <div className="svcConsumableMeta">{item.stock} in stock</div>
                  </div>
                </div>
                <div className="svcConsumableQty">
                  <div className="svcConsumableQtyLabel">Qty By Size</div>
                  <div className="svcConsumableQtyGrid">
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
                        <label key={label} className="svcConsumableQtyItem">
                          <span>{label}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={checked ? selectedQuantities?.[sizeKey] || "" : ""}
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
        <div className="svcConsumablesEmpty">No stock monitoring items available yet.</div>
      )}
      {consumablesError ? <div className="svcFormError" id={errorId}>{consumablesError}</div> : null}
    </div>
    );
  };

  const renderPriceFields = (mode, priceBySize) => {
    const setter = mode === "add" ? setAddForm : setForm;
    return (
      <div className="svcPriceGrid">
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
            <label className="svcField" key={label}>
              <span>{label} Price (P)</span>
              <input
                type="number"
                min="0"
                value={priceBySize?.[key] || ""}
                onBlur={() => {
                  if (mode === "add") markAddFieldTouched(key);
                }}
                onChange={(e) =>
                  setter((prev) => ({
                    ...prev,
                    priceBySize: {
                      ...(prev.priceBySize || {}),
                      [key]: e.target.value,
                    },
                  }))
                }
                className={mode === "add" && getAddFieldError(key) ? "svcFieldInvalidInput" : ""}
                required
                aria-invalid={mode === "add" && getAddFieldError(key) ? "true" : undefined}
                aria-describedby={mode === "add" && getAddFieldError(key) ? `add-service-${key}-error` : undefined}
              />
              {mode === "add" && getAddFieldError(key) ? <div className="svcFieldError" id={`add-service-${key}-error`}>{getAddFieldError(key)}</div> : null}
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
    if (mode === "add") markAddFieldTouched("allowedArrivalTimes");
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
    const selectedSet = new Set(selectedTimes || []);
    return (
      <div className="svcArrivalPanel">
        <div className="svcConsumablesHeader">
          <div>
            <div className="svcConsumablesTitle">Required Time of Arrival</div>
            <div className="svcConsumablesHint">Select any hourly arrival slots from 8:00 AM to 5:00 PM. Duration changes auto-select the suggested defaults, but you can customize them.</div>
          </div>
          <div className="svcConsumablesCount">{(selectedTimes || []).length} selected</div>
        </div>
        <div className="svcArrivalGrid">
          {SERVICE_ARRIVAL_TIME_OPTIONS.map((time) => (
            <label className={`svcArrivalOption${selectedSet.has(time) ? " selected" : ""}`} key={time}>
              <input
                type="checkbox"
                checked={selectedSet.has(time)}
                onChange={() => toggleArrivalTime(mode, time)}
              />
              <span>{formatTimeLabel(time)}</span>
              {suggestedTimes.includes(time) ? <em>Suggested</em> : null}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const exportPdf = () =>
    downloadAuthenticatedFile(buildReportDownloadPath("services", "pdf"), "autoflow-services-report.pdf")
      .catch((error) => window.alert(error.message || "Could not download report."));

  const pagedBasicServices = paged.filter((service) => getServiceType(service) === "Basic Service");
  const pagedPackages = paged.filter((service) => getServiceType(service) === "Package");
  const hasNoFilteredServices = filtered.length === 0;
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
      <ul className="svcList">
        {entries.map(([name, quantities]) => (
          <li key={name}>{formatConsumableSizeLabel(name, quantities)}</li>
        ))}
      </ul>
    ) : (
      <div className="svcEmptyText">No consumables linked.</div>
    );
  };
  const renderServiceSection = (title, items) => {
    const section = getSectionDetails(title);
    return (
    items.length ? (
      <section className={`svcSectionBlock ${section.tone}`} key={title}>
        <div className="svcSectionHead">
          <div>
            <div className="svcSectionTitle">{title}</div>
            <div className="svcSectionSubtitle">{section.subtitle}</div>
          </div>
          <div className="svcSectionCount">{items.length}</div>
        </div>
        <div className="svcSectionScroll">
          <div className="svcCardsGrid">
          {items.map((service) => (
            <div className={`svcCard ${section.tone}`} key={service.id}>
              <div className="svcCardTop">
                <span className={`svcTypeBadge ${section.tone}`}>{section.label}</span>
                {service.category ? <span className="svcCategoryBadge">{service.category}</span> : null}
                <span className={`svcStatusBadge ${service.enabled ? "enabled" : "disabled"}`}>{service.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <h3 className="svcTitle">{service.name}</h3>
              <div className="svcSub">{service.desc || "No description provided."}</div>
              <div className="svcInfoGrid">
                <div className="svcInfoItem">
                  <span>Price Range</span>
                  <strong>{formatPriceRangeLabel(service)}</strong>
                </div>
                <div className="svcInfoItem">
                  <span>Duration</span>
                  <strong>{service.mins || 0} mins</strong>
                </div>
                <div className="svcInfoItem wide">
                  <span>Required Time of Arrival</span>
                  <strong>{getArrivalTimesLabel(service) || "Not configured"}</strong>
                </div>
              </div>
              <div className="svcSection">Consumables</div>
              <div className="svcConsumablesPreview">{renderConsumablesList(service)}</div>
              <div className="cardActions"><button className="smallBtn smallBtnEdit" type="button" onClick={() => openEditModal(service)}>Edit</button><button className="smallBtn smallBtnOutline" type="button" onClick={() => setSecurityConfirm({ mode: "pin", title: "Change Service Status", message: "Enter the special PIN before changing this service status.", onConfirm: async () => { await toggleService(service); setSecurityConfirm(null); } })}>{service.enabled ? "Disable" : "Enable"}</button></div>
            </div>
          ))}
          </div>
        </div>
      </section>
    ) : null
    );
  };

  return (
    <div className="servicesWrap">
      <div className="servicesRow">
        <div className="svcSearchBox"><img className="svcSearchIcon" src={icoSearch} alt="" /><input className="svcSearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Services..." /></div>
        <button className="svcFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img className="svcFilterIcon" src={icoFilter} alt="" /></button>
        <div className="svcActionBtns"><button className="svcBtn svcBtnDark" type="button" onClick={exportPdf}>Export as PDF</button><button className="svcBtn svcBtnGold" type="button" onClick={() => { resetAddServiceState({ resetValues: true }); setIsAddOpen(true); }}>Add New Service</button></div>
      </div>

      <div className="svcBoard">
        {hasNoFilteredServices ? (
          <div className="svcEmptyState">No services found.</div>
        ) : (
          <>
            {renderServiceSection("Basic Services", pagedBasicServices)}
            {renderServiceSection("Packages", pagedPackages)}
          </>
        )}
      </div>

      <div className="svcPagerRow"><button className="svcPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="svcPagerNum">{safePage}</span><button className="svcPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {isEditOpen && selectedService && (
        <div className="svcModalOverlay">
          <div className="svcModalCard svcModalCardWide" role="dialog" aria-modal="true">
            <button className="svcModalClose" type="button" onClick={() => { setEditTouchedFields({}); setEditSelectedConsumableKeys([]); setServiceFormError(""); setIsEditOpen(false); }}>x</button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditTouchedFields((prev) => ({ ...prev, name: true, consumables: true }));
                if (editDuplicateNameError) {
                  setServiceFormError(editDuplicateNameError);
                  return;
                }
                if (editConsumablesError) {
                  setServiceFormError(editConsumablesError);
                  return;
                }
                const priceBySize = buildPriceBySizePayload(form.priceBySize);
                if (!form.allowedArrivalTimes?.length) {
                  setServiceFormError("Select at least one required time of arrival.");
                  return;
                }
                const payload = {
                  ...selectedService,
                  name: form.name.trim().replace(/\s+/g, " "),
                  desc: form.desc.trim(),
                  serviceType: form.serviceType,
                  category: form.category,
                  price: Number(priceBySize.sedanSmallCar) || 0,
                  priceBySize,
                  mins: Number(form.mins) || 0,
                  allowedArrivalTimes: form.allowedArrivalTimes,
                  consumablesBySize: buildConsumablesBySizePayload(
                    filterConsumablesBySelectedKeys(form.consumablesBySize, editSelectedConsumableKeys, stockMonitoringOptions)
                  ),
                };
                setSecurityConfirm({ mode: "pin", title: "Save Service Changes", message: "Enter the special PIN before saving service edits.", onConfirm: async () => { await updateService(selectedService.id, payload); setSecurityConfirm(null); setEditTouchedFields({}); setEditSelectedConsumableKeys([]); setIsEditOpen(false); } });
              }}
            >
              <div className="svcModalTitle">Edit Service</div>
              <div className="svcFormSection">
                <label className="svcField">
                  <span>Service Name</span>
                  <input
                    value={form.name}
                    onBlur={() => setEditTouchedFields((prev) => ({ ...prev, name: true }))}
                    onChange={(e) => {
                      setServiceFormError("");
                      setForm((prev) => ({ ...prev, name: e.target.value }));
                    }}
                    className={editTouchedFields.name && editDuplicateNameError ? "svcFieldInvalidInput" : ""}
                    required
                    aria-invalid={editTouchedFields.name && editDuplicateNameError ? "true" : undefined}
                    aria-describedby={editTouchedFields.name && editDuplicateNameError ? "edit-service-name-error" : undefined}
                  />
                  {editTouchedFields.name && editDuplicateNameError ? <div className="svcFieldError" id="edit-service-name-error">{editDuplicateNameError}</div> : null}
                </label>
                <label className="svcField">
                  <span>Short Description</span>
                  <input value={form.desc} onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))} required />
                </label>
                <div className="svcFieldGrid">
                  <label className="svcField">
                    <span>Service Type</span>
                    <select value={form.serviceType} onChange={(e) => setForm((prev) => ({ ...prev, serviceType: e.target.value }))} required>
                      {SERVICE_TYPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="svcField">
                    <span>Category</span>
                    <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} required>
                      {CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                {renderPriceFields("edit", form.priceBySize)}
                <div className="svcFieldGrid">
                  <label className="svcField">
                    <span>Est. Duration (Mins)</span>
                    <input type="number" min="0" value={form.mins} onChange={(e) => updateServiceDuration("edit", e.target.value)} required />
                  </label>
                </div>
              </div>
              {renderArrivalTimePicker("edit", Number(form.mins) || 0, form.allowedArrivalTimes)}
              {renderConsumablesPicker("edit", form.consumablesBySize, editSelectedConsumableKeys)}
              {serviceFormError ? <div className="svcFormError">{serviceFormError}</div> : null}
              <div className="svcModalActions svcModalActionsSplit">
                <button className="svcDangerBtn" type="button" onClick={() => setIsDeleteConfirmOpen(true)}>Delete Service</button>
                <div className="svcModalActionsRight">
                  <button className="svcTextBtn" type="button" onClick={() => { setEditTouchedFields({}); setEditSelectedConsumableKeys([]); setServiceFormError(""); setIsEditOpen(false); }}>Cancel</button>
                  <button className="svcPrimaryBtn" type="submit" disabled={!isEditServiceReady}>Save Service</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddOpen && (
        <div className="svcModalOverlay">
          <div className="svcModalCard svcModalCardWide" role="dialog" aria-modal="true">
            <button className="svcModalClose" type="button" onClick={() => { resetAddServiceState({ resetValues: true }); setIsAddOpen(false); }}>x</button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAddSubmitAttempted(true);
                setAddTouchedFields(Object.fromEntries(ADD_SERVICE_FIELDS.map((field) => [field, true])));
                if (isAddServiceSubmittingRef.current) return;
                const currentErrors = getAddServiceFieldErrors({
                  form: addForm,
                  duplicateNameError: addDuplicateNameError,
                  consumablesError: addConsumablesError,
                });
                if (Object.keys(currentErrors).length > 0) {
                  setServiceFormError(Object.values(currentErrors)[0]);
                  return;
                }
                const priceBySize = buildPriceBySizePayload(addForm.priceBySize);
                const mins = (Number(addForm.durationHours) || 0) * 60;
                const payload = {
                  name: addForm.name.trim().replace(/\s+/g, " "),
                  desc: "",
                  serviceType: addForm.serviceType,
                  category: addForm.category,
                  price: Number(priceBySize.sedanSmallCar) || 0,
                  priceBySize,
                  mins,
                  allowedArrivalTimes: addForm.allowedArrivalTimes,
                  enabled: addForm.status === "Active",
                  consumablesBySize: buildConsumablesBySizePayload(
                    filterConsumablesBySelectedKeys(addForm.consumablesBySize, addSelectedConsumableKeys, stockMonitoringOptions)
                  ),
                };
                setServiceFormError("");
                setSecurityConfirm({ mode: "password", title: "Add Service", message: "Enter the special password before adding a new service.", onConfirm: async () => {
                  if (isAddServiceSubmittingRef.current) return;
                  isAddServiceSubmittingRef.current = true;
                  setIsAddServiceSubmitting(true);
                  try {
                    await createService(payload);
                    setSecurityConfirm(null);
                    setPage(1);
                    setIsAddOpen(false);
                    resetAddServiceState({ resetValues: true });
                  } finally {
                    isAddServiceSubmittingRef.current = false;
                    setIsAddServiceSubmitting(false);
                  }
                } });
              }}
            >
              <div className="svcModalTitle">Add Service</div>
              <div className="svcFormSection">
                <label className="svcField">
                  <span>Service Name</span>
                  <input
                    value={addForm.name}
                    onBlur={() => markAddFieldTouched("name")}
                    onChange={(e) => {
                      setServiceFormError("");
                      setAddForm((prev) => ({ ...prev, name: e.target.value }));
                    }}
                    className={getAddFieldError("name") ? "svcFieldInvalidInput" : ""}
                    required
                    aria-invalid={getAddFieldError("name") ? "true" : undefined}
                    aria-describedby={getAddFieldError("name") ? "add-service-name-error" : undefined}
                  />
                  {getAddFieldError("name") ? <div className="svcFieldError" id="add-service-name-error">{getAddFieldError("name")}</div> : null}
                </label>
                <div className="svcFieldGrid">
                  <label className="svcField">
                    <span>Service Type</span>
                    <select value={addForm.serviceType} onChange={(e) => setAddForm((prev) => ({ ...prev, serviceType: e.target.value }))} required>
                      {SERVICE_TYPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="svcField">
                    <span>Category</span>
                    <select value={addForm.category} onBlur={() => markAddFieldTouched("category")} onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))} className={getAddFieldError("category") ? "svcFieldInvalidInput" : ""} required aria-invalid={getAddFieldError("category") ? "true" : undefined} aria-describedby={getAddFieldError("category") ? "add-service-category-error" : undefined}>
                      <option value="" disabled>Select category</option>
                      {CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                    {getAddFieldError("category") ? <div className="svcFieldError" id="add-service-category-error">{getAddFieldError("category")}</div> : null}
                  </label>
                </div>
                {renderPriceFields("add", addForm.priceBySize)}
                <div className="svcFieldGrid">
                  <label className="svcField">
                    <span>Duration (Hrs)</span>
                    <input type="number" min="1" value={addForm.durationHours} onBlur={() => markAddFieldTouched("durationHours")} onChange={(e) => updateServiceDuration("add", e.target.value)} className={getAddFieldError("durationHours") ? "svcFieldInvalidInput" : ""} required aria-invalid={getAddFieldError("durationHours") ? "true" : undefined} aria-describedby={getAddFieldError("durationHours") ? "add-service-duration-error" : undefined} />
                    {getAddFieldError("durationHours") ? <div className="svcFieldError" id="add-service-duration-error">{getAddFieldError("durationHours")}</div> : null}
                  </label>
                  <label className="svcField">
                    <span>Status</span>
                    <select value={addForm.status} onBlur={() => markAddFieldTouched("status")} onChange={(e) => setAddForm((prev) => ({ ...prev, status: e.target.value }))} className={getAddFieldError("status") ? "svcFieldInvalidInput" : ""} required aria-invalid={getAddFieldError("status") ? "true" : undefined} aria-describedby={getAddFieldError("status") ? "add-service-status-error" : undefined}>
                      <option value="" disabled>Select status</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    {getAddFieldError("status") ? <div className="svcFieldError" id="add-service-status-error">{getAddFieldError("status")}</div> : null}
                  </label>
                </div>
              </div>
              {renderArrivalTimePicker("add", (Number(addForm.durationHours) || 0) * 60, addForm.allowedArrivalTimes)}
              {getAddFieldError("allowedArrivalTimes") ? <div className="svcFormError">{getAddFieldError("allowedArrivalTimes")}</div> : null}
              {renderConsumablesPicker("add", addForm.consumablesBySize, addSelectedConsumableKeys)}
              {serviceFormError ? <div className="svcFormError">{serviceFormError}</div> : null}
              <div className="svcModalActions">
                <button className="svcTextBtn" type="button" onClick={() => { resetAddServiceState({ resetValues: true }); setIsAddOpen(false); }}>Cancel</button>
                <button className="svcPrimaryBtn" type="submit" disabled={!isAddServiceReady}>{isAddServiceSubmitting ? "Adding..." : "Add Service"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={isDeleteConfirmOpen}
        title="Delete Service"
        message={`Delete ${selectedService?.name || "this service"} from the system?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
	        onConfirm={async () => {
	          if (!selectedService) return;
	          setSecurityConfirm({ mode: "password", title: "Delete Service", message: "Enter the special password before deleting this service.", onConfirm: async () => { await deleteService(selectedService.id); setSecurityConfirm(null);
          setIsDeleteConfirmOpen(false);
          setIsEditOpen(false);
          setSelectedServiceId(null);
            } });
        }}
        onClose={() => setIsDeleteConfirmOpen(false)}
      />

      <FilterModal open={isFilterOpen} title="Filter Services" fields={[{ key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS }, { key: "enabled", label: "Status", type: "select", options: ["Enabled", "Disabled"] }]} values={filters} onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))} onClose={() => setIsFilterOpen(false)} onApply={() => { setPage(1); setIsFilterOpen(false); }} onReset={() => { setFilters({ category: "", enabled: "" }); setPage(1); }} />
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} actionKey={securityConfirm?.actionKey}
        onConfirm={securityConfirm?.onConfirm} />
    </div>
  );
}
