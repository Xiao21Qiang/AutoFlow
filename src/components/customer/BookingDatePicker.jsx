import "../../styles/css/shared/bookingDatePicker.css";

import { useEffect, useMemo, useRef, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return date;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function getAvailabilityForDate(availability, dateKey) {
  const capacity = Math.max(0, Number(availability?.maxDailyCapacity || 8) || 8);
  const entry = availability?.byDate?.[dateKey] || {};
  const availableSlots = Object.prototype.hasOwnProperty.call(entry, "availableSlots")
    ? Number(entry.availableSlots)
    : capacity;
  return Math.min(capacity, Math.max(0, Number.isFinite(availableSlots) ? availableSlots : capacity));
}

export default function BookingDatePicker({ value, min, onChange, onBlur, invalid = false, describedBy, availability }) {
  const selectedDate = parseDateKey(value);
  const minimumDate = parseDateKey(min);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || minimumDate || new Date());
  const wrapRef = useRef(null);
  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

  useEffect(() => {
    const nextSelectedDate = parseDateKey(value);
    if (nextSelectedDate) setViewDate(nextSelectedDate);
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selectDate = (date) => {
    const nextValue = toDateKey(date);
    if (min && nextValue < min) return;
    if (getAvailabilityForDate(availability, nextValue) === 0) return;
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="bookingDatePicker" ref={wrapRef}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        aria-label="Preferred Date"
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={describedBy}
        className={invalid ? "bookingDateInput invalid" : "bookingDateInput"}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <button
        className="bookingDateToggle"
        type="button"
        aria-label="Choose date"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Choose date
      </button>
      {open && (
        <div className="bookingCalendar" role="dialog" aria-label="Choose preferred date">
          <div className="bookingCalendarHeader">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            >
              &lt;
            </button>
            <strong>{viewDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            >
              &gt;
            </button>
          </div>
          <div className="bookingCalendarGrid" role="grid">
            {WEEKDAYS.map((day) => <div className="bookingCalendarWeekday" key={day}>{day}</div>)}
            {days.map((date) => {
              const dateKey = toDateKey(date);
              const outsideMonth = date.getMonth() !== viewDate.getMonth();
              const beforeMinimum = Boolean(min && dateKey < min);
              const availableSlots = getAvailabilityForDate(availability, dateKey);
              const fullyBooked = availableSlots === 0;
              const disabled = beforeMinimum || fullyBooked;
              return (
                <button
                  className={`${outsideMonth ? "outside" : ""}${dateKey === value ? " selected" : ""}${fullyBooked ? " fullyBooked" : ""}`}
                  type="button"
                  role="gridcell"
                  key={dateKey}
                  disabled={disabled}
                  aria-label={date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  aria-selected={dateKey === value}
                  onClick={() => selectDate(date)}
                >
                  <span className="bookingCalendarDayNumber">{date.getDate()}</span>
                  {!beforeMinimum ? <span className="bookingCalendarSlotBadge" aria-hidden="true">{availableSlots}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="bookingCalendarAvailabilityNote">
            The number shown on each date indicates the available booking slots remaining for that day.
          </div>
        </div>
      )}
    </div>
  );
}
