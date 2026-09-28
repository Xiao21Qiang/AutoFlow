import { CAR_SIZE_OPTIONS, MOTORCYCLE_CAR_SIZE } from "./servicePricing";

export { MOTORCYCLE_CAR_SIZE };

export const CUSTOMER_BOOKING_REQUIRED_MESSAGES = {
  vehicle: "Vehicle is required.",
  plate: "Plate number is required.",
  service: "Please select a service.",
  carSize: "Car size is required.",
  date: "Preferred date is required.",
  time: "Preferred time is required.",
};

export const CUSTOMER_BOOKING_REQUIRED_FIELDS = Object.keys(CUSTOMER_BOOKING_REQUIRED_MESSAGES);

export function normalizeServiceName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isMotorCoatingService(service = {}) {
  return normalizeServiceName(service?.name || service) === "motor coating";
}

export function getRequiredCarSizeForService(service = {}) {
  return isMotorCoatingService(service) ? MOTORCYCLE_CAR_SIZE : "";
}

export function normalizeCustomerPlateInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9-\s]/g, "").slice(0, 20);
}

export function getCustomerBookingValidationErrors({
  form = {},
  services = [],
  minDate = "",
  timeOptions = [],
} = {}) {
  const errors = {};
  const vehicle = String(form.vehicle || "").trim().replace(/\s+/g, " ");
  const rawPlate = String(form.plate || "").trim();
  const normalizedPlate = rawPlate.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const service = (Array.isArray(services) ? services : []).find(
    (entry) => String(entry?.name || "").trim() === String(form.service || "").trim()
  );
  const requiredCarSize = getRequiredCarSizeForService(service || form.service);
  const canonicalTimeValues = (Array.isArray(timeOptions) ? timeOptions : []).map((option) => String(option?.value || option));

  if (!vehicle) errors.vehicle = CUSTOMER_BOOKING_REQUIRED_MESSAGES.vehicle;
  else if (vehicle.length < 2 || vehicle.length > 80) errors.vehicle = "Vehicle model must be 2 to 80 characters.";
  else if (!/^[A-Za-z0-9][A-Za-z0-9\s.'()/-]*$/.test(vehicle)) errors.vehicle = "Vehicle model contains unsupported characters.";

  if (!rawPlate) errors.plate = CUSTOMER_BOOKING_REQUIRED_MESSAGES.plate;
  else if (/[^A-Za-z0-9\s-]/.test(rawPlate)) errors.plate = "Plate number contains unsupported characters.";
  else if (normalizedPlate.length < 3 || normalizedPlate.length > 16) errors.plate = "Plate number must be 3 to 16 letters or numbers.";

  if (!service) errors.service = CUSTOMER_BOOKING_REQUIRED_MESSAGES.service;
  if (requiredCarSize) {
    if (String(form.carSize || "").trim() !== requiredCarSize) {
      errors.carSize = `Motor Coating requires ${requiredCarSize}.`;
    }
  } else if (!CAR_SIZE_OPTIONS.includes(String(form.carSize || "").trim())) {
    errors.carSize = CUSTOMER_BOOKING_REQUIRED_MESSAGES.carSize;
  }

  const date = String(form.date || "").trim();
  if (!date) errors.date = CUSTOMER_BOOKING_REQUIRED_MESSAGES.date;
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Please enter a valid booking date.";
  else if (minDate && date < minDate) errors.date = "Please select today or a future date for your booking.";

  const time = String(form.time || "").trim();
  if (!time) errors.time = CUSTOMER_BOOKING_REQUIRED_MESSAGES.time;
  else if (service && canonicalTimeValues.length && !canonicalTimeValues.includes(time)) {
    errors.time = "Please choose an available time for this service.";
  }

  return errors;
}
