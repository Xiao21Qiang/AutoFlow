const BUILT_IN_SERVICE_DESCRIPTIONS = Object.freeze([
  Object.freeze({ name: "Graphene Coating", desc: "Adds a glossy protective coating to the vehicle's exterior." }),
  Object.freeze({ name: "Ceramic Coating", desc: "Applies a ceramic coating that helps protect the vehicle's exterior and maintain its finish." }),
  Object.freeze({ name: "Paint Protection Film", desc: "Applies a protective film to help shield painted surfaces from everyday wear." }),
  Object.freeze({ name: "Motor Coating", desc: "Provides a fixed-price coating service tailored for motorcycles." }),
  Object.freeze({ name: "Tint", desc: "Applies window tint to the vehicle." }),
  Object.freeze({ name: "Car Wash", desc: "Provides a routine wash for the selected vehicle size." }),
  Object.freeze({ name: "Maintenance + Hydrophobic Seal", desc: "Combines maintenance service with a hydrophobic seal for the vehicle's finish." }),
  Object.freeze({ name: "Maintenance + Light Buffing", desc: "Combines maintenance service with light buffing for the vehicle's finish." }),
  Object.freeze({ name: "[PLATINUM] Graphene + PPF package", desc: "Combines graphene coating and paint protection film in a single package." }),
]);

function normalizeServiceName(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const DESCRIPTION_BY_NAME = new Map(
  BUILT_IN_SERVICE_DESCRIPTIONS.map((entry) => [normalizeServiceName(entry.name), entry.desc])
);
const EMPTY_DESCRIPTION_PLACEHOLDERS = new Set([
  "",
  "...",
  "no description available.",
  "no description provided.",
]);

function getBuiltInDescriptionBackfill(service = {}) {
  const description = DESCRIPTION_BY_NAME.get(normalizeServiceName(service.name));
  if (!description) return null;
  const currentDescription = String(service.desc || "").trim();
  if (!EMPTY_DESCRIPTION_PLACEHOLDERS.has(currentDescription.toLowerCase())) return null;
  return description;
}

const DEFAULT_SERVICES = Object.freeze([
  Object.freeze({
    id: "SVC-1001",
    name: "Graphene Coating",
    desc: DESCRIPTION_BY_NAME.get("graphene coating"),
    serviceType: "Basic Service",
    category: "Coating",
    price: 25000,
    mins: 360,
    enabled: true,
    consumables: [],
  }),
  Object.freeze({
    id: "SVC-1002",
    name: "Ceramic Coating",
    desc: DESCRIPTION_BY_NAME.get("ceramic coating"),
    serviceType: "Basic Service",
    category: "Coating",
    price: 18000,
    mins: 300,
    enabled: true,
    consumables: [],
  }),
  Object.freeze({
    id: "SVC-1003",
    name: "Paint Protection Film",
    desc: DESCRIPTION_BY_NAME.get("paint protection film"),
    serviceType: "Basic Service",
    category: "Protection",
    price: 45000,
    mins: 480,
    enabled: true,
    consumables: [],
  }),
]);

module.exports = {
  BUILT_IN_SERVICE_DESCRIPTIONS,
  DEFAULT_SERVICES,
  getBuiltInDescriptionBackfill,
};
