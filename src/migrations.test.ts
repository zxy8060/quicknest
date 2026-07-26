import { describe, expect, it } from "vitest";
import { migrateLauncherState } from "./migrations";
import { CURRENT_SCHEMA_VERSION } from "./types";

describe("migrateLauncherState", () => {
  it("fills fields missing from an old launcher file", () => {
    const result = migrateLauncherState({
      version: 1,
      groups: [
        {
          id: "work",
          name: "工作",
          items: [{ id: "editor", title: "编辑器", target: "C:\\Tools\\edit.exe" }],
        },
      ],
      settings: { hotkey: "Shift+Q" },
    });

    expect(result.changed).toBe(true);
    expect(result.state.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.state.groups[0].parentId).toBeNull();
    expect(result.state.groups[0].items[0]).toMatchObject({
      kind: "app",
      args: "",
      workingDir: "",
      favorite: false,
      launchCount: 0,
    });
    expect(result.state.settings).toMatchObject({
      hotkey: "Shift+Q",
      iconSize: 32,
      opacity: 96,
    });
  });

  it("promotes orphaned and over-nested groups to root groups", () => {
    const result = migrateLauncherState({
      version: CURRENT_SCHEMA_VERSION,
      groups: [
        { id: "root", name: "一级", parentId: null, items: [] },
        { id: "child", name: "二级", parentId: "root", items: [] },
        { id: "deep", name: "三级", parentId: "child", items: [] },
        { id: "orphan", name: "孤儿", parentId: "missing", items: [] },
      ],
      settings: {},
    });

    expect(result.state.groups.find((group) => group.id === "child")?.parentId)
      .toBe("root");
    expect(result.state.groups.find((group) => group.id === "deep")?.parentId)
      .toBeNull();
    expect(result.state.groups.find((group) => group.id === "orphan")?.parentId)
      .toBeNull();
  });

  it("rejects data created by a newer incompatible schema", () => {
    expect(() =>
      migrateLauncherState({
        version: CURRENT_SCHEMA_VERSION + 1,
        groups: [],
        settings: {},
      }),
    ).toThrow(/高于当前支持/);
  });
});
