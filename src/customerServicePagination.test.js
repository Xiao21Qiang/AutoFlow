import { getCustomerServiceType, paginateCustomerServices } from "./utils/customerServicePagination";

function buildServices(basicCount, packageCount) {
  return [
    ...Array.from({ length: basicCount }, (_, index) => ({
      id: `BASIC-${index + 1}`,
      name: `Basic Service ${index + 1}`,
      serviceType: "Basic Service",
    })),
    ...Array.from({ length: packageCount }, (_, index) => ({
      id: `PACKAGE-${index + 1}`,
      name: `Package Service ${index + 1}`,
      serviceType: "Package",
    })),
  ];
}

describe("Customer Services category-aware pagination", () => {
  test("distributes 8 Basic Services and 10 Packages as 3+3, 3+3, and 2+4", () => {
    const services = buildServices(8, 10);
    const pages = paginateCustomerServices(services);

    expect(pages.map((page) => [page.basicServices.length, page.packages.length])).toEqual([
      [3, 3],
      [3, 3],
      [2, 4],
    ]);
  });

  test("preserves category order and includes every service exactly once", () => {
    const services = buildServices(8, 10);
    const pages = paginateCustomerServices(services);
    const pagedBasics = pages.flatMap((page) => page.basicServices.map((service) => service.id));
    const pagedPackages = pages.flatMap((page) => page.packages.map((service) => service.id));
    const allPagedIds = [...pagedBasics, ...pagedPackages];

    expect(pagedBasics).toEqual(Array.from({ length: 8 }, (_, index) => `BASIC-${index + 1}`));
    expect(pagedPackages).toEqual(Array.from({ length: 10 }, (_, index) => `PACKAGE-${index + 1}`));
    expect(new Set(allPagedIds).size).toBe(services.length);
    expect(allPagedIds).toHaveLength(services.length);
  });

  test("adapts to category-only and inferred-type result sets without empty trailing pages", () => {
    const packageOnlyPages = paginateCustomerServices(buildServices(0, 10));
    expect(packageOnlyPages.map((page) => page.packages.length)).toEqual([3, 3, 4]);
    expect(packageOnlyPages.every((page) => page.basicServices.length + page.packages.length > 0)).toBe(true);

    expect(getCustomerServiceType({ name: "Maintenance + Seal", desc: "", serviceType: "" })).toBe("Package");
    expect(getCustomerServiceType({ name: "Car Wash", desc: "Routine wash", serviceType: "" })).toBe("Basic Service");
  });
});
