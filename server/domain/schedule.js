const { normalizeBookingStatus } = require("./bookingStatus");

const APPLICATION_TIMEZONE = "Asia/Manila";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getDatePartsInTimezone(date = new Date(), timeZone = APPLICATION_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour === "24" ? "0" : lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function toDateKey(date = new Date(), timeZone = APPLICATION_TIMEZONE) {
  const parts = getDatePartsInTimezone(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function parseBookingDateTime(booking = {}) {
  const date = String(booking.date || "").trim();
  const time = String(booking.time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (/^\d{2}:\d{2}$/.test(time)) return new Date(`${date}T${time}:00+08:00`);
  return new Date(`${date}T23:59:59.999+08:00`);
}

function getDayRange(date = new Date(), timeZone = APPLICATION_TIMEZONE) {
  const key = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateKey(date, timeZone);
  return {
    key,
    start: new Date(`${key}T00:00:00.000+08:00`),
    end: new Date(`${key}T23:59:59.999+08:00`),
    timeZone,
  };
}

function isSameAppDay(value, date = new Date()) {
  const parsed = value instanceof Date ? value : parseBookingDateTime({ date: value });
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  return toDateKey(parsed) === toDateKey(date);
}

function isBookingToday(booking = {}, now = new Date()) {
  const parsed = parseBookingDateTime(booking);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  return toDateKey(parsed) === toDateKey(now);
}

function isUpcomingBooking(booking = {}, now = new Date()) {
  const status = normalizeBookingStatus(booking.status, "Scheduled");
  if (status === "Completed" || status === "Cancelled") return false;
  const parsed = parseBookingDateTime(booking);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= now.getTime();
}

function isDateInRange(date, start, end) {
  if (!date || Number.isNaN(date.getTime())) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

module.exports = {
  APPLICATION_TIMEZONE,
  getDayRange,
  isBookingToday,
  isDateInRange,
  isSameAppDay,
  isUpcomingBooking,
  parseBookingDateTime,
  toDateKey,
};
