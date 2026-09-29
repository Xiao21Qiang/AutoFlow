export function getCustomerVehicleId(vehicle = {}) {
  return String(vehicle.id || vehicle._id || "").trim();
}

export function getCustomerVehicleOptions(vehicles = []) {
  return (Array.isArray(vehicles) ? vehicles : [])
    .map((vehicle) => ({
      value: getCustomerVehicleId(vehicle),
      label: `${String(vehicle.vehicle || "").trim()} | ${String(vehicle.plate || "").trim().toUpperCase()}`,
      vehicle,
    }))
    .filter((option) => option.value && option.vehicle.vehicle && option.vehicle.plate);
}

export function findCustomerVehicleById(vehicles = [], vehicleId = "") {
  const targetId = String(vehicleId || "").trim();
  return (Array.isArray(vehicles) ? vehicles : []).find((vehicle) => getCustomerVehicleId(vehicle) === targetId) || null;
}
