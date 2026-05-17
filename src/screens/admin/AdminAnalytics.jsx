import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "../../styles/css/admin/adminAnalyticsStyle.css";
import { useAdminData } from "../../context/AdminDataContext";
import { exportTabularPdf } from "../../utils/exportTabularPdf";

const RANGE_TYPES = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: new Date(2026, index, 1).toLocaleString("en-US", { month: "long" }),
}));

const QUARTER_OPTIONS = [
  { value: 1, label: "Q1" },
  { value: 2, label: "Q2" },
  { value: 3, label: "Q3" },
  { value: 4, label: "Q4" },
];

const AI_TEXT_KEYS = ["text", "content", "message", "description", "summary", "value", "insight", "detail", "details", "body"];
const AI_TITLE_KEYS = ["title", "label", "category", "type", "heading", "name"];

const pad2 = (value) => String(value).padStart(2, "0");
const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

function peso(value) {
  return `Php ${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseDateKey(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return parseDate(raw);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, mondayOffset));
}

function endOfWeek(date) {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function startOfMonth(year, monthIndex) {
  return startOfDay(new Date(year, monthIndex, 1));
}

function endOfMonth(year, monthIndex) {
  return endOfDay(new Date(year, monthIndex + 1, 0));
}

function startOfQuarter(year, quarter) {
  return startOfMonth(year, (quarter - 1) * 3);
}

function endOfQuarter(year, quarter) {
  return endOfMonth(year, (quarter - 1) * 3 + 2);
}

function getPaymentTotal(payment = {}) {
  const candidates = [payment.totalAmount, payment.finalAmount, payment.amount, payment.originalAmount];
  for (const value of candidates) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function isPaidStatus(status) {
  return String(status || "").trim().toLowerCase() === "paid";
}

function hasMeaningfulStagedPayment(payment = {}) {
  return Boolean(
    payment.downPaymentRequired === true ||
    Number(payment.downPaymentAmount || 0) > 0 ||
    String(payment.downPaymentStatus || "").trim() ||
    String(payment.finalPaymentStatus || "").trim() ||
    Number(payment.totalAmount || 0) > 0 ||
    Number(payment.amountPaid || 0) > 0
  );
}

function getStageDate(payment = {}, fields = []) {
  for (const field of fields) {
    const date = parseDate(payment[field]);
    if (date) return date;
  }
  return (
    parseDateKey(payment.date) ||
    parseDate(payment.reviewedAt) ||
    parseDate(payment.updatedAt) ||
    parseDate(payment.createdAt) ||
    null
  );
}

function getVerifiedRevenueEventsForPayment(payment = {}) {
  const total = getPaymentTotal(payment);
  const downPaymentAmount = Math.min(total, Math.max(0, Number(payment.downPaymentAmount || 0) || 0));
  const downPaymentPaid = isPaidStatus(payment.downPaymentStatus);
  const finalPaymentPaid = isPaidStatus(payment.finalPaymentStatus);
  const legacyPaid = isPaidStatus(payment.status);
  const staged = hasMeaningfulStagedPayment(payment);
  const events = [];

  if (downPaymentPaid && downPaymentAmount > 0) {
    events.push({
      id: payment.id || payment.bookingId || `down-${events.length}`,
      stage: "Down Payment",
      amount: downPaymentAmount,
      date: getStageDate(payment, ["downPaymentVerifiedAt"]),
      customer: payment.customer || payment.customerEmail || "Customer",
    });
  }

  if (finalPaymentPaid) {
    const finalAmount = downPaymentPaid ? Math.max(0, total - downPaymentAmount) : total;
    if (finalAmount > 0) {
      events.push({
        id: payment.id || payment.bookingId || `final-${events.length}`,
        stage: downPaymentPaid ? "Remaining Balance" : "Full Payment",
        amount: finalAmount,
        date: getStageDate(payment, ["finalPaymentVerifiedAt", "reviewedAt"]),
        customer: payment.customer || payment.customerEmail || "Customer",
      });
    }
  }

  if (legacyPaid && !finalPaymentPaid) {
    const legacyAmount = Math.max(0, (total || Number(payment.amount || 0) || 0) - (downPaymentPaid ? downPaymentAmount : 0));
    if (legacyAmount > 0) {
      events.push({
        id: payment.id || payment.bookingId || `legacy-${events.length}`,
        stage: "Legacy Paid Payment",
        amount: legacyAmount,
        date: getStageDate(payment, ["reviewedAt"]),
        customer: payment.customer || payment.customerEmail || "Customer",
      });
    }
  }

  if (!events.length && legacyPaid && !staged) {
    const legacyAmount = total || Number(payment.amount || 0) || 0;
    if (legacyAmount > 0) {
      events.push({
        id: payment.id || payment.bookingId || `legacy-${events.length}`,
        stage: "Legacy Paid Payment",
        amount: legacyAmount,
        date: getStageDate(payment, ["reviewedAt"]),
        customer: payment.customer || payment.customerEmail || "Customer",
      });
    }
  }

  return events.filter((event) => event.amount > 0 && event.date);
}

function getVerifiedRevenueForPayment(payment = {}) {
  return getVerifiedRevenueEventsForPayment(payment).reduce((sum, event) => sum + event.amount, 0);
}

function getPaymentRevenueDate(payment = {}) {
  const events = getVerifiedRevenueEventsForPayment(payment);
  return events[0]?.date || getStageDate(payment, ["finalPaymentVerifiedAt", "downPaymentVerifiedAt", "reviewedAt"]);
}

function isDateInRange(date, start, end) {
  return date && date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function getRangeConfig(type, controls) {
  const now = new Date();
  const selectedYear = Number(controls.year || now.getFullYear());
  if (type === "monthly") {
    const start = startOfMonth(selectedYear, Number(controls.month || 0));
    return {
      start,
      end: endOfMonth(selectedYear, Number(controls.month || 0)),
      label: start.toLocaleString("en-US", { month: "long", year: "numeric" }),
    };
  }
  if (type === "quarterly") {
    const quarter = Number(controls.quarter || 1);
    return {
      start: startOfQuarter(selectedYear, quarter),
      end: endOfQuarter(selectedYear, quarter),
      label: `Q${quarter} ${selectedYear}`,
    };
  }
  if (type === "annual") {
    return {
      start: startOfDay(new Date(selectedYear, 0, 1)),
      end: endOfDay(new Date(selectedYear, 11, 31)),
      label: String(selectedYear),
    };
  }

  const selectedWeekDate = parseDateKey(controls.weekDate) || now;
  const start = startOfWeek(selectedWeekDate);
  const end = endOfWeek(selectedWeekDate);
  return {
    start,
    end,
    label: `${toDateKey(start)} to ${toDateKey(end)}`,
  };
}

function buildSalesSeries(events, type, range) {
  if (type === "weekly") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(range.start, index);
      const key = toDateKey(date);
      const sales = events
        .filter((event) => toDateKey(event.date) === key)
        .reduce((sum, event) => sum + event.amount, 0);
      return {
        label: date.toLocaleString("en-US", { weekday: "short" }),
        sales,
      };
    });
  }

  if (type === "monthly") {
    const days = range.end.getDate();
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(range.start.getFullYear(), range.start.getMonth(), index + 1);
      const key = toDateKey(date);
      const sales = events
        .filter((event) => toDateKey(event.date) === key)
        .reduce((sum, event) => sum + event.amount, 0);
      return {
        label: String(index + 1),
        sales,
      };
    });
  }

  const monthCount = type === "quarterly" ? 3 : 12;
  const startMonth = type === "quarterly" ? range.start.getMonth() : 0;
  return Array.from({ length: monthCount }, (_, index) => {
    const monthIndex = startMonth + index;
    const start = startOfMonth(range.start.getFullYear(), monthIndex);
    const end = endOfMonth(range.start.getFullYear(), monthIndex);
    const sales = events
      .filter((event) => isDateInRange(event.date, start, end))
      .reduce((sum, event) => sum + event.amount, 0);
    return {
      label: start.toLocaleString("en-US", { month: "short" }),
      sales,
    };
  });
}

function buildPeriodSummary(events, payments, now = new Date()) {
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const periods = [
    { key: "Weekly", ...getRangeConfig("weekly", { weekDate: toDateKey(now) }) },
    { key: "Monthly", ...getRangeConfig("monthly", { month: now.getMonth(), year: now.getFullYear() }) },
    { key: "Quarterly", ...getRangeConfig("quarterly", { quarter, year: now.getFullYear() }) },
    { key: "Annual", ...getRangeConfig("annual", { year: now.getFullYear() }) },
  ];

  return periods.map((period) => {
    const periodEvents = events.filter((event) => isDateInRange(event.date, period.start, period.end));
    const paymentIds = new Set(periodEvents.map((event) => event.id).filter(Boolean));
    const customers = new Set(periodEvents.map((event) => String(event.customer || "").trim().toLowerCase()).filter(Boolean));
    return {
      ...period,
      sales: periodEvents.reduce((sum, event) => sum + event.amount, 0),
      transactions: payments.filter((payment) => paymentIds.has(payment.id || payment.bookingId)).length || paymentIds.size,
      customers: customers.size,
    };
  });
}

function buildRatingDistribution(reviews = []) {
  const counts = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: 0 }));
  reviews.forEach((review) => {
    const rating = Math.round(Number(review.rating || 0));
    if (rating >= 1 && rating <= 5) {
      counts.find((item) => item.rating === rating).count += 1;
    }
  });
  return counts;
}

function createAiState() {
  return {
    status: "idle",
    message: "",
    analysisType: "",
    generatedAt: "",
    items: [],
    summary: "",
    keyObservations: [],
    possibleCauses: [],
    recommendations: [],
    warnings: [],
    model: "",
  };
}

function getObjectField(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim()) {
      return record[key];
    }
  }
  return "";
}

function getAiItemText(item) {
  if (item === undefined || item === null) return "";
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item).replace(/\s+/g, " ").replace(/\[object Object\]/g, "").trim();
  }
  if (Array.isArray(item)) {
    return item.map(getAiItemText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  if (typeof item === "object") {
    const directText = getObjectField(item, AI_TEXT_KEYS);
    if (directText) return getAiItemText(directText);
    return Object.entries(item)
      .map(([key, value]) => {
        if (AI_TITLE_KEYS.includes(key)) return "";
        const text = getAiItemText(value);
        if (!text) return "";
        const label = String(key || "").replace(/[_-]+/g, " ").trim();
        return label ? `${label}: ${text}` : text;
      })
      .filter(Boolean)
      .join("; ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

function titleFromAiType(type, fallbackTitle = "Observation") {
  const normalized = String(type || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return fallbackTitle;
  if (normalized.includes("summary")) return "Summary";
  if (normalized.includes("cause")) return "Possible Cause";
  if (normalized.includes("recommend") || normalized.includes("action")) return "Recommendation";
  if (normalized.includes("warn") || normalized.includes("risk") || normalized.includes("watch")) return "Watchpoint";
  if (normalized.includes("predict")) return "Prediction";
  if (normalized.includes("confidence")) return "Confidence";
  return normalized.split(" ").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || fallbackTitle;
}

function getAiItemTitle(item, fallbackTitle = "Observation") {
  if (!item || typeof item !== "object" || Array.isArray(item)) return fallbackTitle;
  const rawTitle = getObjectField(item, AI_TITLE_KEYS);
  const titleText = getAiItemText(rawTitle);
  return titleText || titleFromAiType(item.type || item.category || item.label, fallbackTitle);
}

function normalizeAiAnalysisItem(item, fallbackTitle = "Observation", fallbackType = "observation") {
  const text = getAiItemText(item);
  if (!text) return null;
  const type = item && typeof item === "object" && !Array.isArray(item)
    ? String(item.type || item.category || item.label || fallbackType).trim().toLowerCase().replace(/[\s-]+/g, "_")
    : fallbackType;
  return {
    type: type || fallbackType,
    title: getAiItemTitle(item, fallbackTitle),
    text,
  };
}

function normalizeAiAnalysisResponse(response = {}, analysisType = "descriptive") {
  const items = [];
  const pushItem = (item, fallbackTitle, fallbackType) => {
    const normalized = normalizeAiAnalysisItem(item, fallbackTitle, fallbackType);
    if (normalized) items.push(normalized);
  };
  const pushList = (values, fallbackTitle, fallbackType) => {
    const list = Array.isArray(values) ? values : values ? [values] : [];
    list.forEach((item) => pushItem(item, fallbackTitle, fallbackType));
  };

  pushList(response.items, "Observation", "observation");
  pushItem(response.summary, "Summary", "summary");
  pushList(response.keyObservations || response.observations || response.insights, "Observation", analysisType === "predictive" ? "prediction" : "observation");
  pushList(response.possibleCauses || response.causes || response.drivers, "Possible Cause", "possible_cause");
  pushList(response.recommendations || response.actions || response.nextSteps, "Recommendation", "recommendation");
  pushList(response.warnings || response.watchpoints || response.risks, analysisType === "predictive" ? "Predictive Watchpoint" : "Watchpoint", "watchpoint");

  const seen = new Set();
  const normalizedItems = items.filter((item) => {
    const key = `${item.type}:${item.title}:${item.text}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const summaryItem = normalizedItems.find((item) => item.type === "summary") || normalizedItems[0] || null;

  return {
    analysisType: response.analysisType || analysisType,
    generatedAt: response.generatedAt || "",
    model: getAiItemText(response.model),
    summary: summaryItem?.text || "",
    items: normalizedItems.length
      ? normalizedItems
      : [{ type: "summary", title: "Summary", text: "No summary available yet." }],
    keyObservations: normalizedItems.filter((item) => ["observation", "prediction", "confidence"].includes(item.type)).map((item) => item.text),
    possibleCauses: normalizedItems.filter((item) => item.type === "possible_cause").map((item) => item.text),
    recommendations: normalizedItems.filter((item) => item.type === "recommendation").map((item) => item.text),
    warnings: normalizedItems.filter((item) => item.type === "watchpoint").map((item) => item.text),
  };
}

function getAiLines(aiState) {
  return normalizeAiAnalysisResponse(aiState, aiState.analysisType || "descriptive")
    .items
    .filter((item) => item.text && item.text !== "No summary available yet.")
    .map((item) => ({ label: item.title, text: item.text, type: item.type }));
}

function AnalyticsAiCard({ title, type, buttonLabel, state, onGenerate }) {
  const lines = useMemo(() => getAiLines(state), [state]);
  const isPredictive = type === "predictive";

  return (
    <section className="anaCard anaAiCard">
      <div className="anaCardHead">
        <div>
          <h3>{title}</h3>
          <p>{isPredictive ? "Forward-looking guidance with cautious confidence." : "A concise readout of what the current data shows."}</p>
        </div>
        <button
          className="anaGoldBtn"
          type="button"
          onClick={onGenerate}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Generating..." : buttonLabel}
        </button>
      </div>
      <div className={`anaAiStatus anaAiStatus-${state.status}`}>
        {state.status === "idle" && (isPredictive ? "Generate a forecast from current sales, booking, service, and review signals." : "Generate a descriptive summary from current analytics data.")}
        {state.status === "loading" && (isPredictive ? "Estimating likely trends from available records..." : "Summarizing current performance and customer behavior...")}
        {state.status === "success" && `AI analysis ready${state.model ? ` - ${state.model}` : ""}`}
        {state.status === "unavailable" && (state.message || "AI unavailable right now.")}
        {state.status === "error" && (state.message || "Unable to generate analysis right now.")}
      </div>
      <div className="anaAiList">
        {lines.length ? (
          lines.map((line, index) => (
            <div key={`${line.label}-${index}-${line.text}`} className="anaAiItem">
              <span>{line.label}</span>
              <p>{line.text}</p>
            </div>
          ))
        ) : (
          <div className="anaEmptyBlock">
            {state.status === "loading" ? "Preparing analysis..." : "No AI analysis generated yet."}
          </div>
        )}
      </div>
    </section>
  );
}

export default function AdminAnalytics() {
  const { payments = [], bookings = [], reviews = [], generateAnalyticsInterpretation } = useAdminData();
  const today = useMemo(() => new Date(), []);
  const availableYears = useMemo(() => {
    const years = new Set([today.getFullYear()]);
    payments.forEach((payment) => {
      getVerifiedRevenueEventsForPayment(payment).forEach((event) => years.add(event.date.getFullYear()));
      const date = getPaymentRevenueDate(payment);
      if (date) years.add(date.getFullYear());
    });
    bookings.forEach((booking) => {
      const date = parseDateKey(booking.date) || parseDate(booking.createdAt);
      if (date) years.add(date.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [bookings, payments, today]);

  const [rangeType, setRangeType] = useState("weekly");
  const [rangeControls, setRangeControls] = useState({
    weekDate: toDateKey(today),
    month: today.getMonth(),
    quarter: Math.floor(today.getMonth() / 3) + 1,
    year: today.getFullYear(),
  });
  const [descriptiveAiState, setDescriptiveAiState] = useState(createAiState);
  const [predictiveAiState, setPredictiveAiState] = useState(createAiState);

  const verifiedRevenueEvents = useMemo(
    () => payments.flatMap((payment) => getVerifiedRevenueEventsForPayment(payment)),
    [payments]
  );
  const totalSales = useMemo(
    () => payments.reduce((sum, payment) => sum + getVerifiedRevenueForPayment(payment), 0),
    [payments]
  );
  const currentRange = useMemo(() => getRangeConfig(rangeType, rangeControls), [rangeType, rangeControls]);
  const selectedRangeEvents = useMemo(
    () => verifiedRevenueEvents.filter((event) => isDateInRange(event.date, currentRange.start, currentRange.end)),
    [currentRange, verifiedRevenueEvents]
  );
  const selectedRangeSales = useMemo(
    () => selectedRangeEvents.reduce((sum, event) => sum + event.amount, 0),
    [selectedRangeEvents]
  );
  const salesSeries = useMemo(
    () => buildSalesSeries(selectedRangeEvents, rangeType, currentRange),
    [currentRange, rangeType, selectedRangeEvents]
  );
  const periodSummary = useMemo(
    () => buildPeriodSummary(verifiedRevenueEvents, payments, today),
    [payments, today, verifiedRevenueEvents]
  );

  const bookingSummary = useMemo(() => {
    const counts = bookings.reduce(
      (accumulator, booking) => {
        const status = String(booking.status || "").trim().toLowerCase();
        if (status === "completed") accumulator.completed += 1;
        else if (status === "cancelled" || status === "canceled") accumulator.cancelled += 1;
        else if (status === "in progress") accumulator.inProgress += 1;
        else accumulator.scheduled += 1;
        return accumulator;
      },
      { completed: 0, cancelled: 0, inProgress: 0, scheduled: 0 }
    );
    return { total: bookings.length, ...counts };
  }, [bookings]);

  const ratingDistribution = useMemo(() => buildRatingDistribution(reviews), [reviews]);
  const totalRatings = useMemo(
    () => ratingDistribution.reduce((sum, item) => sum + item.count, 0),
    [ratingDistribution]
  );
  const avgRating = useMemo(() => {
    if (!totalRatings) return 0;
    const weighted = ratingDistribution.reduce((sum, item) => sum + item.rating * item.count, 0);
    return Math.round((weighted / totalRatings) * 10) / 10;
  }, [ratingDistribution, totalRatings]);
  const ratingStars = useMemo(
    () => Array.from({ length: 5 }, (_, index) => index < Math.round(avgRating)),
    [avgRating]
  );

  const serviceDemand = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      const key = String(booking.service || "Unknown Service").trim() || "Unknown Service";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }, [bookings]);
  const topServices = useMemo(() => serviceDemand.slice(0, 5), [serviceDemand]);
  const bottomServices = useMemo(
    () =>
      serviceDemand
        .slice()
        .sort((left, right) => left.count - right.count || left.name.localeCompare(right.name))
        .slice(0, 5),
    [serviceDemand]
  );

  const analyticsAiPayload = useMemo(
    () => ({
      totals: {
        totalSales,
        selectedRangeSales,
        selectedRange: currentRange.label,
        totalBookings: bookingSummary.total,
        completedBookings: bookingSummary.completed,
        inProgressBookings: bookingSummary.inProgress,
        avgRating,
        totalReviews: totalRatings,
        paidRevenueEvents: verifiedRevenueEvents.length,
      },
      topServices,
      bottomServices,
      paymentSummary: periodSummary.map((item) => ({
        name: item.key,
        count: item.transactions,
        amount: item.sales,
      })),
      trends: [
        `${currentRange.label} verified sales total ${peso(selectedRangeSales)}.`,
        topServices[0] ? `${topServices[0].name} leads bookings with ${topServices[0].count} booking(s).` : "",
        totalRatings ? `Average rating is ${avgRating} from ${totalRatings} review(s).` : "No review ratings are available yet.",
        periodSummary[3] ? `Annual verified sales currently total ${peso(periodSummary[3].sales)}.` : "",
      ].filter(Boolean),
    }),
    [avgRating, bookingSummary, bottomServices, currentRange.label, periodSummary, selectedRangeSales, topServices, totalRatings, totalSales, verifiedRevenueEvents.length]
  );

  const generateAnalytics = async (analysisType) => {
    const setState = analysisType === "predictive" ? setPredictiveAiState : setDescriptiveAiState;
    setState({ ...createAiState(), status: "loading" });

    try {
      const response = await generateAnalyticsInterpretation({ ...analyticsAiPayload, analysisType });
      if (!response?.available) {
        const normalized = normalizeAiAnalysisResponse(response || {}, analysisType);
        setState({
          ...createAiState(),
          status: "unavailable",
          message: response?.message || "AI unavailable right now.",
          ...normalized,
        });
        return;
      }

      const normalized = normalizeAiAnalysisResponse(response, analysisType);
      setState({
        ...normalized,
        status: "success",
        message: "",
        model: normalized.model || getAiItemText(response.model),
      });
    } catch (error) {
      setState({
        ...createAiState(),
        status: "error",
        message: error.message || "Unable to generate analysis right now.",
      });
    }
  };

  const descriptiveLines = useMemo(() => getAiLines(descriptiveAiState), [descriptiveAiState]);
  const predictiveLines = useMemo(() => getAiLines(predictiveAiState), [predictiveAiState]);

  const exportPdf = () =>
    exportTabularPdf({
      title: "Admin Analytics Report",
      subtitle: "Verified staged-payment revenue, booking demand, ratings, and AI analytics.",
      sections: [
        {
          title: "Sales Overview",
          columns: ["Metric", "Value"],
          rows: [
            ["All-Time Verified Sales", peso(totalSales)],
            [`Selected Range (${currentRange.label})`, peso(selectedRangeSales)],
            ["Verified Revenue Events", verifiedRevenueEvents.length],
          ],
        },
        {
          title: "Sales Summary by Period",
          columns: ["Period", "Verified Sales", "Paid Records", "Customers"],
          rows: periodSummary.map((item) => [item.key, peso(item.sales), item.transactions, item.customers]),
        },
        {
          title: "Bookings",
          columns: ["Metric", "Value"],
          rows: [
            ["Total Bookings", bookingSummary.total],
            ["Completed", bookingSummary.completed],
            ["In Progress", bookingSummary.inProgress],
            ["Scheduled/Pending", bookingSummary.scheduled],
            ["Cancelled", bookingSummary.cancelled],
          ],
        },
        {
          title: "Ratings",
          columns: ["Metric", "Value"],
          rows: [
            ["Average Rating", avgRating || "No ratings"],
            ["Total Reviews", totalRatings],
            ...ratingDistribution.map((item) => [`${item.rating} Star`, item.count]),
          ],
        },
        {
          title: "Top Services",
          columns: ["Rank", "Service", "Bookings"],
          rows: topServices.map((service, index) => [index + 1, service.name, service.count]),
        },
        {
          title: "AI Generated Descriptive Analytics",
          columns: ["Insight"],
          rows: descriptiveLines.map((line) => [`${line.label}: ${line.text}`]),
          emptyMessage: "No descriptive AI analysis generated yet.",
        },
        {
          title: "AI Generated Predictive Analytics",
          columns: ["Insight"],
          rows: predictiveLines.map((line) => [`${line.label}: ${line.text}`]),
          emptyMessage: "No predictive AI analysis generated yet.",
        },
      ],
    });

  const maxRatingCount = Math.max(...ratingDistribution.map((item) => item.count), 1);

  return (
    <div className="anaWrap">
      <div className="anaTopRow">
        <button className="anaExportBtn" type="button" onClick={exportPdf}>
          Export as PDF
        </button>
      </div>

      <div className="anaDashboardGrid">
        <section className="anaCard anaSalesCard">
          <div className="anaCardHead">
            <div>
              <h3>Total Sales Visual Analytics</h3>
              <p>Verified paid revenue only, including staged down payments and remaining balances.</p>
            </div>
            <div className="anaRangeTabs" aria-label="Sales range">
              {RANGE_TYPES.map((item) => (
                <button
                  key={item.key}
                  className={rangeType === item.key ? "active" : ""}
                  type="button"
                  onClick={() => setRangeType(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="anaRangeControls">
            {rangeType === "weekly" && (
              <label>
                <span>Week of</span>
                <input
                  type="date"
                  value={rangeControls.weekDate}
                  onChange={(event) => setRangeControls((prev) => ({ ...prev, weekDate: event.target.value }))}
                />
              </label>
            )}
            {rangeType === "monthly" && (
              <>
                <label>
                  <span>Month</span>
                  <select
                    value={rangeControls.month}
                    onChange={(event) => setRangeControls((prev) => ({ ...prev, month: Number(event.target.value) }))}
                  >
                    {MONTH_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select
                    value={rangeControls.year}
                    onChange={(event) => setRangeControls((prev) => ({ ...prev, year: Number(event.target.value) }))}
                  >
                    {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
              </>
            )}
            {rangeType === "quarterly" && (
              <>
                <label>
                  <span>Quarter</span>
                  <select
                    value={rangeControls.quarter}
                    onChange={(event) => setRangeControls((prev) => ({ ...prev, quarter: Number(event.target.value) }))}
                  >
                    {QUARTER_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select
                    value={rangeControls.year}
                    onChange={(event) => setRangeControls((prev) => ({ ...prev, year: Number(event.target.value) }))}
                  >
                    {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
              </>
            )}
            {rangeType === "annual" && (
              <label>
                <span>Year</span>
                <select
                  value={rangeControls.year}
                  onChange={(event) => setRangeControls((prev) => ({ ...prev, year: Number(event.target.value) }))}
                >
                  {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="anaSalesSummary">
            <div>
              <span>{currentRange.label}</span>
              <strong>{peso(selectedRangeSales)}</strong>
            </div>
            <div>
              <span>All-time verified sales</span>
              <strong>{peso(totalSales)}</strong>
            </div>
            <div>
              <span>Verified paid stages</span>
              <strong>{selectedRangeEvents.length}</strong>
            </div>
          </div>

          {salesSeries.some((item) => item.sales > 0) ? (
            <div className="anaChartBox">
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={salesSeries} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6dfd2" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" tickFormatter={(value) => `Php ${Number(value || 0).toLocaleString("en-PH")}`} />
                  <Tooltip
                    formatter={(value) => [peso(value), "Verified Sales"]}
                    cursor={{ fill: "rgba(198, 162, 74, 0.12)" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #ddd7ca", boxShadow: "0 12px 28px rgba(15, 23, 42, 0.10)" }}
                  />
                  <Bar dataKey="sales" name="Verified Sales" fill="#16803c" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="anaEmptyBlock">No verified sales data for this selected range.</div>
          )}
        </section>

        <section className="anaCard">
          <div className="anaCardHead">
            <div>
              <h3>Bookings Summary</h3>
              <p>Current appointment volume by workflow state.</p>
            </div>
          </div>
          <div className="anaBookingHero">
            <span>Total Bookings</span>
            <strong>{bookingSummary.total}</strong>
          </div>
          <div className="anaMiniGrid">
            <div><span>Completed</span><strong>{bookingSummary.completed}</strong></div>
            <div><span>In Progress</span><strong>{bookingSummary.inProgress}</strong></div>
            <div><span>Scheduled/Pending</span><strong>{bookingSummary.scheduled}</strong></div>
            <div><span>Cancelled</span><strong>{bookingSummary.cancelled}</strong></div>
          </div>
        </section>

        <section className="anaCard">
          <div className="anaCardHead">
            <div>
              <h3>Ratings Summary</h3>
              <p>Average score and distribution of customer reviews.</p>
            </div>
          </div>
          <div className="anaRatingTop">
            <div>
              <strong>{avgRating ? `${avgRating} / 5` : "No ratings"}</strong>
              <span>{totalRatings} review{totalRatings === 1 ? "" : "s"}</span>
            </div>
            <div className="anaRatingStars" aria-label={`Average rating ${avgRating} out of 5`}>
              {ratingStars.map((filled, index) => (
                <span key={index} className={filled ? "filled" : ""}>★</span>
              ))}
            </div>
          </div>
          <div className="anaRatingBars">
            {ratingDistribution.map((item) => (
              <div key={item.rating} className="anaRatingBarRow">
                <span>{item.rating}★</span>
                <div className="anaRatingTrack">
                  <div style={{ width: `${(item.count / maxRatingCount) * 100}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="anaCard anaWideCard">
          <div className="anaCardHead">
            <div>
              <h3>Sales Summary by Period</h3>
              <p>Current week, month, quarter, and year verified sales snapshots.</p>
            </div>
          </div>
          <div className="anaPeriodGrid">
            {periodSummary.map((item) => (
              <div key={item.key} className="anaPeriodCard">
                <span>{item.key}</span>
                <strong>{peso(item.sales)}</strong>
                <p>{item.transactions} paid record{item.transactions === 1 ? "" : "s"} - {item.customers} customer{item.customers === 1 ? "" : "s"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="anaCard anaWideCard">
          <div className="anaCardHead">
            <div>
              <h3>Top Services</h3>
              <p>Most-booked services across current booking records.</p>
            </div>
          </div>
          {topServices.length ? (
            <div className="anaServicesGrid">
              <div className="anaServiceList">
                {topServices.map((service, index) => (
                  <div key={service.name} className="anaServiceRow">
                    <div className="anaBadge">{index + 1}</div>
                    <div className="anaSvcName">{service.name}</div>
                    <div className="anaSvcNum">{service.count} booking{service.count === 1 ? "" : "s"}</div>
                  </div>
                ))}
              </div>
              <div className="anaChartBox">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topServices} layout="vertical" margin={{ top: 6, right: 12, left: 18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6dfd2" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#475569" width={128} />
                    <Tooltip
                      formatter={(value) => [`${value}`, "Bookings"]}
                      cursor={{ fill: "rgba(198, 162, 74, 0.12)" }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #ddd7ca", boxShadow: "0 12px 28px rgba(15, 23, 42, 0.10)" }}
                    />
                    <Bar dataKey="count" name="Bookings" fill="#c6a24a" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="anaEmptyBlock">No booking data is available yet.</div>
          )}
        </section>

        <AnalyticsAiCard
          title="AI Generated Descriptive Analytics"
          type="descriptive"
          buttonLabel="Generate Descriptive Analysis"
          state={descriptiveAiState}
          onGenerate={() => generateAnalytics("descriptive")}
        />

        <AnalyticsAiCard
          title="AI Generated Predictive Analytics"
          type="predictive"
          buttonLabel="Generate Predictive Analysis"
          state={predictiveAiState}
          onGenerate={() => generateAnalytics("predictive")}
        />
      </div>
    </div>
  );
}
