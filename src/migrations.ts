import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_STATE,
  createId,
  plainClone,
  type ItemKind,
  type LauncherGroup,
  type LauncherItem,
  type LauncherSettings,
  type LauncherState,
  type Theme,
} from "./types";

type UnknownRecord = Record<string, unknown>;

export type MigrationResult = {
  state: LauncherState;
  changed: boolean;
};

const ITEM_KINDS = new Set<ItemKind>(["app", "file", "folder", "url"]);
const THEMES = new Set<Theme>(["midnight", "mist"]);
const GROUP_COLORS = ["#7c9cff", "#67d6b3", "#f2aa6b", "#e58bb4", "#a88ef0"];

export function migrateLauncherState(input: unknown): MigrationResult {
  if (!isRecord(input)) {
    return { state: plainClone(DEFAULT_STATE), changed: true };
  }

  const sourceVersion = finiteNumber(input.version, 1);
  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `数据版本 ${sourceVersion} 高于当前支持的 ${CURRENT_SCHEMA_VERSION}，请升级 QuickNest`,
    );
  }

  const normalizedGroups = normalizeGroups(input.groups);
  const groups = normalizedGroups.length
    ? normalizedGroups
    : plainClone(DEFAULT_STATE.groups);
  const state: LauncherState = {
    version: CURRENT_SCHEMA_VERSION,
    groups,
    settings: normalizeSettings(input.settings, groups),
  };

  return {
    state,
    changed: sourceVersion !== CURRENT_SCHEMA_VERSION
      || JSON.stringify(input) !== JSON.stringify(state),
  };
}

function normalizeGroups(value: unknown): LauncherGroup[] {
  if (!Array.isArray(value)) return [];

  const usedGroupIds = new Set<string>();
  const rawGroups = value
    .filter(isRecord)
    .map((group, index) => {
      const id = uniqueId(stringValue(group.id), usedGroupIds);
      return {
        id,
        name: stringValue(group.name).trim() || `分组 ${index + 1}`,
        color: validColor(group.color)
          ? group.color
          : GROUP_COLORS[index % GROUP_COLORS.length],
        rawParentId: nullableString(group.parentId),
        items: normalizeItems(group.items),
      };
    });

  const rawRootIds = new Set(
    rawGroups
      .filter((group) => !group.rawParentId)
      .map((group) => group.id),
  );

  return rawGroups.map((group) => ({
    id: group.id,
    name: group.name,
    color: group.color,
    parentId:
      group.rawParentId
      && group.rawParentId !== group.id
      && rawRootIds.has(group.rawParentId)
        ? group.rawParentId
        : null,
    items: group.items,
  }));
}

function normalizeItems(value: unknown): LauncherItem[] {
  if (!Array.isArray(value)) return [];
  const usedItemIds = new Set<string>();

  return value.filter(isRecord).map((item) => {
    const target = stringValue(item.target).trim();
    const title = stringValue(item.title).trim() || titleFromTarget(target);
    const kind = ITEM_KINDS.has(item.kind as ItemKind)
      ? item.kind as ItemKind
      : inferKind(target);
    const normalized: LauncherItem = {
      id: uniqueId(stringValue(item.id), usedItemIds),
      title,
      target,
      kind,
      args: stringValue(item.args),
      workingDir: stringValue(item.workingDir),
      notes: stringValue(item.notes),
      favorite: booleanValue(item.favorite, false),
      launchCount: Math.max(0, Math.floor(finiteNumber(item.launchCount, 0))),
    };
    const icon = stringValue(item.icon);
    if (icon) normalized.icon = icon;
    const lastLaunched = finiteNumber(item.lastLaunched, 0);
    if (lastLaunched > 0) normalized.lastLaunched = lastLaunched;
    return normalized;
  });
}

function normalizeSettings(
  value: unknown,
  groups: LauncherGroup[],
): LauncherSettings {
  const settings = isRecord(value) ? value : {};
  const roots = groups.filter((group) => !group.parentId);
  const validViewIds = new Set([
    "all",
    "recent",
    "favorites",
    "registry",
    ...groups.map((group) => group.id),
  ]);
  const validRootIds = new Set(roots.map((group) => group.id));
  const lastViewId = stringValue(settings.lastViewId);
  const lastRootId = stringValue(settings.lastRootId);
  const theme = THEMES.has(settings.theme as Theme)
    ? settings.theme as Theme
    : DEFAULT_STATE.settings.theme;

  return {
    hotkey: stringValue(settings.hotkey).trim() || DEFAULT_STATE.settings.hotkey,
    startOnBoot: booleanValue(
      settings.startOnBoot,
      DEFAULT_STATE.settings.startOnBoot,
    ),
    hideOnLaunch: booleanValue(
      settings.hideOnLaunch,
      DEFAULT_STATE.settings.hideOnLaunch,
    ),
    hideOnBlur: booleanValue(
      settings.hideOnBlur,
      DEFAULT_STATE.settings.hideOnBlur,
    ),
    iconSize: snap(
      clamp(
        finiteNumber(settings.iconSize, DEFAULT_STATE.settings.iconSize),
        20,
        64,
      ),
      4,
    ),
    opacity: Math.round(
      clamp(
        finiteNumber(settings.opacity, DEFAULT_STATE.settings.opacity),
        82,
        100,
      ),
    ),
    theme,
    lastViewId: validViewIds.has(lastViewId) ? lastViewId : "all",
    lastRootId: validRootIds.has(lastRootId)
      ? lastRootId
      : roots[0]?.id ?? "",
  };
}

function inferKind(target: string): ItemKind {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    return "url";
  }
  if (/[\\/]$/.test(target)) return "folder";
  const extension = target.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
  if (extension === "exe" || extension === "com" || extension === "lnk") {
    return "app";
  }
  return extension ? "file" : "folder";
}

function titleFromTarget(target: string) {
  const name = target.split(/[\\/]/).pop() || target;
  return name.replace(/\.[^.]+$/, "") || "未命名项目";
}

function uniqueId(candidate: string, used: Set<string>) {
  let id = candidate.trim() || createId();
  while (used.has(id)) id = createId();
  used.add(id);
  return id;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  const normalized = stringValue(value).trim();
  return normalized || null;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function snap(value: number, step: number) {
  return Math.round(value / step) * step;
}

function validColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
