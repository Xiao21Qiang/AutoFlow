import "../../styles/css/staff/staffStockMonitoringStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";
import ToastMessage from "../../components/common/ToastMessage";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const CATEGORY_OPTIONS = ["Coating", "Tinting", "Protection", "Cleaning", "Tools"];
const STOCK_LEGEND = [
  { tone: "danger", label: "Critical", range: "0% - 25%", note: "Needs restock soon" },
  { tone: "warning", label: "Low", range: "26% - 60%", note: "Watch usage level" },
  { tone: "healthy", label: "Healthy", range: "61% - 100%", note: "Stock level is good" },
];

function clampNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getConfiguredMaxStock(value) {
  const maxStock = clampNumber(value);
  return maxStock > 0 ? maxStock : 0;
}

function validateStockLimit({ currentStock, maxStock, qtyToAdd = null }) {
  const nextCurrentStock = clampNumber(currentStock);
  const nextMaxStock = clampNumber(maxStock);
  const configuredMaxStock = getConfiguredMaxStock(nextMaxStock);

  if (nextCurrentStock < 0) {
    return "Current stock quantity cannot be negative.";
  }

  if (nextMaxStock < 0) {
    return "Max stock quantity cannot be negative.";
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

function getStockPercent(item) {
  if (!item.maxStock) return 0;
  return Math.max(0, Math.min(100, Math.round((item.currentStock / item.maxStock) * 100)));
}

function getStockTone(percent) {
  if (percent <= 25) return "danger";
  if (percent <= 60) return "warning";
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
  const [addForm, setAddForm] = useState({
    name: "",
    category: "Coating",
    currentStock: "0",
    maxStock: "0",
    pricePerUnit: "0",
  });

  const selectedItem = useMemo(
    () => stockMonitoring.find((item) => item.id === selectedItemId) || null,
    [stockMonitoring, selectedItemId]
  );

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
      const matchesTone = !filters.stockTone || getStockTone(getStockPercent(item)) === filters.stockTone;
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
  };

  const openEditModal = (item) => {
    setSelectedItemId(item.id);
    setEditForm({
      name: item.name,
      category: item.category,
      currentStock: String(item.currentStock),
      maxStock: String(item.maxStock),
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
    setModal("restock");
  };

  const openDeleteModal = (item) => {
    setSelectedItemId(item.id);
    setModal("delete");
  };

  const openAddModal = () => {
    setSelectedItemId(null);
    setAddForm({
      name: "",
      category: "Coating",
      currentStock: "0",
      maxStock: "0",
      pricePerUnit: "0",
    });
    setModal("add");
  };

  const showToast = (type, message, title) => {
    setToast({ type, message, title, id: Date.now() });
  };

  const getErrorMessage = (error, fallback) => error?.message || fallback;

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    try {
      const validationMessage = validateStockLimit({
        currentStock: editForm.currentStock,
        maxStock: editForm.maxStock,
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
    try {
      await createStockMonitoringItem({
        name: addForm.name.trim(),
        category: addForm.category,
        currentStock: clampNumber(addForm.currentStock),
        maxStock: clampNumber(addForm.maxStock),
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
    }
  };

  const handleRestockSubmit = async (event) => {
    event.preventDefault();
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

      await restockStockMonitoringItem(selectedItem.id, {
        ...restockForm,
        qtyToAdd: clampNumber(restockForm.qtyToAdd),
        costPerUnit: clampNumber(restockForm.costPerUnit),
        supplier: "",
        notes: "",
      });
      showToast("success", "Stock item restocked.");
      closeModal();
    } catch (error) {
      showToast("error", getErrorMessage(error, "Could not restock item."));
    }
  };

  const confirmDelete = () => {
    setSecurityConfirm({
      mode: "pin",
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

        <div className="stInvActions">
          <button className="stInvAddBtn" type="button" onClick={openAddModal}>
            Add New Item
          </button>
        </div>
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
              const tone = getStockTone(percent);

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

            {modal === "add" && (
              <form
                onSubmit={handleAddSubmit}
              >
                <div className="stInvModalTitle stInvModalTitleAdd">Add Stock Monitoring Item</div>

                <label className="stInvField">
                  <span>Item Name</span>
                  <input
                    value={addForm.name}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Ceramic Coating 1L"
                    required
                  />
                </label>

                <label className="stInvField">
                  <span>Category</span>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))}
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
                      value={addForm.currentStock}
                      onChange={(e) =>
                        setAddForm((prev) => ({ ...prev, currentStock: e.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="stInvField">
                    <span>Max Stock (Qty)</span>
                    <input
                      type="number"
                      min="0"
                      value={addForm.maxStock}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, maxStock: e.target.value }))}
                      required
                    />
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
                    required
                  />
                </label>

                <div className="stInvModalActions stInvModalActionsAdd">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="stInvPrimaryBtn" type="submit">
                    Save Item
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
                      onChange={(e) => setRestockForm((prev) => ({ ...prev, qtyToAdd: e.target.value }))}
                      required
                    />
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
                    <span>Cost Per Unit (P)</span>
                    <input
                      type="number"
                      min="0"
                      value={restockForm.costPerUnit}
                      onChange={(e) =>
                        setRestockForm((prev) => ({ ...prev, costPerUnit: e.target.value }))
                      }
                      required
                    />
                  </label>
                </div>

                <div className="stInvModalActions">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="stInvPrimaryBtn" type="submit">
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
        onConfirm={securityConfirm?.onConfirm}
      />
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
