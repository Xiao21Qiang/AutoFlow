import { fireEvent, render, screen } from "@testing-library/react";
import AdminServices from "./screens/admin/AdminServices";

const mockServices = [
  { id: "SVC-1", name: "Ceramic Coating", desc: "Gloss finish", category: "Coating", serviceType: "Basic Service", enabled: true, price: 1000, mins: 60 },
  { id: "SVC-2", name: "Window Tint", desc: "Heat rejection", category: "Tinting", serviceType: "Basic Service", enabled: true, price: 1500, mins: 90 },
  { id: "SVC-3", name: "Paint Film", desc: "Clear protective layer", category: "Protection", serviceType: "Package", enabled: true, price: 3000, mins: 120 },
  { id: "SVC-4", name: "Interior Detail", desc: "Cabin cleaning", category: "Cleaning", serviceType: "Basic Service", enabled: true, price: 900, mins: 60 },
  { id: "SVC-5", name: "Maintenance Wash", desc: "Exterior upkeep", category: "Wash", serviceType: "Basic Service", enabled: true, price: 500, mins: 45 },
  { id: "SVC-6", name: "Glass Polish", desc: "Visibility service", category: "Cleaning", serviceType: "Basic Service", enabled: true, price: 700, mins: 45 },
  { id: "SVC-7", name: "Engine Bay Detail", desc: "Detailed engine cleanup", category: "Cleaning", serviceType: "Basic Service", enabled: true, price: 1100, mins: 60 },
];

const mockContext = {
  services: mockServices,
  stockMonitoring: [],
  currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
  createService: jest.fn(),
  updateService: jest.fn(),
  toggleService: jest.fn(),
  deleteService: jest.fn(),
};

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => mockContext,
}));

function renderServices() {
  return render(<AdminServices />);
}

function searchFor(value) {
  fireEvent.change(screen.getByPlaceholderText("Search Services..."), { target: { value } });
}

function getRenderedCards(container) {
  return Array.from(container.querySelectorAll(".svcCard"));
}

describe("Search Service", () => {
  test("search by service name returns only matching services", () => {
    const { container } = renderServices();
    searchFor("ceramic");
    expect(screen.getByText("Ceramic Coating")).toBeInTheDocument();
    expect(screen.queryByText("Window Tint")).not.toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(1);
  });

  test("search by category returns only services in that category", () => {
    const { container } = renderServices();
    searchFor("tinting");
    expect(screen.getByText("Window Tint")).toBeInTheDocument();
    expect(screen.queryByText("Ceramic Coating")).not.toBeInTheDocument();
    expect(screen.queryByText("Paint Film")).not.toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(1);
  });

  test("unmatched non-empty search displays empty state and no service cards", () => {
    const { container } = renderServices();
    searchFor("no matching service");
    expect(screen.getByText("No services found.")).toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(0);
  });

  test("previous matching results are removed after changing to an unmatched query", () => {
    const { container } = renderServices();
    searchFor("ceramic");
    expect(screen.getByText("Ceramic Coating")).toBeInTheDocument();
    searchFor("zzzzzz");
    expect(screen.queryByText("Ceramic Coating")).not.toBeInTheDocument();
    expect(screen.getByText("No services found.")).toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(0);
  });

  test("clearing an unmatched query removes empty state and restores the normal service list", () => {
    const { container } = renderServices();
    searchFor("zzzzzz");
    expect(screen.getByText("No services found.")).toBeInTheDocument();
    searchFor("");
    expect(screen.queryByText("No services found.")).not.toBeInTheDocument();
    expect(screen.getByText("Ceramic Coating")).toBeInTheDocument();
    expect(screen.getByText("Window Tint")).toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(6);
  });

  test("search matching remains case-insensitive", () => {
    const { container } = renderServices();
    searchFor("CERAMIC");
    expect(screen.getByText("Ceramic Coating")).toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(1);
  });

  test("whitespace-only search behaves like an empty search", () => {
    const { container } = renderServices();
    searchFor("   ");
    expect(screen.queryByText("No services found.")).not.toBeInTheDocument();
    expect(screen.getByText("Ceramic Coating")).toBeInTheDocument();
    expect(getRenderedCards(container)).toHaveLength(6);
  });

  test("existing pagination behavior is preserved for empty-equivalent search", () => {
    renderServices();
    expect(screen.queryByText("Engine Bay Detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ">" }));
    expect(screen.getByText("Engine Bay Detail")).toBeInTheDocument();
    searchFor("   ");
    expect(screen.getByText("Engine Bay Detail")).toBeInTheDocument();
    expect(screen.queryByText("No services found.")).not.toBeInTheDocument();
  });
});
