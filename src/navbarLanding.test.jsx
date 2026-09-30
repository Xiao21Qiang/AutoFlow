import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./components/Navbar";

jest.mock("react-router-dom", () => jest.requireActual("../node_modules/react-router-dom/dist/index.js"), { virtual: true });
jest.mock("react-router/dom", () => jest.requireActual("../node_modules/react-router/dist/development/dom-export.js"), { virtual: true });

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

test("landing navigation adds Home first and preserves existing destinations and CTAs", () => {
  render(<MemoryRouter initialEntries={["/"]}><Navbar /></MemoryRouter>);

  const links = within(screen.getByRole("navigation")).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual([
    "Home",
    "About Us",
    "What We Offer",
    "Portfolio",
    "Our Edge",
    "Contact Us",
  ]);
  expect(screen.getByRole("button", { name: "Get Quote" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log In / Register" })).toBeInTheDocument();
});

test("Home and the brand share the same smooth top-of-page behavior", async () => {
  const scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<MemoryRouter initialEntries={["/"]}><Navbar /></MemoryRouter>);

  await userEvent.click(screen.getByRole("link", { name: "Home" }));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });

  scrollTo.mockClear();
  await userEvent.click(screen.getByRole("link", { name: /All Pro-Tec ALL PRO-TEC Car Care Services/i }));
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
});
