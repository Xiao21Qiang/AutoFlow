/**
 * @jest-environment node
 */

const { DEFAULT_SERVICES } = require("../server/defaultServices");

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
});
