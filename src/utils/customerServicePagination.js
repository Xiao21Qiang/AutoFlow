const MAX_BASIC_PER_PAGE = 3;
const MAX_CARDS_PER_PAGE = 6;
const PACKAGE_TARGET_PER_NON_FINAL_PAGE = 3;

export function getCustomerServiceType(service = {}) {
  const raw = String(service.serviceType || "").trim().toLowerCase();
  if (raw === "package") return "Package";
  if (raw === "basic service") return "Basic Service";

  const combined = `${String(service.name || "").trim()} ${String(service.desc || "").trim()}`.toLowerCase();
  if (combined.includes("+") || combined.includes(" package") || combined.includes("bundle") || combined.includes("combo")) {
    return "Package";
  }

  return "Basic Service";
}

export function paginateCustomerServices(services = []) {
  const basicServices = [];
  const packages = [];

  services.forEach((service) => {
    if (getCustomerServiceType(service) === "Package") packages.push(service);
    else basicServices.push(service);
  });

  let pageCount = 1;
  while (true) {
    const finalBasicCount = basicServices.slice(
      (pageCount - 1) * MAX_BASIC_PER_PAGE,
      pageCount * MAX_BASIC_PER_PAGE
    ).length;
    const packageCapacity =
      PACKAGE_TARGET_PER_NON_FINAL_PAGE * Math.max(0, pageCount - 1) +
      Math.max(0, MAX_CARDS_PER_PAGE - finalBasicCount);

    if (basicServices.length <= MAX_BASIC_PER_PAGE * pageCount && packages.length <= packageCapacity) break;
    pageCount += 1;
  }

  let packageIndex = 0;
  return Array.from({ length: pageCount }, (_, index) => {
    const pageBasicServices = basicServices.slice(
      index * MAX_BASIC_PER_PAGE,
      (index + 1) * MAX_BASIC_PER_PAGE
    );
    const isFinalPage = index === pageCount - 1;
    const packageCount = isFinalPage
      ? packages.length - packageIndex
      : Math.min(PACKAGE_TARGET_PER_NON_FINAL_PAGE, packages.length - packageIndex);
    const pagePackages = packages.slice(packageIndex, packageIndex + packageCount);
    packageIndex += packageCount;

    return {
      basicServices: pageBasicServices,
      packages: pagePackages,
    };
  });
}
