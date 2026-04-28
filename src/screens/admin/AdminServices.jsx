import "../../styles/css/admin/adminServicesStyle.css";
import FilterModal from "../../components/common/FilterModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import { CAR_SIZE_OPTIONS, createEmptyPriceBySize, formatPriceRangeLabel, getServicePriceBySize } from "../../utils/servicePricing";
import {
  buildConsumablesBySizePayload,
  createEmptyConsumableSizes,
  formatConsumableSizeLabel,
  normalizeConsumablesBySize,
} from "../../utils/serviceConsumables";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

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
  const [form, setForm] = useState({
    name: "",
    desc: "",
    serviceType: "Basic Service",
    category: "",
    priceBySize: toPriceInputState({ priceBySize: createEmptyPriceBySize() }),
    mins: "",
    consumablesBySize: {},
  });
  const [addForm, setAddForm] = useState({
    name: "",
    serviceType: "Basic Service",
    category: "",
    priceBySize: toPriceInputState({ priceBySize: createEmptyPriceBySize() }),
    durationHours: "",
    status: "",
    consumablesBySize: {},
  });

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

  useEffect(() => {
    if (initialAction !== "open-add-service") return;
    setIsAddOpen(true);
    onActionHandled?.();
  }, [initialAction, onActionHandled]);

  const openEditModal = (service) => {
    setSelectedServiceId(service.id);
    setForm({
      name: service.name,
      desc: service.desc,
      serviceType: getServiceType(service),
      category: service.category,
      priceBySize: toPriceInputState(service),
      mins: String(service.mins),
      consumablesBySize: normalizeConsumablesBySize(service.consumablesBySize, service.consumables),
    });
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
    <div className="svcConsumablesPanel">
      <div className="svcConsumablesHeader">
        <div>
          <div className="svcConsumablesTitle">Consumables To Be Used</div>
          <div className="svcConsumablesHint">Select stock monitoring items and set how many each service uses.</div>
        </div>
        <div className="svcConsumablesCount">{Object.keys(selectedConsumables || {}).length} selected</div>
      </div>

      {stockMonitoringOptions.length ? (
        <div className="svcConsumablesGrid">
          {stockMonitoringOptions.map((item) => {
            const checked = Boolean(selectedConsumables[item.name]);

            return (
              <label className={`svcConsumableCard ${checked ? "selected" : ""}`} key={item.id || item.name}>
                <div className="svcConsumableMain">
                  <input
                    className="svcConsumableCheckbox"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleConsumable(mode, item.name)}
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
        <div className="svcConsumablesEmpty">No stock monitoring items available yet.</div>
      )}
    </div>
  );

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

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Services Report",
      subtitle: "Filtered service records exported in tabular format.",
      sections: [
        {
          columns: ["Service ID", "Name", "Type", "Description", "Category", "Price Range", "Duration (mins)", "Status", "Consumables"],
          rows: filtered.map((service) => [
            service.id || "-",
            service.name || "-",
            getServiceType(service),
            service.desc || "-",
            service.category || "-",
            formatPriceRangeLabel(service),
            service.mins || 0,
            service.enabled ? "Enabled" : "Disabled",
            Object.entries(normalizeConsumablesBySize(service.consumablesBySize, service.consumables))
              .map(([name, quantities]) => formatConsumableSizeLabel(name, quantities))
              .join(", ") || "-",
          ]),
          emptyMessage: "No services found for the selected filters.",
        },
      ],
    });

  const pagedBasicServices = paged.filter((service) => getServiceType(service) === "Basic Service");
  const pagedPackages = paged.filter((service) => getServiceType(service) === "Package");
  const renderServiceSection = (title, items) => (
    items.length ? (
      <section className="svcSectionBlock" key={title}>
        <div className="svcSectionHead">
          <div className="svcSectionTitle">{title}</div>
          <div className="svcSectionCount">{items.length}</div>
        </div>
        <div className="svcCardsGrid">
          {items.map((service) => (
            <div className="svcCard" key={service.id}>
              <h3 className="svcTitle">{service.name}</h3>
              <div className="svcSub">{service.desc}</div>
              <div className="svcMeta"><span>Price:</span><strong>{formatPriceRangeLabel(service)}</strong><span className="svcMetaDot">•</span><span>Est:</span><strong>{service.mins} mins</strong></div>
              <div className={`statusBar ${service.enabled ? "enabled" : "disabled"}`}>{service.enabled ? "Enabled" : "Disabled"}</div>
              <div className="svcSection">Consumables</div>
              <ul className="svcList">
                {Object.entries(normalizeConsumablesBySize(service.consumablesBySize, service.consumables)).map(([name, quantities]) => (
                  <li key={name}>{formatConsumableSizeLabel(name, quantities)}</li>
                ))}
              </ul>
              <div className="cardActions"><button className="smallBtn smallBtnEdit" type="button" onClick={() => openEditModal(service)}>Edit</button><button className="smallBtn smallBtnOutline" type="button" onClick={() => setSecurityConfirm({ mode: "pin", title: "Change Service Status", message: "Enter the special PIN before changing this service status.", onConfirm: async () => { await toggleService(service); setSecurityConfirm(null); } })}>{service.enabled ? "Disable" : "Enable"}</button></div>
            </div>
          ))}
        </div>
      </section>
    ) : null
  );

  return (
    <div className="servicesWrap">
      <div className="servicesRow">
        <div className="svcSearchBox"><img className="svcSearchIcon" src={icoSearch} alt="" /><input className="svcSearchInput" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Services..." /></div>
        <button className="svcFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img className="svcFilterIcon" src={icoFilter} alt="" /></button>
        <div className="svcActionBtns"><button className="svcBtn svcBtnDark" type="button" onClick={exportPdf}>Export as PDF</button><button className="svcBtn svcBtnGold" type="button" onClick={() => setIsAddOpen(true)}>Add New Service</button></div>
      </div>

      <div className="svcBoard">
        {renderServiceSection("Basic Services", pagedBasicServices)}
        {renderServiceSection("Packages", pagedPackages)}
      </div>

      <div className="svcPagerRow"><button className="svcPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="svcPagerNum">{safePage}</span><button className="svcPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      {isEditOpen && selectedService && (
        <div className="svcModalOverlay">
          <div className="svcModalCard svcModalCardWide" role="dialog" aria-modal="true">
            <button className="svcModalClose" type="button" onClick={() => setIsEditOpen(false)}>x</button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const priceBySize = buildPriceBySizePayload(form.priceBySize);
                const payload = {
                  ...selectedService,
                  name: form.name.trim(),
                  desc: form.desc.trim(),
                  serviceType: form.serviceType,
                  category: form.category,
                  price: Number(priceBySize.sedanSmallCar) || 0,
                  priceBySize,
                  mins: Number(form.mins) || 0,
                  consumablesBySize: buildConsumablesBySizePayload(form.consumablesBySize),
                };
                setSecurityConfirm({ mode: "pin", title: "Save Service Changes", message: "Enter the special PIN before saving service edits.", onConfirm: async () => { await updateService(selectedService.id, payload); setSecurityConfirm(null); setIsEditOpen(false); } });
              }}
            >
              <div className="svcModalTitle">Edit Service</div>
              <div className="svcFormSection">
                <label className="svcField">
                  <span>Service Name</span>
                  <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
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
                    <input type="number" min="0" value={form.mins} onChange={(e) => setForm((prev) => ({ ...prev, mins: e.target.value }))} required />
                  </label>
                </div>
              </div>
              {renderConsumablesPicker("edit", form.consumablesBySize)}
              <div className="svcModalActions svcModalActionsSplit">
                <button className="svcDangerBtn" type="button" onClick={() => setIsDeleteConfirmOpen(true)}>Delete Service</button>
                <div className="svcModalActionsRight">
                  <button className="svcTextBtn" type="button" onClick={() => setIsEditOpen(false)}>Cancel</button>
                  <button className="svcPrimaryBtn" type="submit">Save Service</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddOpen && (
        <div className="svcModalOverlay">
          <div className="svcModalCard svcModalCardWide" role="dialog" aria-modal="true">
            <button className="svcModalClose" type="button" onClick={() => setIsAddOpen(false)}>x</button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const priceBySize = buildPriceBySizePayload(addForm.priceBySize);
                const payload = {
                  name: addForm.name.trim(),
                  desc: "",
                  serviceType: addForm.serviceType,
                  category: addForm.category,
                  price: Number(priceBySize.sedanSmallCar) || 0,
                  priceBySize,
                  mins: (Number(addForm.durationHours) || 0) * 60,
                  enabled: addForm.status === "Active",
                  consumablesBySize: buildConsumablesBySizePayload(addForm.consumablesBySize),
                };
                setSecurityConfirm({ mode: "password", title: "Add Service", message: "Enter the special password before adding a new service.", onConfirm: async () => { await createService(payload); setSecurityConfirm(null); setPage(1); setIsAddOpen(false); } });
              }}
            >
              <div className="svcModalTitle">Add Service</div>
              <div className="svcFormSection">
                <label className="svcField">
                  <span>Service Name</span>
                  <input value={addForm.name} onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))} required />
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
                    <select value={addForm.category} onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))} required>
                      <option value="" disabled>Select category</option>
                      {CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                {renderPriceFields("add", addForm.priceBySize)}
                <div className="svcFieldGrid">
                  <label className="svcField">
                    <span>Duration (Hrs)</span>
                    <input type="number" min="1" value={addForm.durationHours} onChange={(e) => setAddForm((prev) => ({ ...prev, durationHours: e.target.value }))} required />
                  </label>
                  <label className="svcField">
                    <span>Status</span>
                    <select value={addForm.status} onChange={(e) => setAddForm((prev) => ({ ...prev, status: e.target.value }))} required>
                      <option value="" disabled>Select status</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </label>
                </div>
              </div>
              {renderConsumablesPicker("add", addForm.consumablesBySize)}
              <div className="svcModalActions">
                <button className="svcTextBtn" type="button" onClick={() => setIsAddOpen(false)}>Cancel</button>
                <button className="svcPrimaryBtn" type="submit">Add Service</button>
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
      <SecurityConfirmModal open={Boolean(securityConfirm)} mode={securityConfirm?.mode || "pin"} title={securityConfirm?.title} message={securityConfirm?.message} currentUser={currentUser} onClose={() => setSecurityConfirm(null)} onConfirm={securityConfirm?.onConfirm} />
    </div>
  );
}
