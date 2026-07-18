const { roundMoney } = require("./money");

const EXPENSE_CATEGORIES = Object.freeze([
  "Materials",
  "Utilities",
  "Equipment",
  "Supplies",
  "Marketing",
  "Commissions",
]);

const EXPENSE_CATEGORY_ALIASES = Object.freeze({
  "stock monitoring": "Supplies",
  stock: "Supplies",
  inventory: "Supplies",
  material: "Materials",
  materials: "Materials",
  utilities: "Utilities",
  utility: "Utilities",
  equipment: "Equipment",
  supplies: "Supplies",
  marketing: "Marketing",
  commission: "Commissions",
  commissions: "Commissions",
});

function normalizeExpenseCategory(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (EXPENSE_CATEGORY_ALIASES[key]) return EXPENSE_CATEGORY_ALIASES[key];
  return EXPENSE_CATEGORIES.find((category) => category.toLowerCase() === key) || "";
}

function isValidDateKey(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function normalizeExpensePayload(body = {}, existing = {}) {
  const date = String(body.date ?? existing.date ?? "").trim();
  const description = String(body.description ?? existing.description ?? "").trim().slice(0, 180);
  const note = String(body.note ?? existing.note ?? "").trim().slice(0, 500);
  const category = normalizeExpenseCategory(body.category ?? existing.category ?? "");
  const amount = roundMoney(Number(body.amount ?? existing.amount ?? 0));
  const paidBy = String(body.paidBy ?? existing.paidBy ?? "").trim().slice(0, 120);

  return { date, description, note, category, amount, paidBy };
}

function validateExpensePayload(payload = {}) {
  if (!isValidDateKey(payload.date)) return "Expense date is invalid.";
  if (!payload.description) return "Expense description is required.";
  if (!payload.category) return "Expense category is invalid.";
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) return "Expense amount must be greater than zero.";
  if (!payload.paidBy) return "Paid by is required.";
  return "";
}

function getActiveExpenses(expenses = []) {
  return expenses.filter((expense) => expense && expense.archived !== true);
}

function getActiveExpenseTotal(expenses = []) {
  return roundMoney(getActiveExpenses(expenses).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount || 0)), 0));
}

module.exports = {
  EXPENSE_CATEGORIES,
  getActiveExpenseTotal,
  getActiveExpenses,
  normalizeExpenseCategory,
  normalizeExpensePayload,
  validateExpensePayload,
};
