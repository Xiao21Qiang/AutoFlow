import "../../styles/css/staff/staffStockMonitoringStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";
import { ACTION_KEYS, canPerformAction } from "../../utils/rbac";
import { getStockPercent as getSharedStockPercent, getStockState } from "../../utils/businessMetrics";
import { getRestockFieldErrors, isRestockFormReady, parsePositiveFiniteNumber } from "../../utils/stockRestockValidation";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const CATEGORY_OPTIONS = ["Coating", "Tinting", "Protection", "Cleaning", "Tools"];
const STOCK_LEGEND = [
  { tone: "danger", label: "Critical", range: "At or below half reorder level", note: "Needs restock soon" },
  { tone: "warning", label: "Low", range: "At or below reorder level", note: "Watch usage level" },
  { tone: "healthy", label: "Healthy", range: "Above reorder level", note: "Stock level is good" },
];
const EMPTY_ADD_STOCK_FORM = { name: "", category: "Coating", currentStock: "0", maxStock: "0", reorderLevel: "0", pricePerUnit: "0" };
const ADD_STOCK_FIELDS = ["name", "category", "currentStock", "maxStock", "reorderLevel", "pricePerUnit"];

function clampNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getConfiguredMaxStock(value) {
  const maxStock = clampNumber(value);
  return maxStock > 0 ? maxStock : 0;
}

function validateStockLimit({ currentStock, maxStock, reorderLevel = null, qtyToAdd = null }) {
  const nextCurrentStock = clampNumber(currentStock);
  const nextMaxStock = clampNumber(maxStock);
  const nextReorderLevel = reorderLevel === null || reorderLevel === "" ? null : clampNumber(reorderLevel);
  const configuredMaxStock = getConfiguredMaxStock(nextMaxStock);

  if (nextCurrentStock < 0) {
    return "Current stock quantity cannot be negative.";
  }

  if (nextMaxStock < 0) {
    return "Max stock quantity cannot be negative.";
  }
  if (nextReorderLevel !== null && nextReorderLevel < 0) {
    return "Reorder level cannot be negative.";
  }
  if (configuredMaxStock && nextReorderLevel !== null && nextReorderLevel > configuredMaxStock) {
    return `Reorder level cannot exceed the max stock quantity of ${configuredMaxStock}.`;
  }

  if (qtyToAdd !== null) {
    const nextQtyToAdd = clampNumber(qtyToAdd);
    if (nextQtyToAdd <= 0) {
      return "Restock quantity must be greater than zero.";
    }

    if (configuredMaxStock && nextCurrentStock + nextQtyToAdd > configuredMaxStock) {
      return `This restock would exceed the max stock quantity of ${configuredMaxStock}.`;
    }

    return "";
  }

  if (configuredMaxStock && nextCurrentStock > configuredMaxStock) {
    return `Current stock quantity cannot exceed the max stock quantity of ${configuredMaxStock}.`;
  }

  return "";
}

function parseRequiredNonNegativeNumber(value, label) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return { value: 0, error: `${label} is required.` };
  const number = Number(rawValue);
  if (!Number.isFinite(number)) return { value: 0, error: `${label} must be a valid number.` };
  if (number < 0) return { value: number, error: `${label} cannot be negative.` };
  return { value: number, error: "" };
}

function getAddStockFieldErrors(form = {}) {
  const errors = {};
  if (!String(form.name || "").trim()) {
    errors.name = "Item name is required.";
  }
  if (!CATEGORY_OPTIONS.includes(String(form.category || "").trim())) {
    errors.category = "Please select a valid category.";
  }

  const currentStock = parseRequiredNonNegativeNumber(form.currentStock, "Current stock quantity");
  const maxStock = parseRequiredNonNegativeNumber(form.maxStock, "Max stock quantity");
  const reorderLevel = parseRequiredNonNegativeNumber(form.reorderLevel, "Reorder level");
  const pricePerUnit = parseRequiredNonNegativeNumber(form.pricePerUnit, "Price per unit");

  if (currentStock.error) errors.currentStock = currentStock.error;
  if (maxStock.error) errors.maxStock = maxStock.error;
  if (reorderLevel.error) errors.reorderLevel = reorderLevel.error;
  if (pricePerUnit.error) errors.pricePerUnit = pricePerUnit.error;

  if (!currentStock.error && !maxStock.error && !reorderLevel.error) {
    const stockLimitError = validateStockLimit({
      currentStock: currentStock.value,
      maxStock: maxStock.value,
      reorderLevel: reorderLevel.value,
    });
    if (stockLimitError) {
      if (stockLimitError.includes("Current stock")) errors.currentStock = stockLimitError;
      else if (stockLimitError.includes("Max stock")) errors.maxStock = stockLimitError;
      else if (stockLimitError.includes("Reorder level")) errors.reorderLevel = stockLimitError;
      else errors.currentStock = stockLimitError;
    }
  }

  return errors;
}

function getStockPercent(item) {
  return getSharedStockPercent(item);
}

function getStockTone(item = null) {
  const state = item ? getStockState(item) : null;
  if (state?.key === "out") return "danger";
  if (state?.key === "critical") return "danger";
  if (state?.key === "low") return "warning";
  if (state?.key === "healthy") return "healthy";
  return "healthy";
}

function formatDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function StaffStockMonitoring() {
  const {
    stockMonitoring,
    currentUser,
    createStockMonitoringItem,
    updateStockMonitoringItem,
    restockStockMonitoringItem,
    deleteStockMonitoringItem,
  } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", stockTone: "" });
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [modal, setModal] = useState(null);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    currentStock: "",
    maxStock: "",
    reorderLevel: "",
    pricePerUnit: "",
  });
  const [restockForm, setRestockForm] = useState({
    date: formatDateInput(),
    itemName: "",
    currentStock: "",
    qtyToAdd: "",
    restockedBy: "Staff",
    costPerUnit: "",
    supplier: "",
    notes: "",
  });
  const [restockTouchedFields, setRestockTouchedFields] = useState({});
  const [restockSubmitAttempted, setRestockSubmitAttempted] = useState(false);
  const [isRestockSubmitting, setIsRestockSubmitting] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_STOCK_FORM);
  const [addTouchedFields, setAddTouchedFields] = useState({});
  const [addSubmitAttempted, setAddSubmitAttempted] = useState(false);
  const [isAddSubmitting, setIsAddSubmitting] = useState(false);

  const selectedItem = useMemo(
    () => stockMonitoring.find((item) => item.id === selectedItemId) || null,
    [stockMonitoring, selectedItemId]
  );
  const canCreateStock = canPerformAction(currentUser, ACTION_KEYS.stockCreate);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return stockMonitoring.filter((item) => {
      const matchesQuery =
        !q ||
        [item.id, item.name, item.category, item.currentStock, item.maxStock, item.lastRestocked]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchesCategory = !filters.category || item.category === filters.category;
      const matchesTone = !filters.stockTone || getStockTone(item) === filters.stockTone;
      return matchesQuery && matchesCategory && matchesTone;
    });
  }, [stockMonitoring, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const closeModal = () => {
    setModal(null);
    setSelectedItemId(null);
    setRestockTouchedFields({});
    setRestockSubmitAttempted(false);
    setIsRestockSubmitting(false);
    setAddTouchedFields({});
    setAddSubmitAttempted(false);
    setIsAddSubmitting(false);
  };

  const openEditModal = (item) => {
    setSelectedItemId(item.id);
    setEditForm({
      name: item.name,
      category: item.category,
      currentStock: String(item.currentStock),
      maxStock: String(item.maxStock),
      reorderLevel: String(item.reorderLevel ?? ""),
      pricePerUnit: String(item.pricePerUnit),
    });
    setModal("edit");
  };

  const openRestockModal = (item) => {
    setSelectedItemId(item.id);
    setRestockForm({
      date: formatDateInput(),
      itemName: item.name,
      currentStock: String(item.currentStock),
      qtyToAdd: "",
      restockedBy: "Staff",
      costPerUnit: String(item.pricePerUnit),
      supplier: "",
      notes: "",
    });
    setRestockTouchedFields({});
    setRestockSubmitAttempted(false);
    setIsRestockSubmitting(false);
    setModal("restock");
  };

  const openDeleteModal = (item) => {
    setSelectedItemId(item.id);
    setModal("delete");
  };

  const openAddModal = () => {
    setSelectedItemId(null);
    setAddForm(EMPTY_ADD_STOCK_FORM);
    setAddTouchedFields({});
    setAddSubmitAttempted(false);
    setIsAddSubmitting(false);
    setModal("add");
  };

  const showToast = (type, message, title) => {
    setToast({ type, message, title, id: Date.now() });
  };

  const getErrorMessage = (error, fallback) => error?.message || fallback;

  const markRestockFieldTouched = (field) => {
    setRestockTouchedFields((prev) => ({ ...prev, [field]: true }));
  };

  const restockFieldErrors = getRestockFieldErrors(restockForm);
  const restockQuantityError = restockTouchedFields.qtyToAdd || restockSubmitAttempted ? restockFieldErrors.qtyToAdd : "";
  const restockUnitCostError = restockTouchedFields.costPerUnit || restockSubmitAttempted ? restockFieldErrors.costPerUnit : "";
  const isSaveRestockDisabled = isRestockSubmitting || !isRestockFormReady(restockForm);
  const addFieldErrors = getAddStockFieldErrors(addForm);
  const getAddFieldError = (field) => (
    addTouchedFields[field] || addSubmitAttempted ? addFieldErrors[field] || "" : ""
  );
  const markAddFieldTouched = (field) => {
    setAddTouchedFields((prev) => ({ ...prev, [field]: true }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    try {
      const validationMessage = validateStockLimit({
        currentStock: editForm.currentStock,
        maxStock: editForm.maxStock,
        reorderLevel: editForm.reorderLevel,
      });
      if (validationMessage) {
        showToast("error", validationMessage);
        return;
      }

      await updateStockMonitoringItem(selectedItem.id, {
        ...selectedItem,
        name: editForm.name.trim(),
        category: editForm.category,
        currentStock: clampNumber(editForm.currentStock),
        maxStock: clampNumber(editForm.maxStock),
        reorderLevel: clampNumber(editForm.reorderLevel),
        pricePerUnit: clampNumber(editForm.pricePerUnit),
      });
      showToast("success", "Stock item updated.");
      closeModal();
    } catch (error) {
      showToast("error", getErrorMessage(error, "Could not update stock item."));
    }
  };

  const handleAddSubmit = async (event) => {
    event.preventDefault();
    setAddSubmitAttempted(true);
    setAddTouchedFields(Object.fromEntries(ADD_STOCK_FIELDS.map((field) => [field, true])));
    if (isAddSubmitting) return;
    if (Object.keys(addFieldErrors).length > 0) {
      return;
    }
    try {
      setIsAddSubmitting(true);
      await createStockMonitoringItem({
        name: addForm.name.trim().replace(/\s+/g, " "),
        category: addForm.category,
        currentStock: clampNumber(addForm.currentStock),
        maxStock: clampNumber(addForm.maxStock),
        reorderLevel: clampNumber(addForm.reorderLevel),
        pricePerUnit: clampNumber(addForm.pricePerUnit),
        lastRestocked: formatDateInput(),
        restockHistory: [],
        soldHistory: [],
      });
      setPage(1);
      showToast("success", "Stock item added.");
      closeModal();
    } catch (error) {
      showToast("error", getErrorMessage(error, "Could not add stock item."));
    } finally {
      setIsAddSubmitting(false);
    }
  };

  const handleRestockSubmit = async (event) => {
    event.preventDefault();
    setRestockSubmitAttempted(true);
    setRestockTouchedFields({ qtyToAdd: true, costPerUnit: true });
    if (!isRestockFormReady(restockForm)) {
      return;
    }
    try {
      const validationMessage = validateStockLimit({
        currentStock: selectedItem?.currentStock,
        maxStock: selectedItem?.maxStock,
        qtyToAdd: restockForm.qtyToAdd,
      });
      if (validationMessage) {
        showToast("error", validationMessage);
        return;
      }

      setIsRestockSubmitting(true);
      await restockStockMonitoringItem(selectedItem.id, {
        ...restockForm,
        qtyToAdd: parsePositiveFiniteNumber(restockForm.qtyToAdd).value,
        costPerUnit: parsePositiveFiniteNumber(restockForm.costPerUnit).value,
        supplier: "",
        notes: "",
      });
      showToast("success", "Stock item restocked.");
      closeModal();
    } catch (error) {
      showToast("error", getErrorMessage(error, "Could not restock item."));
    } finally {
      setIsRestockSubmitting(false);
    }
  };

  const confirmDelete = () => {
    setSecurityConfirm({
      mode: "pin",
      actionKey: ACTION_KEYS.stockManage,
      title: "Delete Stock Item",
      message: "Enter the staff special PIN before deleting this stock item.",
      onConfirm: async ({ secret }) => {
        try {
          await deleteStockMonitoringItem(selectedItem.id, { specialPin: secret });
          setSecurityConfirm(null);
          setPage(1);
          showToast("success", "Stock item deleted.");
          closeModal();
        } catch (error) {
          showToast("error", getErrorMessage(error, "Could not delete stock item."));
          throw error;
        }
      },
    });
  };

  return (
    <div className="stInvWrap">
      <div className="stInvTop">
        <div className="stInvSearchGroup">
          <div className="stInvSearchBox">
            <img src={icoSearch} alt="" className="stInvSearchIcon" />
            <input
              className="stInvSearchInput"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search Items..."
            />
          </div>
          <button className="stInvFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}>
            <img src={icoFilter} alt="" className="stInvFilterIcon" />
          </button>
        </div>

        {canCreateStock ? (
          <div className="stInvActions">
            <button className="stInvAddBtn" type="button" onClick={openAddModal}>
              Add New Item
            </button>
          </div>
        ) : null}
      </div>

      <div className="stInvCard">
        <table className="stInvTbl">
          <thead>
            <tr className="stInvGuideHeadRow">
              <th colSpan={8}>
                <div className="stInvGuidePanel">
                  <div className="stInvGuideCopy">
                    <div className="stInvGuideEyebrow">Stock Status Guide</div>
                    <div className="stInvGuideText">Use the indicator color to quickly understand whether an item is critical, low, or still healthy.</div>
                  </div>
                  <div className="stInvLegendList">
                    {STOCK_LEGEND.map((item) => (
                      <div key={item.tone} className={`stInvLegendItem ${item.tone}`}>
                        <div className="stInvLegendBar" aria-hidden="true">
                          <span className={`stInvLegendBarFill ${item.tone}`} />
                        </div>
                        <div className="stInvLegendMeta">
                          <span className="stInvLegendLabel">{item.label}</span>
                          <span className="stInvLegendRange">{item.range}</span>
                          <span className="stInvLegendNote">{item.note}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </th>
            </tr>
            <tr>
              <th>Item ID</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Current Stock (Qty)</th>
              <th>Max Stock (Qty)</th>
              <th>Stocks Percentage</th>
              <th>Last Restocked</th>
              <th className="stInvColActions">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paged.map((item) => {
              const percent = getStockPercent(item);
              const tone = getStockTone(item);

              return (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td className={`stInvStockValue ${tone}`}>{item.currentStock}</td>
                  <td>{item.maxStock}</td>
                  <td>
                    <div className="stInvPercentCell">
                      <div className="stInvPercentTrack">
                        <div className={`stInvPercentFill ${tone}`} style={{ width: `${percent}%` }} />
                      </div>
                      <span>{percent}%</span>
                    </div>
                  </td>
                  <td>{item.lastRestocked}</td>
                  <td className="stInvColActions">
                    <div className="stInvActionStack">
                      <button className="stInvMiniBtn" type="button" onClick={() => openEditModal(item)}>
                        Edit
                      </button>
                      <button
                        className="stInvMiniBtn"
                        type="button"
                        onClick={() => openRestockModal(item)}
                      >
                        Restock
                      </button>
                      <button
                        className="stInvMiniBtn stInvMiniBtnDanger"
                        type="button"
                        onClick={() => openDeleteModal(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="stInvEmpty">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="stInvPagerRow">
        <button
          className="stInvPagerBtn"
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          {"<"}
        </button>
        <span className="stInvPagerNum">{safePage}</span>
        <button
          className="stInvPagerBtn"
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          {">"}
        </button>
      </div>

      {modal && (
        <div className="stInvModalOverlay" onClick={closeModal}>
          <div
            className={`stInvModalCard ${modal === "delete" ? "deleteMode" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="stInvModalClose" type="button" onClick={closeModal}>
              x
            </button>

            {modal === "edit" && selectedItem && (
              <form
                onSubmit={handleEditSubmit}
              >
                <div className="stInvModalTitle">Edit Stock Monitoring Item</div>

                <label className="stInvField">
                  <span>Item Name</span>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>

                <label className="stInvField">
                  <span>Category</span>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                    required
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="stInvFieldGrid">
                  <label className="stInvField">
                    <span>Current Stock (Qty)</span>
                    <input
                      type="number"
                      min="0"
                      value={editForm.currentStock}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, currentStock: e.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="stInvField">
                    <span>Max Stock (Qty)</span>
                    <input
                      type="number"
                      min="0"
                      value={editForm.maxStock}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, maxStock: e.target.value }))}
                      required
                    />
                  </label>

                  <label className="stInvField">
                    <span>Reorder Level</span>
                    <input
                      type="number"
                      min="0"
                      value={editForm.reorderLevel}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, reorderLevel: e.target.value }))}
                      required
                    />
                  </label>
                </div>

                <label className="stInvField">
                  <span>Price Per Unit (P)</span>
                  <input
                    type="number"
                    min="0"
                    value={editForm.pricePerUnit}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, pricePerUnit: e.target.value }))
                    }
                    required
                  />
                </label>

                <div className="stInvModalMeta">
                  <div>Item ID: {selectedItem.id}</div>
                  <div>Last Restocked: {selectedItem.lastRestocked}</div>
                  <div>Current Fill: {getStockPercent(selectedItem)}%</div>
                </div>

                <div className="stInvModalActions">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="stInvPrimaryBtn" type="submit">
                    Save Item
                  </button>
                </div>
              </form>
            )}

            {modal === "add" && canCreateStock && (
              <form
                onSubmit={handleAddSubmit}
              >
                <div className="stInvModalTitle stInvModalTitleAdd">Add Stock Monitoring Item</div>

                <label className="stInvField">
                  <span>Item Name</span>
                  <input
                    value={addForm.name}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                    onBlur={() => markAddFieldTouched("name")}
                    placeholder="e.g. Ceramic Coating 1L"
                    aria-invalid={getAddFieldError("name") ? "true" : undefined}
                    aria-describedby={getAddFieldError("name") ? "staff-add-stock-name-error" : undefined}
                    required
                  />
                  {getAddFieldError("name") ? <div className="stInvFieldError" id="staff-add-stock-name-error">{getAddFieldError("name")}</div> : null}
                </label>

                <label className="stInvField">
                  <span>Category</span>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))}
                    onBlur={() => markAddFieldTouched("category")}
                    aria-invalid={getAddFieldError("category") ? "true" : undefined}
                    aria-describedby={getAddFieldError("category") ? "staff-add-stock-category-error" : undefined}
                    required
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {getAddFieldError("category") ? <div className="stInvFieldError" id="staff-add-stock-category-error">{getAddFieldError("category")}</div> : null}
                </label>

                <div className="stInvFieldGrid">
                  <label className="stInvField">
                    <span>Current Stock (Qty)</span>
                    <input
                      type="number"
                      min="0"
                      value={addForm.currentStock}
                      onChange={(e) =>
                        setAddForm((prev) => ({ ...prev, currentStock: e.target.value }))
                      }
                      onBlur={() => markAddFieldTouched("currentStock")}
                      aria-invalid={getAddFieldError("currentStock") ? "true" : undefined}
                      aria-describedby={getAddFieldError("currentStock") ? "staff-add-stock-current-error" : undefined}
                      required
                    />
                    {getAddFieldError("currentStock") ? <div className="stInvFieldError" id="staff-add-stock-current-error">{getAddFieldError("currentStock")}</div> : null}
                  </label>

                  <label className="stInvField">
                    <span>Max Stock (Qty)</span>
                    <input
                      type="number"
                      min="0"
                      value={addForm.maxStock}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, maxStock: e.target.value }))}
                      onBlur={() => markAddFieldTouched("maxStock")}
                      aria-invalid={getAddFieldError("maxStock") ? "true" : undefined}
                      aria-describedby={getAddFieldError("maxStock") ? "staff-add-stock-max-error" : undefined}
                      required
                    />
                    {getAddFieldError("maxStock") ? <div className="stInvFieldError" id="staff-add-stock-max-error">{getAddFieldError("maxStock")}</div> : null}
                  </label>

                  <label className="stInvField">
                    <span>Reorder Level</span>
                    <input
                      type="number"
                      min="0"
                      value={addForm.reorderLevel}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, reorderLevel: e.target.value }))}
                      onBlur={() => markAddFieldTouched("reorderLevel")}
                      aria-invalid={getAddFieldError("reorderLevel") ? "true" : undefined}
                      aria-describedby={getAddFieldError("reorderLevel") ? "staff-add-stock-reorder-error" : undefined}
                      required
                    />
                    {getAddFieldError("reorderLevel") ? <div className="stInvFieldError" id="staff-add-stock-reorder-error">{getAddFieldError("reorderLevel")}</div> : null}
                  </label>
                </div>

                <label className="stInvField">
                  <span>Price Per Unit (P)</span>
                  <input
                    type="number"
                    min="0"
                    value={addForm.pricePerUnit}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, pricePerUnit: e.target.value }))
                    }
                    onBlur={() => markAddFieldTouched("pricePerUnit")}
                    aria-invalid={getAddFieldError("pricePerUnit") ? "true" : undefined}
                    aria-describedby={getAddFieldError("pricePerUnit") ? "staff-add-stock-price-error" : undefined}
                    required
                  />
                  {getAddFieldError("pricePerUnit") ? <div className="stInvFieldError" id="staff-add-stock-price-error">{getAddFieldError("pricePerUnit")}</div> : null}
                </label>

                <div className="stInvModalActions stInvModalActionsAdd">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="stInvPrimaryBtn" type="submit" disabled={isAddSubmitting}>
                    {isAddSubmitting ? "Saving..." : "Save Item"}
                  </button>
                </div>
              </form>
            )}

            {modal === "restock" && selectedItem && (
              <form
                onSubmit={handleRestockSubmit}
              >
                <div className="stInvModalTitle">Restock Stock Monitoring Item</div>

                <label className="stInvField">
                  <span>Date</span>
                  <input type="date" value={restockForm.date} readOnly />
                </label>

                <label className="stInvField">
                  <span>Item</span>
                  <input value={restockForm.itemName} readOnly />
                </label>

                <div className="stInvFieldGrid">
                  <label className="stInvField">
                    <span>Current Stock</span>
                    <input value={restockForm.currentStock} readOnly />
                  </label>

                  <label className="stInvField">
                    <span>Quantity to Add</span>
                    <input
                      type="number"
                      min="1"
                      value={restockForm.qtyToAdd}
                      onBlur={() => markRestockFieldTouched("qtyToAdd")}
                      onChange={(e) => setRestockForm((prev) => ({ ...prev, qtyToAdd: e.target.value }))}
                      aria-invalid={restockQuantityError ? "true" : undefined}
                      aria-describedby={restockQuantityError ? "staff-restock-quantity-error" : undefined}
                      required
                    />
                    {restockQuantityError ? <div className="stInvFieldError" id="staff-restock-quantity-error">{restockQuantityError}</div> : null}
                  </label>
                </div>

                <div className="stInvFieldGrid">
                  <label className="stInvField">
                    <span>Restocked By</span>
                    <input
                      value={restockForm.restockedBy}
                      onChange={(e) =>
                        setRestockForm((prev) => ({ ...prev, restockedBy: e.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="stInvField">
                    <span>Unit Cost</span>
                    <input
                      type="number"
                      min="0"
                      value={restockForm.costPerUnit}
                      onBlur={() => markRestockFieldTouched("costPerUnit")}
                      onChange={(e) =>
                        setRestockForm((prev) => ({ ...prev, costPerUnit: e.target.value }))
                      }
                      aria-invalid={restockUnitCostError ? "true" : undefined}
                      aria-describedby={restockUnitCostError ? "staff-restock-unit-cost-error" : undefined}
                      required
                    />
                    {restockUnitCostError ? <div className="stInvFieldError" id="staff-restock-unit-cost-error">{restockUnitCostError}</div> : null}
                  </label>
                </div>

                <div className="stInvModalActions">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="stInvPrimaryBtn" type="submit" disabled={isSaveRestockDisabled}>
                    Save Restock
                  </button>
                </div>
              </form>
            )}

            {modal === "delete" && selectedItem && (
              <>
                <div className="stInvModalTitle">Delete Stock Monitoring Item</div>
                <p className="stInvDeleteText">
                  Delete {selectedItem.name}? This action cannot be undone.
                </p>
                <div className="stInvModalActions">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    className="stInvPrimaryBtn"
                    type="button"
                    onClick={confirmDelete}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <FilterModal
        open={isFilterOpen}
        title="Filter Stock Monitoring"
        fields={[
          { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
          { key: "stockTone", label: "Stock Status", type: "select", options: ["danger", "warning", "healthy"] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClose={() => setIsFilterOpen(false)}
        onApply={() => {
          setPage(1);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters({ category: "", stockTone: "" });
          setPage(1);
        }}
      />
      <SecurityConfirmModal
        open={Boolean(securityConfirm)}
        mode={securityConfirm?.mode || "pin"}
        title={securityConfirm?.title}
        message={securityConfirm?.message}
        currentUser={currentUser}
        onClose={() => setSecurityConfirm(null)}
        actionKey={securityConfirm?.actionKey}
        onConfirm={securityConfirm?.onConfirm}
      />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
