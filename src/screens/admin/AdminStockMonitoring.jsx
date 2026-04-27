import "../../styles/css/admin/adminStockMonitoringStyle.css";
import FilterModal from "../../components/common/FilterModal";
import { useEffect, useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import { requireFreshAdminAuth } from "../../utils/reauth";

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

export default function AdminStockMonitoring({ initialAction = null, onActionHandled }) {
  const { stockMonitoring, createStockMonitoringItem, updateStockMonitoringItem, restockStockMonitoringItem, deleteStockMonitoringItem } = useAdminData();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", stockTone: "" });
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [modal, setModal] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", currentStock: "", maxStock: "", pricePerUnit: "" });
  const [restockForm, setRestockForm] = useState({ date: formatDateInput(), itemName: "", currentStock: "", qtyToAdd: "", restockedBy: "Admin", costPerUnit: "", supplier: "", notes: "" });
  const [addForm, setAddForm] = useState({ name: "", category: "Coating", currentStock: "0", maxStock: "0", pricePerUnit: "0" });
  const [soldForm, setSoldForm] = useState({ date: formatDateInput(), customer: "", itemId: "", qtySold: "1", soldBy: "Admin", notes: "" });

  const selectedItem = stockMonitoring.find((item) => item.id === selectedItemId) || null;
  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return stockMonitoring.filter((item) => {
      const matchesQuery = !q || [item.id, item.name, item.category, item.currentStock, item.maxStock, item.lastRestocked].join(" ").toLowerCase().includes(q);
      const matchesCategory = !filters.category || item.category === filters.category;
      const matchesTone = !filters.stockTone || getStockTone(getStockPercent(item)) === filters.stockTone;
      return matchesQuery && matchesCategory && matchesTone;
    });
  }, [stockMonitoring, query, filters]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
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
          [row.customer, row.itemName, row.category, row.purchaseDate, row.soldBy]
            .join(" ")
            .toLowerCase()
            .includes(q);
        const matchesCategory = !filters.category || row.category === filters.category;
        return matchesQuery && matchesCategory;
      })
      .sort((left, right) => String(right.purchaseDate).localeCompare(String(left.purchaseDate)));
  }, [filters.category, query, stockMonitoring]);
  const selectedSoldItem = soldItemOptions.find((item) => item.id === soldForm.itemId) || null;

  useEffect(() => {
    if (initialAction !== "open-add-stock-item") return;
    setModal("add");
    onActionHandled?.();
  }, [initialAction, onActionHandled]);

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Stock Monitoring Report",
      subtitle: "Filtered stock monitoring records exported in tabular format.",
      sections: [
        {
          columns: ["Item ID", "Item Name", "Category", "Current Stock (Qty)", "Max Stock (Qty)", "Stocks Percentage", "Last Restocked"],
          rows: filtered.map((item) => [
            item.id,
            item.name,
            item.category,
            item.currentStock,
            item.maxStock,
            `${getStockPercent(item)}%`,
            item.lastRestocked || "-",
          ]),
          emptyMessage: "No stock monitoring items found for the selected filters.",
        },
      ],
    });

  return (
    <div className="invWrap">
      <div className="invTopRow">
        <div className="invSearchGroup">
          <div className="invSearchBox"><img className="invSearchIcon" src={icoSearch} alt="" /><input className="invSearchInput" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Items..." /></div>
          <button className="invFilterBtn" type="button" onClick={() => setIsFilterOpen(true)}><img className="invFilterIcon" src={icoFilter} alt="" /></button>
        </div>
        <div className="invActionBtns"><button className="invBtn invBtnDark" type="button" onClick={exportPdf}>Export as PDF</button><button className="invBtn invBtnDark" type="button" onClick={() => setModal("sold")}>Add Sold Item</button><button className="invBtn invBtnGold" type="button" onClick={() => setModal("add")}>Add New Item</button></div>
      </div>

      <div className="invBoard">
        <table className="invTable"><thead><tr className="invGuideHeadRow"><th colSpan={8}><div className="invGuidePanel"><div className="invGuideCopy"><div className="invGuideEyebrow">Stock Status Guide</div><div className="invGuideText">Use the indicator color to quickly understand whether an item is low, needs monitoring, or is still healthy.</div></div><div className="invLegendList">{STOCK_LEGEND.map((item) => (<div key={item.tone} className={`invLegendItem ${item.tone}`}><div className="invLegendBar" aria-hidden="true"><span className={`invLegendBarFill ${item.tone}`} /></div><div className="invLegendMeta"><span className="invLegendLabel">{item.label}</span><span className="invLegendRange">{item.range}</span><span className="invLegendNote">{item.note}</span></div></div>))}</div></div></th></tr><tr><th>Item ID</th><th>Item Name</th><th>Category</th><th>Current Stock (Qty)</th><th>Max Stock (Qty)</th><th>Stocks Percentage</th><th>Last Restocked</th><th>Actions</th></tr></thead><tbody>{paged.map((item) => { const percent = getStockPercent(item); const tone = getStockTone(percent); return <tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{item.category}</td><td className={`invStockValue ${tone}`}>{item.currentStock}</td><td>{item.maxStock}</td><td><div className="invPercentCell"><div className="invPercentTrack"><div className={`invPercentFill ${tone}`} style={{ width: `${percent}%` }} /></div><span>{percent}%</span></div></td><td>{item.lastRestocked}</td><td><div className="invActionStack"><button className="invMiniBtn" type="button" onClick={() => { setSelectedItemId(item.id); setEditForm({ name: item.name, category: item.category, currentStock: String(item.currentStock), maxStock: String(item.maxStock), pricePerUnit: String(item.pricePerUnit) }); setModal("edit"); }}>Edit</button><button className="invMiniBtn" type="button" onClick={() => { setSelectedItemId(item.id); setRestockForm({ date: formatDateInput(), itemName: item.name, currentStock: String(item.currentStock), qtyToAdd: "", restockedBy: "Admin", costPerUnit: String(item.pricePerUnit), supplier: "", notes: "" }); setModal("restock"); }}>Restock</button><button className="invMiniBtn invMiniBtnDanger" type="button" onClick={() => { setSelectedItemId(item.id); setModal("delete"); }}>Delete</button></div></td></tr>; })}{paged.length === 0 && <tr><td colSpan={8} className="invEmptyRow">No items found.</td></tr>}</tbody></table></div>

      <div className="invPagerRow"><button className="invPagerBtn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button><span className="invPagerNum">{safePage}</span><button className="invPagerBtn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{">"}</button></div>

      <div className="invSectionBlock">
        <div className="invSectionTitle">Customer Bought Items</div>
        <div className="invSectionSub">Monitoring log of sold items deducted from current inventory.</div>
      </div>

      <div className="invBoard invBoardSecondary">
        <table className="invTable">
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
                <td className={`invStockValue ${row.tone}`}>{row.remainingStock}</td>
                <td>
                  <div className="invPercentCell">
                    <div className="invPercentTrack">
                      <div className={`invPercentFill ${row.tone}`} style={{ width: `${row.percent}%` }} />
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
                <td colSpan={8} className="invEmptyRow">No sold items found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "edit" && selectedItem && <div className="invModalOverlay"><div className="invModalCard"><button className="invModalClose" type="button" onClick={() => setModal(null)}>x</button><form onSubmit={(e) => { e.preventDefault(); updateStockMonitoringItem(selectedItem.id, { ...selectedItem, name: editForm.name.trim(), category: editForm.category, currentStock: clampNumber(editForm.currentStock), maxStock: clampNumber(editForm.maxStock), pricePerUnit: clampNumber(editForm.pricePerUnit) }); setModal(null); }}><div className="invModalTitle">Edit Stock Monitoring Item</div><label className="invField"><span>Item Name</span><input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required /></label><label className="invField"><span>Category</span><select value={editForm.category} onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}>{CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><div className="invFieldGrid"><label className="invField"><span>Current Stock (Qty)</span><input type="number" value={editForm.currentStock} onChange={(e) => setEditForm((prev) => ({ ...prev, currentStock: e.target.value }))} /></label><label className="invField"><span>Max Stock (Qty)</span><input type="number" value={editForm.maxStock} onChange={(e) => setEditForm((prev) => ({ ...prev, maxStock: e.target.value }))} /></label></div><label className="invField"><span>Price Per Unit (P)</span><input type="number" value={editForm.pricePerUnit} onChange={(e) => setEditForm((prev) => ({ ...prev, pricePerUnit: e.target.value }))} /></label><div className="invModalActions"><button className="invTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="invPrimaryBtn" type="submit">Save Item</button></div></form></div></div>}

      {modal === "restock" && selectedItem && <div className="invModalOverlay"><div className="invModalCard"><button className="invModalClose" type="button" onClick={() => setModal(null)}>x</button><form onSubmit={(e) => { e.preventDefault(); restockStockMonitoringItem(selectedItem.id, { ...restockForm, qtyToAdd: clampNumber(restockForm.qtyToAdd), costPerUnit: clampNumber(restockForm.costPerUnit) }); setModal(null); }}><div className="invModalTitle">Restock Item</div><label className="invField"><span>Date</span><input type="date" value={restockForm.date} readOnly /></label><label className="invField"><span>Quantity to Add</span><input type="number" value={restockForm.qtyToAdd} onChange={(e) => setRestockForm((prev) => ({ ...prev, qtyToAdd: e.target.value }))} /></label><label className="invField"><span>Cost Per Unit</span><input type="number" value={restockForm.costPerUnit} onChange={(e) => setRestockForm((prev) => ({ ...prev, costPerUnit: e.target.value }))} /></label><label className="invField"><span>Supplier</span><input value={restockForm.supplier} onChange={(e) => setRestockForm((prev) => ({ ...prev, supplier: e.target.value }))} /></label><label className="invField"><span>Notes</span><textarea rows="3" value={restockForm.notes} onChange={(e) => setRestockForm((prev) => ({ ...prev, notes: e.target.value }))} /></label><div className="invModalActions"><button className="invTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="invPrimaryBtn" type="submit">Save Restock</button></div></form></div></div>}

      {modal === "add" && <div className="invModalOverlay"><div className="invModalCard"><button className="invModalClose" type="button" onClick={() => setModal(null)}>x</button><form onSubmit={(e) => { e.preventDefault(); createStockMonitoringItem({ name: addForm.name.trim(), category: addForm.category, currentStock: clampNumber(addForm.currentStock), maxStock: clampNumber(addForm.maxStock), pricePerUnit: clampNumber(addForm.pricePerUnit), lastRestocked: formatDateInput(), restockHistory: [], soldHistory: [] }); setPage(1); setModal(null); }}><div className="invModalTitle invModalTitleAdd">Add Item</div><label className="invField"><span>Item Name</span><input value={addForm.name} onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))} required /></label><label className="invField"><span>Category</span><select value={addForm.category} onChange={(e) => setAddForm((prev) => ({ ...prev, category: e.target.value }))}>{CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><div className="invFieldGrid"><label className="invField"><span>Current Stock (Qty)</span><input type="number" value={addForm.currentStock} onChange={(e) => setAddForm((prev) => ({ ...prev, currentStock: e.target.value }))} /></label><label className="invField"><span>Max Stock (Qty)</span><input type="number" value={addForm.maxStock} onChange={(e) => setAddForm((prev) => ({ ...prev, maxStock: e.target.value }))} /></label></div><label className="invField"><span>Price Per Unit (P)</span><input type="number" value={addForm.pricePerUnit} onChange={(e) => setAddForm((prev) => ({ ...prev, pricePerUnit: e.target.value }))} /></label><div className="invModalActions invModalActionsAdd"><button className="invTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="invPrimaryBtn" type="submit">Add Item</button></div></form></div></div>}

      {modal === "sold" && <div className="invModalOverlay"><div className="invModalCard"><button className="invModalClose" type="button" onClick={() => setModal(null)}>x</button><form onSubmit={(e) => { e.preventDefault(); if (!selectedSoldItem) return; const qtySold = Math.max(1, clampNumber(soldForm.qtySold)); const remainingStock = Math.max(0, selectedSoldItem.currentStock - qtySold); if (qtySold > selectedSoldItem.currentStock) return; const baseItem = stockMonitoring.find((item) => item.id === selectedSoldItem.id); if (!baseItem) return; updateStockMonitoringItem(baseItem.id, { ...baseItem, currentStock: remainingStock, soldHistory: [...(baseItem.soldHistory || []), { date: soldForm.date, customer: soldForm.customer.trim(), qtySold, soldBy: soldForm.soldBy.trim() || "Admin", notes: soldForm.notes.trim(), remainingStockAfterSale: remainingStock }] }); setSoldForm({ date: formatDateInput(), customer: "", itemId: "", qtySold: "1", soldBy: "Admin", notes: "" }); setModal(null); }}><div className="invModalTitle">Add Sold Item</div><label className="invField"><span>Purchase Date</span><input type="date" value={soldForm.date} onChange={(e) => setSoldForm((prev) => ({ ...prev, date: e.target.value }))} required /></label><label className="invField"><span>Customer Name</span><input value={soldForm.customer} onChange={(e) => setSoldForm((prev) => ({ ...prev, customer: e.target.value }))} required /></label><label className="invField"><span>Item</span><select value={soldForm.itemId} onChange={(e) => setSoldForm((prev) => ({ ...prev, itemId: e.target.value }))} required><option value="" disabled>Select item</option>{soldItemOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currentStock} left)</option>)}</select></label><div className="invFieldGrid"><label className="invField"><span>Qty Sold</span><input type="number" min="1" value={soldForm.qtySold} onChange={(e) => setSoldForm((prev) => ({ ...prev, qtySold: e.target.value }))} required /></label><label className="invField"><span>Sold By</span><input value={soldForm.soldBy} onChange={(e) => setSoldForm((prev) => ({ ...prev, soldBy: e.target.value }))} required /></label></div><label className="invField"><span>Notes</span><textarea rows="3" value={soldForm.notes} onChange={(e) => setSoldForm((prev) => ({ ...prev, notes: e.target.value }))} /></label>{selectedSoldItem && <div className="invModalMeta"><div>Current Stock: {selectedSoldItem.currentStock}</div><div>Remaining After Sale: {Math.max(0, selectedSoldItem.currentStock - clampNumber(soldForm.qtySold))}</div>{clampNumber(soldForm.qtySold) > selectedSoldItem.currentStock && <div>Quantity sold cannot be greater than current stock.</div>}</div>}<div className="invModalActions"><button className="invTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="invPrimaryBtn" type="submit" disabled={!selectedSoldItem || clampNumber(soldForm.qtySold) > selectedSoldItem.currentStock}>Save Sold Item</button></div></form></div></div>}

      {modal === "delete" && selectedItem && <div className="invModalOverlay"><div className="invModalCard deleteMode"><button className="invModalClose" type="button" onClick={() => setModal(null)}>x</button><div className="invModalTitle">Delete Stock Monitoring Item</div><p className="usersConfirmText">Delete {selectedItem.name}? This action cannot be undone.</p><div className="invModalActions"><button className="invTextBtn" type="button" onClick={() => setModal(null)}>Cancel</button><button className="invPrimaryBtn" type="button" onClick={() => { if (!requireFreshAdminAuth("delete-stock-item")) return; deleteStockMonitoringItem(selectedItem.id); setPage(1); setModal(null); }}>Delete</button></div></div></div>}

      <FilterModal open={isFilterOpen} title="Filter Stock Monitoring" fields={[{ key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS }, { key: "stockTone", label: "Stock Status", type: "select", options: ["danger", "warning", "healthy"] }]} values={filters} onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))} onClose={() => setIsFilterOpen(false)} onApply={() => { setPage(1); setIsFilterOpen(false); }} onReset={() => { setFilters({ category: "", stockTone: "" }); setPage(1); }} />
    </div>
  );
}
