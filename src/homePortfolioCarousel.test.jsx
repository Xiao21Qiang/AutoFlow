import { render, screen, within } from "@testing-library/react";
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

test("places the portfolio carousel directly after the Navbar and before the unchanged Hero and About sections", () => {
  const { container } = renderHome();
  const page = container.querySelector(".page");
  const navbar = container.querySelector(".navWrap");
  const main = container.querySelector("main");
  const hero = container.querySelector(".heroBackdrop");
  const carousel = container.querySelector(".landingPortfolioCarouselSection");
  const about = container.querySelector("#about");

  expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Premium protection & advanced car care/i })).toBeInTheDocument();
  expect(page.firstElementChild).toBe(navbar);
  expect(navbar.nextElementSibling).toBe(main);
  expect(main.firstElementChild).toBe(carousel);
  expect(carousel.nextElementSibling).toBe(hero);
  expect(hero.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("All Pro-Tec: Premium Care Built on Real Experience")).toBeInTheDocument();
  expect(screen.queryByText("Total Bookings")).not.toBeInTheDocument();
});

test("reuses the existing portfolio imagery in an accessible duplicated looping track without controls", () => {
  const { container } = renderHome();
  const carousel = container.querySelector(".landingPortfolioCarouselSection");
  const works = container.querySelector("#work");
  const track = carousel.querySelector(".landingPortfolioCarouselTrack");
  const sequences = carousel.querySelectorAll(".landingPortfolioCarouselSequence");
  const carouselImages = within(carousel).getAllByRole("img");
  const existingWorkImages = within(works).getAllByRole("img");

  expect(carouselImages.map((image) => image.getAttribute("src"))).toEqual(
    existingWorkImages.map((image) => image.getAttribute("src"))
  );
  expect(track).toContainElement(sequences[0]);
  expect(track).toContainElement(sequences[1]);
  expect(sequences).toHaveLength(2);
  expect(sequences[0].querySelectorAll("img")).toHaveLength(6);
  expect(sequences[1].querySelectorAll("img")).toHaveLength(6);
  expect(sequences[1]).toHaveAttribute("aria-hidden", "true");
  expect(within(carousel).queryByRole("button", { name: "Previous portfolio images" })).not.toBeInTheDocument();
  expect(within(carousel).queryByRole("button", { name: "Next portfolio images" })).not.toBeInTheDocument();
});

test("keeps the existing lower Our Works section and actions", () => {
  const { container } = renderHome();
  const works = container.querySelector("#work");

  expect(within(works).getByRole("heading", { name: "Our Works" })).toBeInTheDocument();
  expect(within(works).getByRole("button", { name: "Get a Quote" })).toBeInTheDocument();
  expect(within(works).getByRole("button", { name: "View more work" })).toBeInTheDocument();
});
