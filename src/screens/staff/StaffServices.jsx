import "../../styles/css/staff/staffServicesStyle.css";

import { useMemo, useState } from "react";
import FilterModal from "../../components/common/FilterModal";
import { useAdminData } from "../../context/AdminDataContext";
import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";
import { CAR_SIZE_OPTIONS, formatPriceRangeLabel, getServicePriceBySize } from "../../utils/servicePricing";
import {
  formatConsumableSizeLabel,
  normalizeConsumablesBySize,
} from "../../utils/serviceConsumables";
import {
  formatTimeLabel,
  normalizeAllowedArrivalTimes,
} from "../../utils/bookingWorkflow";

const CATEGORY_OPTIONS = ["Coating", "Tinting", "Protection", "Cleaning", "Wash"];

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

function getPriceSizeKey(label) {
  if (label === "Sedan / Small Car") return "sedanSmallCar";
  if (label === "Midsize / Pickup / MPV") return "midsizePickupMpv";
  if (label === "SUV") return "suv";
  return "xlVanSemiTruck";
}

function formatPeso(value) {
  return `P ${Number(value || 0).toLocaleString("en-PH")}`;
}

function getArrivalTimesLabel(service) {
  return normalizeAllowedArrivalTimes(service.allowedArrivalTimes, service.mins)
    .map((time) => formatTimeLabel(time))
    .join(", ");
}

function getPackageComponents(service) {
  const candidates = [
    service?.includedServices,
    service?.packageServices,
    service?.servicesIncluded,
    service?.components,
  ];
  return candidates.find((value) => Array.isArray(value) && value.length > 0) || [];
}

function getComponentLabel(component) {
  if (typeof component === "string") return component;
  return component?.name || component?.serviceName || component?.title || component?.id || "";
}

export default function StaffServices() {
  const { services } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", enabled: "" });
  const [selectedServiceId, setSelectedServiceId] = useState(null);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return services.filter((service) => {
      const matchesQuery = !q || `${service.name} ${service.desc} ${service.category} ${getServiceType(service)}`.toLowerCase().includes(q);
      const matchesCategory = !filters.category || service.category === filters.category;
      const matchesEnabled = !filters.enabled || String(service.enabled) === (filters.enabled === "Enabled" ? "true" : "false");
      return matchesQuery && matchesCategory && matchesEnabled;
    });
  }, [services, query, filters]);

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedService = services.find((service) => String(service.id || "") === String(selectedServiceId || "")) || null;
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

  const renderConsumablesList = (service, className = "stSvcList") => {
    const entries = Object.entries(normalizeConsumablesBySize(service.consumablesBySize, service.consumables));
    return entries.length ? (
      <ul className={className}>
        {entries.map(([name, quantities]) => (
          <li key={name}>{formatConsumableSizeLabel(name, quantities)}</li>
        ))}
      </ul>
    ) : (
      <div className="stSvcEmptyText">No consumables linked.</div>
    );
  };

  const renderPriceBySize = (service) => {
    const priceBySize = getServicePriceBySize(service);
    return (
      <div className="stSvcDetailsGrid">
        {CAR_SIZE_OPTIONS.map((label) => {
          const key = getPriceSizeKey(label);
          return (
            <div className="stSvcDetailsItem" key={label}>
              <span>{label}</span>
              <strong>{formatPeso(priceBySize[key])}</strong>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPackageComponents = (service) => {
    const components = getPackageComponents(service)
      .map(getComponentLabel)
      .map((label) => String(label || "").trim())
      .filter(Boolean);
    if (!components.length) return null;
    return (
      <div className="stSvcDetailsSection">
        <div className="stSvcDetailsSectionTitle">Package Contents</div>
        <ul className="stSvcDetailsList">
          {components.map((label) => <li key={label}>{label}</li>)}
        </ul>
      </div>
    );
  };

  const openDetailsModal = (service) => {
    if (!service?.id) return;
    setSelectedServiceId(service.id);
  };

  const closeDetailsModal = () => {
    setSelectedServiceId(null);
  };

  const renderServiceSection = (title, items) => {
    const section = getSectionDetails(title);
    return items.length ? (
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
                  <button className="stSvcSmallBtn stSvcSmallBtnView" type="button" onClick={() => openDetailsModal(service)}>
                    View Only
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ) : null;
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
      </div>

      <div className="stSvcBoard">
        {hasNoFilteredServices ? (
          <div className="stSvcEmptyState">No services found.</div>
        ) : (
          <>
            {renderServiceSection("Basic Services", pagedBasicServices)}
            {renderServiceSection("Packages", pagedPackages)}
          </>
        )}
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

      {selectedService && (
        <div className="stSvcModalOverlay">
          <div className="stSvcModalCard stSvcDetailsModalCard" role="dialog" aria-modal="true" aria-label={getServiceType(selectedService) === "Package" ? "Package Details" : "Service Details"}>
            <button className="stSvcModalClose" type="button" onClick={closeDetailsModal}>x</button>
            <div className="stSvcModalTitle">{getServiceType(selectedService) === "Package" ? "Package Details" : "Service Details"}</div>

            <div className="stSvcDetailsHeader">
              <div>
                <div className="stSvcDetailsName">{selectedService.name}</div>
                <div className="stSvcDetailsDesc">{selectedService.desc || "No description provided."}</div>
              </div>
              <div className="stSvcDetailsBadges">
                <span className={`stSvcTypeBadge ${getServiceType(selectedService) === "Package" ? "package" : "basic"}`}>{getServiceType(selectedService)}</span>
                {selectedService.category ? <span className="stSvcCategoryBadge">{selectedService.category}</span> : null}
                <span className={`stSvcStatusBadge ${selectedService.enabled ? "enabled" : "disabled"}`}>{selectedService.enabled ? "Enabled" : "Disabled"}</span>
              </div>
            </div>

            <div className="stSvcDetailsSummary">
              <div className="stSvcDetailsItem">
                <span>Price Range</span>
                <strong>{formatPriceRangeLabel(selectedService)}</strong>
              </div>
              <div className="stSvcDetailsItem">
                <span>Duration</span>
                <strong>{selectedService.mins || 0} mins</strong>
              </div>
              <div className="stSvcDetailsItem">
                <span>Required Time of Arrival</span>
                <strong>{getArrivalTimesLabel(selectedService) || "Not configured"}</strong>
              </div>
            </div>

            <div className="stSvcDetailsSection">
              <div className="stSvcDetailsSectionTitle">Price By Car Size</div>
              {renderPriceBySize(selectedService)}
            </div>

            <div className="stSvcDetailsSection">
              <div className="stSvcDetailsSectionTitle">Required Consumables</div>
              <div className="stSvcDetailsConsumables">{renderConsumablesList(selectedService, "stSvcDetailsList")}</div>
            </div>

            {renderPackageComponents(selectedService)}

            <div className="stSvcModalActions">
              <button className="stSvcTextBtn" type="button" onClick={closeDetailsModal}>Close</button>
            </div>
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
