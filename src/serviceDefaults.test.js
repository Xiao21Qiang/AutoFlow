/**
 * @jest-environment node
 */

const {
  BUILT_IN_SERVICE_DESCRIPTIONS,
  DEFAULT_SERVICES,
  getBuiltInDescriptionBackfill,
} = require("../server/defaultServices");

describe("default service descriptions", () => {
  test("every canonical built-in service has a concise authoritative description", () => {
    expect(DEFAULT_SERVICES).toEqual([
      expect.objectContaining({
        name: "Graphene Coating",
        desc: "Adds a glossy protective coating to the vehicle's exterior.",
      }),
      expect.objectContaining({
        name: "Ceramic Coating",
        desc: "Applies a ceramic coating that helps protect the vehicle's exterior and maintain its finish.",
      }),
      expect.objectContaining({
        name: "Paint Protection Film",
        desc: "Applies a protective film to help shield painted surfaces from everyday wear.",
      }),
    ]);
    DEFAULT_SERVICES.forEach((service) => {
      expect(service.desc.trim()).not.toBe("");
      expect(service.desc).not.toBe("No description available.");
    });
  });

  test("known built-ins receive only missing or placeholder descriptions idempotently", () => {
    [undefined, "", "   ", "...", " No description available. "].forEach((desc) => {
      expect(getBuiltInDescriptionBackfill({ name: "Motor Coating", desc })).toBe(
        "Provides a fixed-price coating service tailored for motorcycles."
      );
    });

    const service = { name: "Car Wash", desc: "..." };
    service.desc = getBuiltInDescriptionBackfill(service);
    expect(service.desc).toBe("Provides a routine wash for the selected vehicle size.");
    expect(getBuiltInDescriptionBackfill(service)).toBeNull();
  });

  test("meaningful Admin and custom service descriptions are never overwritten", () => {
    expect(getBuiltInDescriptionBackfill({ name: "Tint", desc: "Admin-written tint description." })).toBeNull();
    expect(getBuiltInDescriptionBackfill({ name: "Custom Interior Detail", desc: "..." })).toBeNull();
  });

  test("the canonical backfill catalog covers every known built-in service and package", () => {
    expect(BUILT_IN_SERVICE_DESCRIPTIONS).toEqual([
      { name: "Graphene Coating", desc: "Adds a glossy protective coating to the vehicle's exterior." },
      { name: "Ceramic Coating", desc: "Applies a ceramic coating that helps protect the vehicle's exterior and maintain its finish." },
      { name: "Paint Protection Film", desc: "Applies a protective film to help shield painted surfaces from everyday wear." },
      { name: "Motor Coating", desc: "Provides a fixed-price coating service tailored for motorcycles." },
      { name: "Tint", desc: "Applies window tint to the vehicle." },
      { name: "Car Wash", desc: "Provides a routine wash for the selected vehicle size." },
      { name: "Maintenance + Hydrophobic Seal", desc: "Combines maintenance service with a hydrophobic seal for the vehicle's finish." },
      { name: "Maintenance + Light Buffing", desc: "Combines maintenance service with light buffing for the vehicle's finish." },
      { name: "[PLATINUM] Graphene + PPF package", desc: "Combines graphene coating and paint protection film in a single package." },
    ]);
  });
});
