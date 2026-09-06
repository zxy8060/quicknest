import type { LauncherGroup, LauncherItem, LaunchUsage } from "./types";
import type { LauncherEntry } from "./search";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RECENCY_HALF_LIFE_DAYS = 30;

// Registry IDs are generated per scan, so usage is keyed by launch identity.
export function registryUsageKey(item: LauncherItem): string {
  const path = (value: string) => value.trim().replace(/\//g, "\\").toLowerCase();
  return JSON.stringify([path(item.target), item.args, path(item.workingDir)]);
}

export function recentEntryKey(item: LauncherItem): string {
  return item.id.startsWith("registry-")
    ? `registry:${registryUsageKey(item)}`
    : `custom:${item.id}`;
}

export function createRecentOrder(
  groups: LauncherGroup[],
  registryUsage: Record<string, LaunchUsage>,
  now = Date.now(),
): string[] {
  const usage = groups.flatMap((group) => group.items
    .filter((item) => Boolean(item.lastLaunched))
    .map((item) => ({ key: recentEntryKey(item), ...item })));
  const entries = [
    ...usage,
    ...Object.entries(registryUsage).map(([key, stats]) => ({
      key: `registry:${key}`, ...stats,
    })),
  ];
  return entries.sort((a, b) =>
    recentFrequentScore(b.launchCount, b.lastLaunched, now)
      - recentFrequentScore(a.launchCount, a.lastLaunched, now)
    || (b.lastLaunched ?? 0) - (a.lastLaunched ?? 0)
    || b.launchCount - a.launchCount,
  ).map(({ key }) => key);
}

export function recentEntriesInOrder(
  groups: LauncherGroup[],
  registryGroup: LauncherGroup,
  registryUsage: Record<string, LaunchUsage>,
  order: string[],
): LauncherEntry[] {
  const entries = new Map<string, LauncherEntry>();
  groups.forEach((group) => group.items.forEach((item) => {
    if (item.lastLaunched) entries.set(recentEntryKey(item), { item, group });
  }));
  registryGroup.items.forEach((item) => {
    const stats = registryUsage[registryUsageKey(item)];
    if (stats) entries.set(recentEntryKey(item), {
      item: { ...item, ...stats }, group: registryGroup,
    });
  });
  return order.flatMap((key) => {
    const entry = entries.get(key);
    return entry ? [entry] : [];
  });
}

export function rankRecentFrequentEntries(
  groups: LauncherGroup[],
  now = Date.now(),
): LauncherEntry[] {
  const emptyRegistry: LauncherGroup = { id: "__registry__", name: "", color: "", items: [] };
  return recentEntriesInOrder(groups, emptyRegistry, {}, createRecentOrder(groups, {}, now));
}

function recentFrequentScore(
  launchCount: number,
  lastLaunched: number | undefined,
  now: number,
) {
  const ageDays = Math.max(0, now - (lastLaunched ?? 0)) / DAY_MS;
  const frequency = Math.log2(Math.max(1, launchCount) + 1);
  const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return frequency * recency;
}
