import { describe, expect, it } from "vitest";
import { resolveRootLandingView } from "./navigation";
import type { LauncherGroup } from "./types";

const groups: LauncherGroup[] = [
  { id: "work", name: "Work", color: "#123456", parentId: null, items: [] },
  { id: "editor", name: "Editors", color: "#123456", parentId: "work", items: [] },
  { id: "terminal", name: "Terminals", color: "#123456", parentId: "work", items: [] },
  { id: "home", name: "Home", color: "#654321", parentId: null, items: [] },
];

describe("resolveRootLandingView", () => {
  it("returns the remembered child before the first child", () => {
    expect(resolveRootLandingView("work", groups, { work: "terminal" }))
      .toBe("terminal");
  });

  it("can restore the root summary itself", () => {
    expect(resolveRootLandingView("work", groups, { work: "work" }))
      .toBe("work");
  });

  it("falls back to the first child when the remembered view is invalid", () => {
    expect(resolveRootLandingView("work", groups, { work: "home" }))
      .toBe("editor");
  });

  it("falls back to the root when it has no children", () => {
    expect(resolveRootLandingView("home", groups, {})).toBe("home");
  });
});
