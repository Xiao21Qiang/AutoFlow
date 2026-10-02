const PDFDocument = require("pdfkit");
const path = require("path");
const { normalizeBookingStatus } = require("./bookingStatus");
const { roundMoney } = require("./money");
const stockDomain = require("./stock");
const invoiceDomain = require("./invoices");
const { buildBusinessSummary } = require("./summaries");

const APP_TZ = "Asia/Manila";
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateKey(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatPeso(value) {
  return `PHP ${roundMoney(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function sanitizeFilename(value, fallback = "autoflow-report") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function safeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeCsvCell(value, { numeric = false } = {}) {
  if (value === null || value === undefined) return "";
  if (numeric && typeof value === "number" && Number.isFinite(value)) return String(value);
  let text = String(value);
  if (!numeric && FORMULA_PREFIX_PATTERN.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv({ columns = [], rows = [] } = {}) {
  const header = columns.map((column) => escapeCsvCell(column.label || column)).join(",");
  const body = (rows.length ? rows : [[]]).map((row) =>
    columns
      .map((column, index) => {
        const value = Array.isArray(row) ? row[index] : row[column.key];
        return escapeCsvCell(value, { numeric: column.numeric === true });
      })
      .join(",")
  );
  return `\ufeff${[header, ...body].join("\r\n")}\r\n`;
}

function addPdfTable(doc, title, columns, rows, emptyMessage = "No data available.") {
  doc.moveDown(0.8).fontSize(13).font("Helvetica-Bold").text(title);
  doc.moveDown(0.3);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / Math.max(columns.length, 1);
  const drawHeader = () => {
    doc.fontSize(8).font("Helvetica-Bold");
    const y = doc.y;
    columns.forEach((column, index) => {
      doc.text(column.label || column, doc.page.margins.left + index * colWidth, y, {
        width: colWidth - 4,
        continued: false,
      });
    });
    doc.moveDown(0.8).font("Helvetica").fontSize(8);
  };
  drawHeader();
  const sourceRows = rows.length ? rows : [columns.map(() => "")];
  if (!rows.length) sourceRows[0][0] = emptyMessage;
  sourceRows.forEach((row) => {
    const values = columns.map((column, index) => safeText(Array.isArray(row) ? row[index] : row[column.key]) || "-");
    const heights = values.map((value) => doc.heightOfString(value, { width: colWidth - 4 }));
    const rowHeight = Math.max(18, ...heights) + 5;
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    values.forEach((value, index) => {
      doc.font("Helvetica").fontSize(8).text(value, doc.page.margins.left + index * colWidth, y, {
        width: colWidth - 4,
      });
    });
    doc.y = y + rowHeight;
  });
}

// Invoice layout consumes the already-formatted canonical report rows. It never
// computes prices, payment states, discounts, or balances.
function formatInvoiceDate(value) {
  const key = formatDateKey(value);
  if (!key) return safeText(value) || "-";
  const date = new Date(`${key}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return safeText(value) || "-";
  return date.toLocaleDateString("en-PH", {
    timeZone: APP_TZ, month: "short", day: "2-digit", year: "numeric",
  });
}

function formatInvoiceTime(value) {
  const raw = safeText(value);
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
  if (!match || Number(match[1]) > 23) return raw || "-";
  const hours = Number(match[1]);
  return `${String(hours % 12 || 12).padStart(2, "0")}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function addInvoiceLayout(doc, report) {
  const fields = new Map((report.sections || []).flatMap((section) => section.rows || []));
  const used = new Set(["Generated"]);
  const valueOf = (label) => {
    used.add(label);
    return safeText(fields.get(label)) || "-";
  };
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 12;
  const bookingId = valueOf("Invoice / Booking");
  let y = doc.page.margins.top;

  // Measure with the same PDF font used to draw; split long unbroken references
  // as well as ordinary words. Lines are painted explicitly to avoid PDFKit's
  // automatic wrapping creating a page halfway through a paired row.
  const wrap = (text, availableWidth, font, size) => {
    doc.font(font).fontSize(size);
    const lines = [];
    let line = "";
    for (const word of (safeText(text) || "-").split(" ")) {
      if (line && doc.widthOfString(`${line} ${word}`) <= availableWidth) {
        line += ` ${word}`;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (doc.widthOfString(line) > availableWidth) {
        const chars = Array.from(line);
        let low = 1;
        let high = chars.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (doc.widthOfString(chars.slice(0, mid).join("")) <= availableWidth) low = mid;
          else high = mid - 1;
        }
        lines.push(chars.slice(0, low).join(""));
        line = chars.slice(low).join("");
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const line = (text, x, top, availableWidth, { font = "Helvetica", size = 9, color = "#202020", align = "left" } = {}) => {
    doc.font(font).fontSize(size).fillColor(color);
    const textX = align === "right" ? x + availableWidth - doc.widthOfString(text) : x;
    doc.text(text, textX, top, { lineBreak: false });
  };
  const rule = (top, color = "#d5d5d5") => {
    doc.save().strokeColor(color).lineWidth(0.5).moveTo(left, top).lineTo(left + width, top).stroke().restore();
  };
  const newPage = () => {
    doc.addPage();
    y = doc.page.margins.top + 1; // Include the small bold font's ascender in the top margin.
    line("SALES INVOICE - CONTINUED", left, y, width, { font: "Helvetica-Bold", size: 8 });
    const idLines = wrap(bookingId, width / 2, "Helvetica", 8);
    idLines.forEach((text, index) => line(text, left + width / 2, y + index * 11, width / 2, { size: 8, align: "right" }));
    y += Math.max(11, idLines.length * 11) + 8;
    rule(y);
    y += 16;
  };
  const sectionTitle = (title, continued = false, firstRowHeight = 24) => {
    if (y + 20 + firstRowHeight > bottom) newPage();
    line(`${title}${continued ? " (CONTINUED)" : ""}`, left, y, width, { font: "Helvetica-Bold", size: 10.5 });
    y += 20;
  };
  const drawRow = (entries, section, { summary = false, strong = false, balance = false, startSection = false } = {}) => {
    const columnGap = 20;
    const columnWidth = summary ? width : (width - columnGap) / 2;
    const inset = balance ? 8 : 0;
    const labelWidth = summary ? 180 : 78;
    const size = balance ? 11 : 9;
    const leading = balance ? 14 : 12;
    const padding = balance ? 9 : 4;
    const font = strong || balance ? "Helvetica-Bold" : "Helvetica";
    const cells = entries.map(([label, value, monetary], index) => ({
      x: left + index * (columnWidth + columnGap) + inset,
      label: wrap(label, labelWidth, summary ? font : "Helvetica-Bold", summary ? size : 8),
      value: wrap(value, columnWidth - labelWidth - 8 - inset * 2, font, size),
      monetary,
    }));
    const count = Math.max(...cells.map((cell) => Math.max(cell.label.length, cell.value.length)));
    const height = count * leading + padding * 2;
    // Keep ordinary rows intact; only a row taller than a fresh page is split.
    const freshCapacity = bottom - doc.page.margins.top - 60;
    // Keep each section heading with its first row, including long references.
    if (startSection) sectionTitle(section, false, height <= freshCapacity ? height : leading * 2 + padding * 2);
    if (y + height > bottom && height <= freshCapacity) {
      newPage();
      sectionTitle(section, true);
    }
    let offset = 0;
    while (offset < count) {
      let capacity = Math.floor((bottom - y - padding * 2) / leading);
      if (capacity < 1) {
        newPage();
        sectionTitle(section, true);
        capacity = Math.floor((bottom - y - padding * 2) / leading);
      }
      const take = Math.min(capacity, count - offset);
      const chunkHeight = take * leading + padding * 2;
      if (balance) doc.save().rect(left, y, width, chunkHeight).fill("#eeeeee").restore();
      else if (strong) rule(y);
      cells.forEach((cell) => {
        const labelLines = offset && cell.value.length > offset ? cell.label : cell.label.slice(offset, offset + take);
        labelLines.slice(0, take).forEach((text, index) => line(text, cell.x, y + padding + index * leading, labelWidth, {
          font: summary ? font : "Helvetica-Bold", size: summary ? size : 8, color: summary ? "#202020" : "#555555",
        }));
        cell.value.slice(offset, offset + take).forEach((text, index) => line(text, cell.x + labelWidth + 8, y + padding + index * leading, columnWidth - labelWidth - 8 - inset * 2, {
          font, size, align: cell.monetary ? "right" : "left",
        }));
      });
      y += chunkHeight;
      offset += take;
      if (offset < count) {
        newPage();
        sectionTitle(section, true);
      }
    }
  };
  const grid = (title, entries) => {
    for (let index = 0; index < entries.length; index += 2) {
      drawRow(entries.slice(index, index + 2), title, { startSection: index === 0 });
    }
    y += 18;
  };

  const logoSize = 102; // 36 mm; PDFKit's fit preserves the official asset's aspect ratio.
  doc.image(path.resolve(__dirname, "../../public/aptlogo.png"), left, y, { fit: [logoSize, logoSize] });
  line("ALL PRO-TEC CAR CARE", left, y + logoSize + 7, width / 2, { font: "Helvetica-Bold", size: 9 });
  line("AutoFlow", left, y + logoSize + 20, width / 2, { size: 8, color: "#666666" });
  const metaX = left + width / 2;
  const metaWidth = width / 2;
  line("SALES INVOICE", metaX, y + 2, metaWidth, { font: "Helvetica-Bold", size: 19, align: "right" });
  let metaY = y + 37;
  line("Invoice / Booking", metaX, metaY, metaWidth, { size: 8, color: "#666666", align: "right" });
  metaY += 14;
  const idLines = wrap(bookingId, metaWidth, "Helvetica-Bold", 10);
  idLines.forEach((text, index) => line(text, metaX, metaY + index * 13, metaWidth, { font: "Helvetica-Bold", size: 10, align: "right" }));
  metaY += idLines.length * 13 + 12;
  line("Generated", metaX, metaY, metaWidth, { size: 8, color: "#666666", align: "right" });
  metaY += 13;
  const generated = safeText(fields.get("Generated")) || formatDateTime(report.generatedAt || new Date());
  wrap(generated, metaWidth, "Helvetica", 9).forEach((text) => {
    line(text, metaX, metaY, metaWidth, { align: "right" });
    metaY += 12;
  });
  y = Math.max(y + logoSize + 39, metaY + 12);
  rule(y, "#888888");
  y += 20;

  grid("BOOKING INFORMATION", [
    ["Customer", valueOf("Customer")], ["Vehicle", valueOf("Vehicle")],
    ["Service", valueOf("Service")], ["Booking Date", formatInvoiceDate(valueOf("Booking Date"))],
    ["Scheduled Time", formatInvoiceTime(valueOf("Scheduled Time"))], ["Invoice / Booking", bookingId],
    ["Relevant Status", valueOf("Relevant Status")],
  ]);
  grid("PAYMENT INFORMATION", [
    ["Payment Method", valueOf("Payment Method")], ["Payment Status", valueOf("Payment Status")],
    ["Payment Stage", valueOf("Payment Stage")], ["Payment Plan", valueOf("Payment Plan")],
    ["Declared Initial Payment", valueOf("Declared Initial Payment")], ["Proof Submitted", valueOf("Proof Submitted")],
  ]);
  for (const label of ["Original Amount", "Promotion", "Reward", "Discount Type", "Discount Value", "Discount Amount", "Final Amount Due", "Verified Downpayment", "Verified Final Payment", "Total Verified Paid", "Outstanding Balance"]) {
    const monetary = !["Promotion", "Reward", "Discount Type", "Discount Value"].includes(label);
    drawRow([[label === "Outstanding Balance" ? "OUTSTANDING BALANCE" : label, valueOf(label), monetary]], "AMOUNT SUMMARY", {
      summary: true, strong: ["Final Amount Due", "Total Verified Paid"].includes(label), balance: label === "Outstanding Balance", startSection: label === "Original Amount",
    });
  }
  y += 18;
  grid("PAYMENT REFERENCES", [
    ["Downpayment Reference", valueOf("Downpayment Reference")], ["Final Payment Reference", valueOf("Final Payment Reference")],
  ]);
  // Keep future invoice fields visible if the canonical report gains a new row.
  const remaining = [...fields.entries()].filter(([label]) => !used.has(label));
  if (remaining.length) grid("ADDITIONAL INFORMATION", remaining);
}

function renderReportPdf(report) {
  return new Promise((resolve, reject) => {
    const isInvoice = report.key === "invoice";
    const doc = new PDFDocument({ size: "A4", margin: isInvoice ? 45 : 42, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    if (isInvoice) {
      addInvoiceLayout(doc, report);
    } else {
      doc.font("Helvetica-Bold").fontSize(18).text(report.title || "AutoFlow Report");
      doc.font("Helvetica").fontSize(9).text(`Generated: ${formatDateTime(report.generatedAt || new Date())}`);
      if (report.subtitle) doc.text(report.subtitle);
      if (report.periodLabel) doc.text(`Period: ${report.periodLabel}`);
      (report.sections || []).forEach((section) => {
        addPdfTable(doc, section.title || "Report", section.columns || [], section.rows || [], section.emptyMessage);
      });
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const footer = `Page ${i + 1 - range.start} of ${range.count}`;
      doc.font("Helvetica").fontSize(8).fillColor("#64748b");
      // Disable text flow so the footer cannot create an extra page. Invoices
      // reserve space for it inside their printable margins.
      const footerY = doc.page.height - (isInvoice ? doc.page.margins.bottom + 8 : 30);
      doc.text(footer, doc.page.width - doc.page.margins.right - doc.widthOfString(footer), footerY, { lineBreak: false });
      doc.fillColor("#000000");
    }
    doc.end();
  });
}

function getInDateRange(value, filters = {}) {
  const key = formatDateKey(value);
  if (!key) return true;
  if (filters.dateFrom && key < filters.dateFrom) return false;
  if (filters.dateTo && key > filters.dateTo) return false;
  return true;
}

function buildAnalyticsReport(data = {}, filters = {}) {
  const bookings = data.bookings || [];
  const payments = data.payments || [];
  const reviews = data.reviews || [];
  const summary = buildBusinessSummary({
    bookings,
    payments,
    stockMonitoring: data.stockMonitoring || [],
    quoteRequests: data.quoteRequests || [],
  });
  const topServices = Object.values(bookings.reduce((acc, booking) => {
    const service = safeText(booking.service) || "Unspecified";
    acc[service] = acc[service] || { service, bookings: 0 };
    acc[service].bookings += 1;
    return acc;
  }, {})).sort((left, right) => right.bookings - left.bookings).slice(0, 8);
  return {
    title: "AutoFlow Analytics Report",
    subtitle: "Dashboard analytics from backend-calculated booking and verified revenue summaries.",
    periodLabel: filters.dateFrom || filters.dateTo ? `${filters.dateFrom || "Start"} to ${filters.dateTo || "Present"}` : "All available records",
    generatedAt: new Date(),
    sections: [
      {
        title: "Summary",
        columns: [{ label: "Metric" }, { label: "Value" }],
        rows: [
          ["Total bookings", summary.totalSchedules],
          ["Completed bookings", summary.completedCount],
          ["Cancelled bookings", summary.cancelledCount],
          ["In progress", summary.inProgressCount],
          ["Verified revenue", formatPeso(summary.paidRevenue)],
          ["Review count", reviews.length],
        ],
      },
      {
        title: "Top Services",
        columns: [{ label: "Service" }, { label: "Bookings" }],
        rows: topServices.map((item) => [item.service, item.bookings]),
        emptyMessage: "No service demand records available.",
      },
    ],
  };
}

function buildReport(type, data = {}, filters = {}) {
  const paymentsByBooking = new Map((data.payments || []).map((payment) => [String(payment.bookingId || ""), payment]));
  const invoiceRows = (data.payments || []).map((payment) => invoiceDomain.buildInvoiceDto(payment, (data.bookings || []).find((booking) => booking.id === payment.bookingId) || {}));
  const types = {
    bookings: () => ({
      title: "AutoFlow Booking Report",
      subtitle: "Canonical booking status report.",
      sections: [{
        title: "Bookings",
        columns: ["Booking ID", "Customer", "Vehicle", "Service", "Preferred Date", "Assigned Time", "Place Slot", "Detailer", "Status", "Payment"],
        rows: (data.bookings || []).filter((b) => getInDateRange(b.date, filters)).map((b) => {
          const payment = paymentsByBooking.get(String(b.id || "")) || {};
          return [b.id, b.customer, `${b.vehicle || "-"} / ${b.plate || "-"}`, b.service, b.date, b.time, b.placeSlot || "-", b.assigned || "-", normalizeBookingStatus(b.status, "Scheduled"), payment.invoice?.outstandingBalance !== undefined ? `Paid ${formatPeso(payment.invoice.totalVerifiedPaid)} / Balance ${formatPeso(payment.invoice.outstandingBalance)}` : "-"];
        }),
      }],
    }),
    tracking: () => ({
      title: "AutoFlow Service Tracking Report",
      subtitle: "Operational service tracking and warranty status.",
      sections: [{
        title: "Tracking",
        columns: ["Booking ID", "Date", "Customer", "Vehicle", "Service", "Status", "Detailer", "Issue Note", "Warranty"],
        rows: (data.bookings || []).filter((b) => getInDateRange(b.date, filters)).map((b) => [b.id, b.date, b.customer, b.vehicle, b.service, normalizeBookingStatus(b.status, "Scheduled"), b.assigned || "-", b.issueNote || "-", b.warrantyReleased ? "Released" : "Not released"]),
      }],
    }),
    stock: () => ({
      title: "AutoFlow Stock Report",
      subtitle: "Stock status from the shared stock helper.",
      sections: [{
        title: "Stock Monitoring",
        columns: ["Item", "Category", "Current Quantity", "Maximum Quantity", "Reorder Level", "Stock Status", "Last Update"],
        rows: (data.stockMonitoring || []).map((item) => {
          const status = stockDomain.getStockStatus(item);
          return [item.name, item.category, item.currentStock, item.maxStock, status.reorderLevel, status.label, item.updatedAt || item.lastRestocked || "-"];
        }),
      }],
    }),
    services: () => ({
      title: "AutoFlow Services Report",
      subtitle: "Service catalog export.",
      sections: [{
        title: "Services",
        columns: ["Service ID", "Name", "Type", "Category", "Price", "Duration", "Status"],
        rows: (data.services || []).map((service) => [service.id, service.name, service.serviceType || service.type || "-", service.category || "-", formatPeso(service.price || service.amount || 0), service.mins || "-", service.enabled === false ? "Disabled" : "Enabled"]),
      }],
    }),
    payments: () => ({
      title: "AutoFlow Payment Report",
      subtitle: "Payment records using normalized invoice DTOs.",
      sections: [{
        title: "Payments",
        columns: ["Payment ID", "Booking ID", "Customer", "Service", "Method", "Stage", "Verified Paid", "Outstanding", "Status"],
        rows: invoiceRows.map((invoice, index) => [data.payments[index]?.id || "-", invoice.bookingId, invoice.customer, invoice.service, invoice.paymentMethod || "-", invoice.paymentStage, formatPeso(invoice.totalVerifiedPaid), formatPeso(invoice.outstandingBalance), invoice.paymentStatus]),
      }],
    }),
    financial: () => {
      const dto = invoiceDomain.buildFinancialReportDto({ payments: data.payments || [], expenses: data.expenses || [], commissions: data.commissions || [], dateFrom: filters.dateFrom || "", dateTo: filters.dateTo || "" });
      return {
        title: "AutoFlow Finance Report",
        subtitle: "Revenue, expenses, and commissions from backend financial DTOs.",
        sections: [
          { title: "Totals", columns: ["Metric", "Value"], rows: Object.entries(dto.totals).map(([key, value]) => [key, formatPeso(value)]) },
          { title: "Payment Records", columns: ["Payment ID", "Booking ID", "Customer", "Amount", "Verified Paid", "Outstanding", "Status"], rows: dto.payments.map((payment) => [payment.id, payment.bookingId, payment.customer, formatPeso(payment.amount), formatPeso(payment.verifiedPaid), formatPeso(payment.outstandingBalance), payment.status]) },
          { title: "Expense Records", columns: ["Date", "Description", "Category", "Amount", "Paid By"], rows: dto.expenses.map((expense) => [expense.date, expense.description || expense.note || "-", expense.category || "-", formatPeso(expense.amount), expense.paidBy || "-"]) },
          { title: "Commission Records", columns: ["Date", "Worker", "Role", "Service", "Earned", "Status"], rows: dto.commissions.map((commission) => [commission.date, commission.worker, commission.role, commission.service, formatPeso(commission.earned), commission.status]) },
        ],
      };
    },
    analytics: () => buildAnalyticsReport(data, filters),
    commissions: () => ({
      title: "AutoFlow Commission Report",
      subtitle: "Authorized commission records only.",
      sections: [{
        title: "Commissions",
        columns: ["Commission ID", "Booking ID", "Date", "Worker", "Role", "Service", "Rate", "Earned", "Status"],
        rows: (data.commissions || []).filter((c) => getInDateRange(c.date, filters)).map((c) => [c.id, c.bookingId, c.date, c.worker, c.role, c.service, `${c.rate || 0}%`, formatPeso(c.earned), c.status]),
      }],
    }),
    "audit-logs": () => ({
      title: "AutoFlow Audit Log Report",
      subtitle: "Scoped audit trail export.",
      sections: [{
        title: "Audit Logs",
        columns: ["Audit ID", "Actor", "Action", "Entity", "Result", "Timestamp"],
        rows: (data.auditLogs || []).map((log) => [log.id, log.userId, log.action, log.targetId || "-", log.meta?.result || "recorded", formatDateTime(log.ts || log.createdAt) || log.ts || log.createdAt || "-"]),
      }],
    }),
    reviews: () => ({
      title: "AutoFlow Review Report",
      subtitle: "Review management export.",
      sections: [{
        title: "Reviews",
        columns: ["Review ID", "Customer", "Booking", "Service", "Rating", "Status", "Submitted", "Admin Response"],
        rows: (data.reviews || []).map((r) => [r.id, r.customer, r.bookingId || "-", r.serviceName || r.serviceId || "-", r.rating, r.status, r.createdAt || "-", r.adminResponse || "-"]),
      }],
    }),
    promotions: () => ({
      title: "AutoFlow Promotion Report",
      subtitle: "Promotion rules and usage.",
      sections: [{
        title: "Promotions",
        columns: ["Promotion", "Code", "Type", "Value", "Date Range", "Status", "Usage Limit", "Usage Count", "Services"],
        rows: (data.promos || []).map((p) => [p.title || p.name, p.code, p.discountType, p.discountValue || p.discountPercent || 0, `${p.startAt || "-"} to ${p.endAt || p.expiresAt || "-"}`, p.status || (p.enabled ? "Active" : "Draft"), p.usageLimit || "-", p.usageCount || 0, (p.applicableServiceIds || []).join("; ") || "-"]),
      }],
    }),
    rewards: () => ({
      title: "AutoFlow Reward Pool Report",
      subtitle: "Reward definitions and availability.",
      sections: [{
        title: "Reward Pool",
        columns: ["Reward", "Code", "Type", "Rarity", "Weight", "Quantity", "Status", "Expiry Days"],
        rows: (data.rewards || []).map((r) => [r.name, r.code || "-", r.type || r.rewardType || "-", r.rarity, r.weight, r.quantity || r.stock || 0, r.archived ? "Archived" : r.enabled === false ? "Disabled" : "Enabled", r.expirationDays || "-"]),
      }],
    }),
    "reward-history": () => ({
      title: "AutoFlow Reward History Report",
      subtitle: "Customer reward lifecycle export.",
      sections: [{
        title: "Reward History",
        columns: ["Customer", "Reward", "Code", "Type", "Rarity", "Milestone", "Eligible Count", "Granted", "Claimed", "Reserved", "Reserved Booking", "Used", "Payment State", "Status", "Expiry", "Release Reason"],
        rows: (data.customerRewards || []).map((r) => [r.customerName, r.rewardName, r.rewardCode || r.claimCode || "-", r.rewardType, r.rarity, r.milestoneNumber || r.milestoneKey || "-", r.eligibleBookingCount || r.sourceCompletedBookingsCount || 0, r.dateGranted || r.dateEarned || "-", r.claimedAt || "-", r.reservedAt || "-", r.reservedBookingId || "-", r.usedAt || "-", r.paymentStatusAtUse || "-", r.status, r.expirationDate || "-", r.releaseReason || "-"]),
      }],
    }),
    "my-work": () => {
      const myWork = data.myWork || {};
      const assignedWork = myWork.assignedWork || data.bookings || [];
      const juniorDetailerWork = myWork.juniorDetailerWork || [];
      const commissionAudit = myWork.commissionAudit || data.commissions || [];
      const sections = [
        {
          title: "Assigned Work",
          columns: ["Booking ID", "Customer", "Service", "Vehicle", "Plate", "Date", "Time", "Place Slot", "Assigned", "Status", "Issue Notes", "Warranty", "Commission"],
          rows: assignedWork.map((b) => [b.id, b.customer, b.service, b.vehicle || "-", b.plate || "-", b.date, b.time, b.placeSlot || "-", b.assigned || "-", normalizeBookingStatus(b.status, "Scheduled"), b.issueNote || "-", b.warrantyReleased ? "Released" : "Not released", b.commissionStatus || "N/A"]),
        },
      ];
      if (myWork.includeJuniorDetailerWorkView) {
        sections.push({
          title: "Junior Detailer Work View",
          columns: ["Booking ID", "Customer", "Service", "Vehicle", "Plate", "Date", "Assigned", "Status", "Issue Notes", "Warranty", "Commission"],
          rows: juniorDetailerWork.map((b) => [b.id, b.customer, b.service, b.vehicle || "-", b.plate || "-", b.date, b.assigned || "-", normalizeBookingStatus(b.status, "Scheduled"), b.issueNote || "-", b.warrantyReleased ? "Released" : "Not released", b.commissionStatus || "N/A"]),
          emptyMessage: "No junior detailer work available.",
        });
      }
      sections.push({
        title: "Commission Audit",
        columns: ["Commission ID", "Booking ID", "Date", "Service", "Rate", "Earned", "Status", "Date Paid", "Paid By", "Remarks"],
        rows: commissionAudit.map((c) => [c.id, c.bookingId || "-", c.date || "-", c.service || "-", `${c.rate || 0}%`, formatPeso(c.earned || 0), c.status || "Pending", c.datePaid || "-", c.paidBy || "-", c.remarks || "-"]),
        emptyMessage: "No commission records available.",
      });
      return {
        title: "AutoFlow My Work Report",
        subtitle: "Authorized assigned work and own commission audit.",
        sections,
      };
    },
    "detailer-management": () => ({
      title: "AutoFlow Detailer Work Report",
      subtitle: "Authorized detailer workload and commission status.",
      sections: [{
        title: "Detailer Work",
        columns: ["Booking ID", "Customer", "Service", "Vehicle", "Assigned", "Status", "Commission"],
        rows: (data.bookings || []).map((b) => {
          const commission = (data.commissions || []).find((c) => c.bookingId === b.id) || {};
          return [b.id, b.customer, b.service, `${b.vehicle || "-"} / ${b.plate || "-"}`, b.assigned || "-", normalizeBookingStatus(b.status, "Scheduled"), commission.id ? `${commission.status}: ${formatPeso(commission.earned)}` : "-"];
        }),
      }],
    }),
  };
  const factory = types[type];
  if (!factory) return null;
  const report = factory();
  return {
    ...report,
    key: type,
    generatedAt: report.generatedAt || new Date(),
    periodLabel: report.periodLabel || (filters.dateFrom || filters.dateTo ? `${filters.dateFrom || "Start"} to ${filters.dateTo || "Present"}` : "All available records"),
  };
}

function flattenReportRows(report = {}) {
  const section = report.sections?.[0] || { columns: [], rows: [] };
  return { columns: section.columns || [], rows: section.rows || [] };
}

module.exports = {
  buildAnalyticsReport,
  buildCsv,
  buildReport,
  escapeCsvCell,
  flattenReportRows,
  formatDateKey,
  formatDateTime,
  formatPeso,
  renderReportPdf,
  sanitizeFilename,
};
