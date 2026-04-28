import "../../styles/css/admin/adminFinancialTrackerStyle.css";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";
import SecurityConfirmModal from "../../components/common/SecurityConfirmModal";

const CATEGORY_COLORS = {
  Materials: "violet",
  Utilities: "cyan",
  Equipment: "amber",
  Supplies: "green",
  Marketing: "pink",
  Commissions: "cyan",
};

const EXPENSE_CATEGORIES = ["Materials", "Utilities", "Equipment", "Supplies", "Marketing", "Commissions"];

function peso(value) {
  return `P${Number(value || 0).toLocaleString("en-PH")}`;
}

function percentOf(value, max) {
  const safeValue = Number(value || 0);
  const safeMax = Number(max || 0);
  if (safeValue <= 0 || safeMax <= 0) return 0;
  return Math.min((safeValue / safeMax) * 100, 100);
}

function createExpenseForm() {
  return {
    date: new Date().toISOString().slice(0, 10),
    description: "",
    note: "",
    category: "Materials",
    amount: "",
    paidBy: "",
  };
}

export default function AdminFinancialTracker() {
  const { expenses, commissions, payments, users, createExpense, currentUser } = useAdminData();
  const [expenseQuery, setExpenseQuery] = useState("");
  const [expenseType, setExpenseType] = useState("All types");
  const [expensePage, setExpensePage] = useState(1);
  const [workerQuery, setWorkerQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [expenseForm, setExpenseForm] = useState(createExpenseForm);
  const [securityConfirm, setSecurityConfirm] = useState(null);
  const aiInterpretationLines = [];
  const isAiFeatureEnabled = false;

  const paidPayments = useMemo(
    () => payments.filter((item) => String(item.status || "").toLowerCase() === "paid"),
    [payments]
  );
  const totalRevenue = useMemo(() => paidPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0), [paidPayments]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0), [expenses]);
  const totalCommissions = useMemo(() => commissions.reduce((sum, item) => sum + Number(item.earned || 0), 0), [commissions]);
  const staffOptions = useMemo(
    () =>
      users
        .filter((user) => String(user.userType || "").toLowerCase() === "staff" && user.name)
        .map((user) => user.name)
        .filter((name, index, list) => list.indexOf(name) === index),
    [users]
  );

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const matchesText = `${item.description} ${item.note} ${item.category} ${item.paidBy}`.toLowerCase().includes(expenseQuery.toLowerCase());
      const matchesType = expenseType === "All types" || item.category === expenseType;
      const matchesFrom = !dateFrom || item.date >= dateFrom;
      const matchesTo = !dateTo || item.date <= dateTo;
      return matchesText && matchesType && matchesFrom && matchesTo;
    });
  }, [expenses, expenseQuery, expenseType, dateFrom, dateTo]);
  const expensePageSize = 5;
  const expenseTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredExpenses.length / expensePageSize)),
    [filteredExpenses.length]
  );
  const safeExpensePage = Math.min(Math.max(expensePage, 1), expenseTotalPages);
  const visibleExpenses = useMemo(
    () => filteredExpenses.slice((safeExpensePage - 1) * expensePageSize, safeExpensePage * expensePageSize),
    [filteredExpenses, safeExpensePage]
  );

  const filteredCommissions = useMemo(() => {
    const normalizedWorker = String(workerQuery || "").trim().toLowerCase();
    return commissions.filter((item) => {
      if (!normalizedWorker) return true;
      return String(item.worker || "").trim().toLowerCase().includes(normalizedWorker);
    });
  }, [commissions, workerQuery]);

  const compareMax = useMemo(() => Math.max(totalRevenue, totalExpenses, 0), [totalRevenue, totalExpenses]);
  const displayedInterpretationLines = aiInterpretationLines;

  const openExpenseModal = () => {
    setExpenseForm(createExpenseForm());
    setFormError("");
    setModal("expense");
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setFormError("");
  };

  const exportPdf = () =>
    exportTabularPdf({
      title: "Financial Tracker Report",
      subtitle: "Revenue, expenses, operational interpretation, and worker commissions.",
      sections: [
        {
          title: "Summary",
          columns: ["Metric", "Value"],
          rows: [
            ["Total Revenue", peso(totalRevenue)],
            ["Total Expenses", peso(totalExpenses)],
            ["Total Commissions", peso(totalCommissions)],
          ],
        },
        {
          title: "Interpretation",
          columns: ["Insight"],
          rows: displayedInterpretationLines.map((line) => [line]),
          emptyMessage: "AI interpretation is temporarily unavailable.",
        },
        {
          title: "Filtered Expenses",
          columns: ["Date", "Description", "Category", "Amount", "Paid By", "Note"],
          rows: filteredExpenses.map((item) => [
            item.date,
            item.description,
            item.category,
            peso(item.amount),
            item.paidBy,
            item.note || "-",
          ]),
          emptyMessage: "No expenses matched the selected filters.",
        },
        {
          title: "Filtered Worker Commissions",
          columns: ["Date", "Worker", "Role", "Service", "Service Value", "Rate", "Earned"],
          rows: filteredCommissions.map((item) => [
            item.date,
            item.worker,
            item.role,
            item.service,
            peso(item.serviceValue),
            `${item.rate}%`,
            peso(item.earned),
          ]),
          emptyMessage: "No commission records matched the selected filters.",
        },
      ],
    });

  const handleExpenseSave = async () => {
    if (!expenseForm.description.trim() || !expenseForm.paidBy.trim()) {
      setFormError("Description and paid by are required.");
      return;
    }

    if (Number(expenseForm.amount || 0) <= 0) {
      setFormError("Expense amount must be greater than zero.");
      return;
    }

    setSaving(true);
    setFormError("");
    setSecurityConfirm({
      mode: "pin",
      title: "Confirm Expense",
      message: "Enter the special PIN before saving this expense.",
      onConfirm: async () => {
        try {
      await createExpense({
        ...expenseForm,
        description: expenseForm.description.trim(),
        note: expenseForm.note.trim(),
        paidBy: expenseForm.paidBy.trim(),
        amount: Number(expenseForm.amount || 0),
      });
      setModal(null);
      setFormError("");
          setSecurityConfirm(null);
        } catch (error) {
          setFormError(error.message || "Failed to save expense.");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <div className="finWrap">
      <div className="finTopBar">
        <div className="finDateFilters">
          <input className="finDateInput" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="finDateInput" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button className="finGhostBtn" type="button" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</button>
        </div>

        <div className="finTopActions">
          <button className="finExportBtn" type="button" onClick={exportPdf}>Export as PDF</button>
          <button className="finPrimaryBtn" type="button" onClick={openExpenseModal}>+ Add Expense</button>
        </div>
      </div>

      <div className="finTopGrid">
        <div className="finCard finExpenseCard">
          <div className="finCardHead">
            <div className="finCardTitle">Daily Expenses</div>
            <div className="finInlineFilters">
              <input className="finSearchInput" placeholder="Search..." value={expenseQuery} onChange={(e) => { setExpenseQuery(e.target.value); setExpensePage(1); }} />
              <select className="finSelect" value={expenseType} onChange={(e) => { setExpenseType(e.target.value); setExpensePage(1); }}>
                <option>All types</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="finExpenseTableWrap">
            <table className="finTable finExpenseTable">
              <colgroup>
                <col />
                <col />
                <col className="finExpenseCategoryCol" />
                <col />
                <col />
                <col />
              </colgroup>
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Paid By</th><th>Actions</th></tr></thead>
              <tbody>
                {visibleExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="finEmptyCell">No expenses matched the selected filters.</td>
                  </tr>
                ) : visibleExpenses.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td><div className="finMainText">{item.description}</div>{item.note && <div className="finSubText">{item.note}</div>}</td>
                    <td><span className={`finTag ${CATEGORY_COLORS[item.category] || "violet"}`}>{item.category}</span></td>
                    <td className="finExpenseAmount">{peso(item.amount)}</td>
                    <td>{item.paidBy}</td>
                    <td><div className="finActionRow"><button className="finTinyEdit" type="button">Saved</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="finFooterStat">Total expenses shown: {peso(visibleExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</div>
          <div className="finMiniPager">
            <button className="finMiniPagerBtn nav" type="button" onClick={() => setExpensePage((prev) => Math.max(1, prev - 1))} disabled={safeExpensePage === 1} aria-label="Previous expense page">
              <span className="finMiniPagerChevron left" aria-hidden="true" />
            </button>
            <div className="finMiniPagerCurrent" aria-label={`Expense page ${safeExpensePage}`}>
              {safeExpensePage}
            </div>
            <button className="finMiniPagerBtn nav" type="button" onClick={() => setExpensePage((prev) => Math.min(expenseTotalPages, prev + 1))} disabled={safeExpensePage === expenseTotalPages} aria-label="Next expense page">
              <span className="finMiniPagerChevron right" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="finRightStack">
          <div className="finCard finCompareCard">
            <div className="finCardHead finCardHeadStack">
              <div>
                <div className="finCardTitle">Revenue vs Expenses</div>
                <div className="finCardSub">A clearer comparison of income and total business expenses.</div>
              </div>
              <div className="finCompareSummary">
                <div className="finCompareChip revenue"><span>Revenue</span><strong>{peso(totalRevenue)}</strong></div>
                <div className="finCompareChip expense"><span>Expenses</span><strong>{peso(totalExpenses)}</strong></div>
              </div>
            </div>
            <div className="finBarList finBarListSpacious">
              <div className="finBarRow"><span>Revenue</span><div className="finBarTrack"><div className={`finBarFill revenue${totalRevenue <= 0 ? " isZero" : ""}`} style={{ width: `${percentOf(totalRevenue, compareMax)}%` }}>{peso(totalRevenue)}</div></div></div>
              <div className="finBarRow"><span>Expenses</span><div className="finBarTrack"><div className={`finBarFill expense${totalExpenses <= 0 ? " isZero" : ""}`} style={{ width: `${percentOf(totalExpenses, compareMax)}%` }}>{peso(totalExpenses)}</div></div></div>
            </div>
          </div>

          <div className="finCard finInterpretationCard">
            <div className="finInterpretationHead">
              <div className="finCardTitle">Interpretation</div>
              <div className="finInterpretationMeta">
                <button
                  className="finInterpretationBtn"
                  type="button"
                  disabled={!isAiFeatureEnabled}
                  title="AI feature coming soon"
                >
                  AI feature coming soon
                </button>
              </div>
            </div>
            <div className="finInterpretationList">
              {displayedInterpretationLines.length === 0 ? (
                <div className="finInterpretationEmpty">AI insights are temporarily unavailable while a hosted provider is being prepared.</div>
              ) : (
                displayedInterpretationLines.map((line) => (
                  <div key={line} className="finInterpretationItem">{line}</div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="finCard finCommissionCard">
        <div className="finCardHead finCardHeadStack finCommissionHead">
          <div>
            <div className="finCardTitle">Worker Commission Log</div>
            <div className="finCardSub">Entries are created automatically when a staff-assigned booking is marked completed. Every completed service gives the assigned staff member a fixed 10% commission.</div>
          </div>
          <div className="finWorkerSearchWrap">
            <input className="finSearchInput finWorkerSearch" placeholder="Search worker..." value={workerQuery} onChange={(e) => setWorkerQuery(e.target.value)} list="fin-worker-list" />
            <datalist id="fin-worker-list">
              {staffOptions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
        </div>

        <table className="finTable finCommissionTable">
          <thead><tr><th>Date</th><th>Worker</th><th>Role</th><th>Service Rendered</th><th>Service Value</th><th>Rate</th><th>Earned</th></tr></thead>
          <tbody>
            {filteredCommissions.length === 0 ? (
              <tr><td colSpan={7}>No commission records yet.</td></tr>
            ) : filteredCommissions.map((item) => (
              <tr key={item.id}><td>{item.date}</td><td>{item.worker}</td><td>{item.role}</td><td>{item.service}</td><td>{peso(item.serviceValue)}</td><td>{item.rate}%</td><td>{peso(item.earned)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "expense" && (
        <div className="finModalOverlay" onClick={closeModal}>
          <div className="finModalCard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="finModalClose" type="button" onClick={closeModal}>x</button>
            <div className="finModalHeader">
              <div className="finModalTitle">Add Expense</div>
              <div className="finModalSub">Record a new business expense for the tracker.</div>
            </div>

            <div className="finModalGrid">
              <label className="finModalField">
                <span>Date</span>
                <input className="finModalInput" type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((prev) => ({ ...prev, date: e.target.value }))} />
              </label>
              <label className="finModalField">
                <span>Paid By</span>
                <input className="finModalInput" value={expenseForm.paidBy} onChange={(e) => setExpenseForm((prev) => ({ ...prev, paidBy: e.target.value }))} placeholder="Admin or petty cash" />
              </label>
              <label className="finModalField finModalFieldWide">
                <span>Description</span>
                <input className="finModalInput" value={expenseForm.description} onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Enter expense description" />
              </label>
              <label className="finModalField">
                <span>Category</span>
                <select className="finModalInput" value={expenseForm.category} onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value }))}>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="finModalField">
                <span>Amount</span>
                <input className="finModalInput" type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0.00" />
              </label>
              <label className="finModalField finModalFieldWide">
                <span>Notes</span>
                <textarea className="finModalTextarea" value={expenseForm.note} onChange={(e) => setExpenseForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional note" />
              </label>
            </div>

            {formError && <div className="finModalError">{formError}</div>}

            <div className="finModalActions">
              <button className="finGhostBtn" type="button" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="finPrimaryBtn" type="button" onClick={handleExpenseSave} disabled={saving}>
                {saving ? "Saving..." : "Save Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
      <SecurityConfirmModal
        open={Boolean(securityConfirm)}
        mode="pin"
        title={securityConfirm?.title}
        message={securityConfirm?.message}
        currentUser={currentUser}
        onClose={() => { setSecurityConfirm(null); setSaving(false); }}
        onConfirm={securityConfirm?.onConfirm}
      />
    </div>
  );
}
