import "../../styles/css/staff/staffStockMonitoringStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import FilterModal from "../../components/common/FilterModal";

import icoSearch from "../../styles/icons/search.png";
import icoFilter from "../../styles/icons/filter.png";

const CATEGORY_OPTIONS = ["Coating", "Tinting", "Protection", "Cleaning", "Tools"];
const STOCK_LEGEND = [
  { tone: "danger", label: "Low Stock", range: "0% - 25%", note: "Needs restock soon" },
  { tone: "warning", label: "Monitor", range: "26% - 60%", note: "Watch usage level" },
  { tone: "healthy", label: "Healthy", range: "61% - 100%", note: "Stock level is good" },
];

function clampNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const [soldForm, setSoldForm] = useState({
    date: formatDateInput(),
    customer: "",
    itemId: "",
    qtySold: "1",
    soldBy: "Staff",
    notes: "",
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
  const soldItemOptions = useMemo(
    () => stockMonitoring.map((item) => ({ id: item.id, name: item.name, currentStock: Number(item.currentStock || 0), category: item.category })),
    [stockMonitoring]
  );
  const customerBoughtItems = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();

    return stockMonitoring
      .flatMap((item) =>
        (item.soldHistory || []).map((sale, index) => {
          const percent = getStockPercent(item);
          return {
            id: `${item.id}-sale-${index}`,
            customer: sale.customer || "-",
            itemName: item.name,
            category: item.category || "-",
            qtyBought: Number(sale.qtySold || sale.quantity || 0),
            remainingStock: Number(sale.remainingStockAfterSale ?? item.currentStock ?? 0),
            percent,
            tone: getStockTone(percent),
            purchaseDate: sale.date || "-",
            soldBy: sale.soldBy || "-",
          };
        })
      )
      .filter((row) => {
        const matchesQuery =
          !q ||
          [
            row.customer,
            row.itemName,
            row.category,
            row.purchaseDate,
            row.soldBy,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        const matchesCategory = !filters.category || row.category === filters.category;
        return matchesQuery && matchesCategory;
      })
      .sort((left, right) => String(right.purchaseDate).localeCompare(String(left.purchaseDate)));
  }, [filters.category, query, stockMonitoring]);
  const selectedSoldItem = soldItemOptions.find((item) => item.id === soldForm.itemId) || null;

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
          <button className="stInvAddBtn stInvDarkBtn" type="button" onClick={() => setModal("sold")}>
            Add Sold Item
          </button>
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
                    <div className="stInvGuideText">Use the indicator color to quickly understand whether an item is low, needs monitoring, or is still healthy.</div>
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

      <div className="stInvSectionBlock">
        <div className="stInvSectionTitle">Customer Bought Items</div>
        <div className="stInvSectionSub">Monitoring log of sold items deducted from current inventory.</div>
      </div>

      <div className="stInvCard stInvCardSecondary">
        <table className="stInvTbl">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Item Name</th>
              <th>Category</th>
              <th>Qty Bought</th>
              <th>Remaining Stock</th>
              <th>Stocks Percentage</th>
              <th>Purchase Date</th>
              <th>Sold By</th>
            </tr>
          </thead>
          <tbody>
            {customerBoughtItems.map((row) => (
              <tr key={row.id}>
                <td>{row.customer}</td>
                <td>{row.itemName}</td>
                <td>{row.category}</td>
                <td>{row.qtyBought}</td>
                <td className={`stInvStockValue ${row.tone}`}>{row.remainingStock}</td>
                <td>
                  <div className="stInvPercentCell">
                    <div className="stInvPercentTrack">
                      <div className={`stInvPercentFill ${row.tone}`} style={{ width: `${row.percent}%` }} />
                    </div>
                    <span>{row.percent}%</span>
                  </div>
                </td>
                <td>{row.purchaseDate}</td>
                <td>{row.soldBy}</td>
              </tr>
            ))}

            {customerBoughtItems.length === 0 && (
              <tr>
                <td colSpan={8} className="stInvEmpty">
                  No sold items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                onSubmit={(e) => {
                  e.preventDefault();
                  updateStockMonitoringItem(selectedItem.id, {
                    ...selectedItem,
                    name: editForm.name.trim(),
                    category: editForm.category,
                    currentStock: clampNumber(editForm.currentStock),
                    maxStock: clampNumber(editForm.maxStock),
                    pricePerUnit: clampNumber(editForm.pricePerUnit),
                  });
                  closeModal();
                }}
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
                onSubmit={(e) => {
                  e.preventDefault();
                  createStockMonitoringItem({
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
                  closeModal();
                }}
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

            {modal === "sold" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedSoldItem) return;
                  const qtySold = Math.max(1, clampNumber(soldForm.qtySold));
                  const remainingStock = Math.max(0, selectedSoldItem.currentStock - qtySold);
                  if (qtySold > selectedSoldItem.currentStock) return;
                  const baseItem = stockMonitoring.find((item) => item.id === selectedSoldItem.id);
                  if (!baseItem) return;
                  updateStockMonitoringItem(baseItem.id, {
                    ...baseItem,
                    currentStock: remainingStock,
                    soldHistory: [
                      ...(baseItem.soldHistory || []),
                      {
                        date: soldForm.date,
                        customer: soldForm.customer.trim(),
                        qtySold,
                        soldBy: soldForm.soldBy.trim() || "Staff",
                        notes: soldForm.notes.trim(),
                        remainingStockAfterSale: remainingStock,
                      },
                    ],
                  });
                  setSoldForm({ date: formatDateInput(), customer: "", itemId: "", qtySold: "1", soldBy: "Staff", notes: "" });
                  closeModal();
                }}
              >
                <div className="stInvModalTitle">Add Sold Item</div>

                <label className="stInvField">
                  <span>Purchase Date</span>
                  <input type="date" value={soldForm.date} onChange={(e) => setSoldForm((prev) => ({ ...prev, date: e.target.value }))} required />
                </label>

                <label className="stInvField">
                  <span>Customer Name</span>
                  <input value={soldForm.customer} onChange={(e) => setSoldForm((prev) => ({ ...prev, customer: e.target.value }))} required />
                </label>

                <label className="stInvField">
                  <span>Item</span>
                  <select value={soldForm.itemId} onChange={(e) => setSoldForm((prev) => ({ ...prev, itemId: e.target.value }))} required>
                    <option value="" disabled>Select item</option>
                    {soldItemOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.currentStock} left)
                      </option>
                    ))}
                  </select>
                </label>

                <div className="stInvFieldGrid">
                  <label className="stInvField">
                    <span>Qty Sold</span>
                    <input type="number" min="1" value={soldForm.qtySold} onChange={(e) => setSoldForm((prev) => ({ ...prev, qtySold: e.target.value }))} required />
                  </label>

                  <label className="stInvField">
                    <span>Sold By</span>
                    <input value={soldForm.soldBy} onChange={(e) => setSoldForm((prev) => ({ ...prev, soldBy: e.target.value }))} required />
                  </label>
                </div>

                <label className="stInvField">
                  <span>Notes</span>
                  <textarea rows={3} value={soldForm.notes} onChange={(e) => setSoldForm((prev) => ({ ...prev, notes: e.target.value }))} />
                </label>

                {selectedSoldItem && (
                  <div className="stInvModalMeta">
                    <div>Current Stock: {selectedSoldItem.currentStock}</div>
                    <div>Remaining After Sale: {Math.max(0, selectedSoldItem.currentStock - clampNumber(soldForm.qtySold))}</div>
                    {clampNumber(soldForm.qtySold) > selectedSoldItem.currentStock && <div>Quantity sold cannot be greater than current stock.</div>}
                  </div>
                )}

                <div className="stInvModalActions">
                  <button className="stInvTextBtn" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="stInvPrimaryBtn" type="submit" disabled={!selectedSoldItem || clampNumber(soldForm.qtySold) > selectedSoldItem.currentStock}>
                    Save Sold Item
                  </button>
                </div>
              </form>
            )}

            {modal === "restock" && selectedItem && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  restockStockMonitoringItem(selectedItem.id, {
                    ...restockForm,
                    qtyToAdd: clampNumber(restockForm.qtyToAdd),
                    costPerUnit: clampNumber(restockForm.costPerUnit),
                  });
                  closeModal();
                }}
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

                <label className="stInvField">
                  <span>Supplier</span>
                  <input
                    value={restockForm.supplier}
                    onChange={(e) => setRestockForm((prev) => ({ ...prev, supplier: e.target.value }))}
                  />
                </label>

                <label className="stInvField">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={restockForm.notes}
                    onChange={(e) => setRestockForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </label>

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
                    onClick={() => {
                      deleteStockMonitoringItem(selectedItem.id);
                      setPage(1);
                      closeModal();
                    }}
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
    </div>
  );
}
