import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { siteConfig } from "@/lib/site-config";
import { ProjectCards } from "@/components/project-cards";

afterEach(cleanup);
const projects = siteConfig.projects.filter((project) => "featured" in project);
const names = ["Punjab Ice Factory", "She Shelter Girls Hostel", "Mr Sabir House", "Mr Iqbal Malik House", "Saddar Bazar Fronus Solar System", "Mr Syed Mozaam House", "Darul Islam Colony Solar Project"];

test("renders exactly the seven verified projects with independent image pairs and no exposed descriptions", () => {
  const { container } = render(<ProjectCards />);
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(names);
  expect(screen.queryByText("Not provided")).toBeNull();
  expect(screen.queryByText(/representative|to be updated/i)).toBeNull();
  expect(screen.queryByRole("button", { name: /Bilal|Ahsan|Green Wood/ })).toBeNull();
  expect(new Set([...container.querySelectorAll("img")].map((image) => image.getAttribute("src"))).size).toBe(14);
  for (const button of screen.getAllByRole("button")) {
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(button.getAttribute("aria-controls")!)?.getAttribute("aria-hidden")).toBe("true");
  }
  for (const project of projects) {
    const card = screen.getByRole("button", { name: project.title }).closest("article")!;
    expect([...card.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([project.primaryImage, project.secondaryImage]);
    expect(existsSync(`public${project.primaryImage}`)).toBe(true);
    expect(existsSync(`public${project.secondaryImage}`)).toBe(true);
    expect(card.querySelector(".lucide-map-pin")).toBeTruthy();
    expect(card.querySelector(".lucide-zap")).toBeTruthy();
  }
});

test("retains client technical values including the unitless panel rating", () => {
  render(<ProjectCards />);
  expect(screen.getByText("Client-provided panel rating: 585").textContent).toBe("Client-provided panel rating: 585");
  expect(screen.getByText("12 kW Hybrid + 20 kW Lithium Battery Backup")).toBeTruthy();
  expect(screen.getByText("PV 16000")).toBeTruthy();
  expect(screen.getByText("14 × LONGi Hi-MO X10 solar panels")).toBeTruthy();
});

test.each(names)("%s expands and collapses using keyboard with the correct image", async (name) => {
  const user = userEvent.setup();
  render(<ProjectCards />);
  const button = screen.getByRole("button", { name });
  for (let i = 0; i <= names.indexOf(name); i++) await user.tab();
  expect(document.activeElement).toBe(button);
  await user.keyboard("{Enter}");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByAltText(projects.find((project) => project.title === name)!.secondaryAlt).getAttribute("aria-hidden")).toBe("false");
  expect(document.getElementById(button.getAttribute("aria-controls")!)?.getAttribute("aria-hidden")).toBe("false");
  await user.keyboard(" ");
  expect(button.getAttribute("aria-expanded")).toBe("false");
});

test.each(names)("switches from %s to every other project and isolates hover from selection", (name) => {
  render(<ProjectCards />);
  const buttons = screen.getAllByRole("button");
  const source = screen.getByRole("button", { name });
    for (const target of buttons.filter((button) => button !== source)) {
      if (source.getAttribute("aria-expanded") !== "true") fireEvent.click(source);
      fireEvent.mouseEnter(target);
      expect(source.getAttribute("aria-expanded")).toBe("true");
      fireEvent.mouseLeave(target);
      fireEvent.click(target);
      expect(buttons.filter((button) => button.getAttribute("aria-expanded") === "true")).toEqual([target]);
      fireEvent.click(target);
    }
});

test("touch taps expand, switch, and collapse without hover", async () => {
  const user = userEvent.setup();
  render(<ProjectCards />);
  const buttons = screen.getAllByRole("button");
  for (const button of buttons) {
    await user.pointer({ keys: "[TouchA]", target: button });
    expect(buttons.filter((candidate) => candidate.getAttribute("aria-expanded") === "true")).toEqual([button]);
  }
  await user.pointer({ keys: "[TouchA]", target: buttons[6] });
  expect(buttons.every((button) => button.getAttribute("aria-expanded") === "false")).toBe(true);
});
