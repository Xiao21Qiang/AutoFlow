import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { apiRequest } from "./services/api";

jest.mock("react-router-dom", () => jest.requireActual("../node_modules/react-router-dom/dist/index.js"), { virtual: true });
jest.mock("react-router/dom", () => jest.requireActual("../node_modules/react-router/dist/development/dom-export.js"), { virtual: true });
jest.mock("./services/api", () => ({
  apiRequest: jest.fn(),
}));
jest.mock("./assets/IMAGE/IMG_9802.jpg", () => "work-1.jpg");
jest.mock("./assets/IMAGE/IMG_9803.jpg", () => "work-2.jpg");
jest.mock("./assets/IMAGE/IMG_9809.jpg", () => "work-3.jpg");
jest.mock("./assets/IMAGE/IMG_9816.jpg", () => "work-4.jpg");
jest.mock("./assets/IMAGE/IMG_9817.jpg", () => "work-5.jpg");

const Home = require("./screens/Home").default;

beforeEach(() => {
  apiRequest.mockReturnValue(new Promise(() => {}));
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

test("places the portfolio carousel between the unchanged Hero and About sections", () => {
  const { container } = renderHome();
  const main = container.querySelector("main");
  const hero = container.querySelector(".heroBackdrop");
  const carousel = container.querySelector(".landingPortfolioCarouselSection");
  const about = container.querySelector("#about");

  expect(screen.getByRole("heading", { name: /Premium protection & advanced car care/i })).toBeInTheDocument();
  expect(main.firstElementChild).toBe(hero);
  expect(hero.compareDocumentPosition(carousel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(carousel.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("All Pro-Tec: Premium Care Built on Real Experience")).toBeInTheDocument();
});

test("reuses the existing portfolio imagery and wraps manual navigation", () => {
  const { container } = renderHome();
  const carousel = container.querySelector(".landingPortfolioCarouselSection");
  const works = container.querySelector("#work");
  const carouselImages = () => within(carousel).getAllByRole("img");
  const existingWorkImages = within(works).getAllByRole("img");

  expect(carouselImages().map((image) => image.getAttribute("src"))).toEqual(
    existingWorkImages.map((image) => image.getAttribute("src"))
  );
  expect(within(carousel).getByRole("button", { name: "Previous portfolio images" })).toBeInTheDocument();
  expect(within(carousel).getByRole("button", { name: "Next portfolio images" })).toBeInTheDocument();

  fireEvent.click(within(carousel).getByRole("button", { name: "Next portfolio images" }));
  expect(carouselImages()[0]).toHaveAccessibleName("All Pro-Tec portfolio work 2");
  fireEvent.click(within(carousel).getByRole("button", { name: "Previous portfolio images" }));
  expect(carouselImages()[0]).toHaveAccessibleName("All Pro-Tec portfolio work 1");
  fireEvent.click(within(carousel).getByRole("button", { name: "Previous portfolio images" }));
  expect(carouselImages()[0]).toHaveAccessibleName("All Pro-Tec portfolio work 6");
});

test("keeps the existing lower Our Works section and actions", () => {
  const { container } = renderHome();
  const works = container.querySelector("#work");

  expect(within(works).getByRole("heading", { name: "Our Works" })).toBeInTheDocument();
  expect(within(works).getByRole("button", { name: "Get a Quote" })).toBeInTheDocument();
  expect(within(works).getByRole("button", { name: "View more work" })).toBeInTheDocument();
});
