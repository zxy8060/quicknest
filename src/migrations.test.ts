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
      settings: { hotkey: "Shift+Q", hideOnLaunch: true },
    });

    expect(result.changed).toBe(true);
    expect(result.state.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.state.registryUsage).toEqual({});
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
      hideOnLaunch: false,
      iconSize: 32,
      opacity: 96,
      lastViewByRoot: {},
    });
  });

  it("restores and validates the last view of each root group", () => {
    const result = migrateLauncherState({
      version: 6,
      groups: [
        { id: "work", name: "Work", parentId: null, items: [] },
        { id: "editor", name: "Editors", parentId: "work", items: [] },
        { id: "home", name: "Home", parentId: null, items: [] },
        { id: "games", name: "Games", parentId: "home", items: [] },
      ],
      settings: {
        lastRootId: "work",
        lastViewId: "editor",
        lastViewByRoot: {
          work: "missing",
          home: "games",
          missing: "editor",
        },
      },
    });

    expect(result.state.settings.lastViewByRoot).toEqual({
      work: "editor",
      home: "games",
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

  it("preserves valid installed-app usage through a save/load round trip", () => {
    const result = migrateLauncherState({
      version: 7,
      registryUsage: {
        app: { launchCount: 4.8, lastLaunched: 12345 },
        invalid: { launchCount: -1, lastLaunched: 12 },
        broken: null,
      },
    });
    expect(result.state.registryUsage).toEqual({ app: { launchCount: 4, lastLaunched: 12345 } });
    const reloaded = migrateLauncherState(JSON.parse(JSON.stringify(result.state)));
    expect(reloaded.state.registryUsage).toEqual(result.state.registryUsage);
    expect(reloaded.changed).toBe(false);
  });
});
