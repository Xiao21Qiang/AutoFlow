const DEFAULT_SERVICES = Object.freeze([
  Object.freeze({
    id: "SVC-1001",
    name: "Graphene Coating",
    desc: "Adds a glossy protective coating to the vehicle's exterior.",
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
    desc: "Applies a ceramic coating that helps protect the vehicle's exterior and maintain its finish.",
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
    desc: "Applies a protective film to help shield painted surfaces from everyday wear.",
    serviceType: "Basic Service",
    category: "Protection",
    price: 45000,
    mins: 480,
    enabled: true,
    consumables: [],
  }),
]);

module.exports = { DEFAULT_SERVICES };
