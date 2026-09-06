import { describe, expect, it } from "vitest";
import { createRecentOrder, rankRecentFrequentEntries, recentEntriesInOrder, recentEntryKey, registryUsageKey } from "./recent";
import type { LauncherGroup, LauncherItem } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const now = 2_000_000_000_000;

function item(
  id: string,
  launchCount: number,
  daysAgo?: number,
): LauncherItem {
  return {
    id,
    title: id,
    target: `C:\\Apps\\${id}.exe`,
    kind: "app",
    args: "",
    workingDir: "",
    notes: "",
    favorite: false,
    launchCount,
    lastLaunched: daysAgo === undefined ? undefined : now - daysAgo * DAY_MS,
  };
}

describe("rankRecentFrequentEntries", () => {
  it("keeps existing ranks stable until restart and appends first-time launches", () => {
    const first = item("first", 16, 0);
    const second = item("second", 1, 0);
    const newcomer = item("new", 0);
    const group: LauncherGroup = { id: "apps", name: "Apps", color: "", items: [first, second, newcomer] };
    const registry: LauncherGroup = { id: "__registry__", name: "Installed", color: "", items: [] };
    const order = createRecentOrder([group], {}, now);
    second.launchCount = 100;
    newcomer.launchCount = 1;
    newcomer.lastLaunched = now;
    order.push(recentEntryKey(newcomer));
    expect(recentEntriesInOrder([group], registry, {}, order).map(({ item }) => item.id))
      .toEqual(["first", "second", "new"]);
    const restartedOrder = createRecentOrder([group], {}, now);
    expect(recentEntriesInOrder([group], registry, {}, restartedOrder).map(({ item }) => item.id))
      .toEqual(["second", "first", "new"]);
    group.items.shift();
    expect(recentEntriesInOrder([group], registry, {}, order).map(({ item }) => item.id))
      .toEqual(["second", "new"]);
  });

  it("restores registry usage across scans and late loading without relying on transient IDs", () => {
    const installed = item("registry-1", 0);
    const key = registryUsageKey(installed);
    const usage = { [key]: { launchCount: 50, lastLaunched: now } };
    const custom = item("custom", 1, 0);
    const group: LauncherGroup = { id: "apps", name: "Apps", color: "", items: [custom] };
    const registry: LauncherGroup = { id: "__registry__", name: "Installed", color: "", items: [] };
    const order = createRecentOrder([group], usage, now);
    expect(recentEntriesInOrder([group], registry, usage, order)).toHaveLength(1);
    registry.items = [{ ...installed, id: "registry-99", target: installed.target.toUpperCase().replace(/\\/g, "/") }];
    const result = recentEntriesInOrder([group], registry, usage, order);
    expect(result.map(({ item }) => item.id)).toEqual(["registry-99", "custom"]);
    expect(result[0].item.launchCount).toBe(50);
    expect(registry.items[0].launchCount).toBe(0);
    expect(registryUsageKey({ ...installed, args: "--different" })).not.toBe(key);
  });

  it("balances launch frequency with recency decay", () => {
    const groups: LauncherGroup[] = [{
      id: "apps",
      name: "Apps",
      color: "#123456",
      parentId: null,
      items: [
        item("frequent", 16, 10),
        item("recent", 1, 0),
        item("stale", 64, 120),
      ],
    }];

    expect(rankRecentFrequentEntries(groups, now).map(({ item }) => item.id))
      .toEqual(["frequent", "recent", "stale"]);
  });

  it("excludes items that have never been launched", () => {
    const groups: LauncherGroup[] = [{
      id: "apps",
      name: "Apps",
      color: "#123456",
      parentId: null,
      items: [item("used", 1, 0), item("unused", 0)],
    }];

    expect(rankRecentFrequentEntries(groups, now).map(({ item }) => item.id))
      .toEqual(["used"]);
  });
});
