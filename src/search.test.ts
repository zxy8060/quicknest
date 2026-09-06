import { describe, expect, it } from "vitest";
import { searchAllSoftware } from "./search";
import type { LauncherGroup, LauncherItem } from "./types";

function item(id: string, title: string, target: string, notes = ""): LauncherItem {
  return {
    id,
    title,
    target,
    kind: "app",
    args: "",
    workingDir: "",
    notes,
    favorite: false,
    launchCount: 0,
  };
}

const groups: LauncherGroup[] = [
  {
    id: "work",
    name: "Work",
    color: "#123456",
    parentId: null,
    items: [item("editor", "Editor", "C:\\Apps\\editor.exe")],
  },
  {
    id: "home",
    name: "Home",
    color: "#654321",
    parentId: null,
    items: [item("player", "Player", "C:\\Apps\\player.exe", "Music")],
  },
];

const registryGroup: LauncherGroup = {
  id: "__registry__",
  name: "Installed apps",
  color: "#abcdef",
  parentId: null,
  items: [item("registry-browser", "Browser", "C:\\Browser\\browser.exe")],
};

describe("searchAllSoftware", () => {
  it("searches every custom group rather than the selected page", () => {
    expect(searchAllSoftware(groups, registryGroup, "music").map(({ item }) => item.id))
      .toEqual(["player"]);
  });

  it("includes registry applications", () => {
    expect(searchAllSoftware(groups, registryGroup, "browser.exe").map(({ item }) => item.id))
      .toEqual(["registry-browser"]);
  });
});
