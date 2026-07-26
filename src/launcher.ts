import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import {
  createId,
  DEFAULT_STATE,
  plainClone,
  type ItemKind,
  type LauncherGroup,
  type LauncherItem,
  type LauncherState,
} from "./types";

export const launcher = reactive<LauncherState>(
  plainClone(DEFAULT_STATE),
);

let saveTimer: number | undefined;

export async function loadLauncher() {
  const saved = await invoke<LauncherState | null>("load_state");
  if (saved?.groups?.length) {
    const savedVersion = saved.version ?? 1;
    Object.assign(launcher, saved);
    launcher.version = 6;
    if (savedVersion < 4 && launcher.settings.iconSize >= 40) {
      launcher.settings.iconSize = 32;
    }
    launcher.groups.forEach((group) => {
      group.parentId ??= null;
    });
  } else {
    await hydrateIcons();
    await saveLauncher();
  }
}

export function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveLauncher(), 180);
}

export async function saveLauncher() {
  await invoke("save_state", { state: plainClone(launcher) });
}

export async function hydrateIcons() {
  const items = launcher.groups.flatMap((group) => group.items);
  await Promise.all(
    items.map(async (item) => {
      if (!item.icon && item.kind !== "url") {
        item.icon = await fetchIcon(item.target);
      }
    }),
  );
}

export async function addPaths(groupId: string, paths: string[]) {
  const group = launcher.groups.find((entry) => entry.id === groupId);
  if (!group) return;
  const additions = await Promise.all(paths.map(pathToItem));
  group.items.push(...additions);
  scheduleSave();
}

export function addUrl(groupId: string, target: string, title?: string) {
  const group = launcher.groups.find((entry) => entry.id === groupId);
  if (!group) return;
  group.items.push({
    id: createId(),
    title: title?.trim() || hostFromUrl(target),
    target,
    kind: "url",
    args: "",
    workingDir: "",
    notes: "",
    favorite: false,
    launchCount: 0,
  });
  scheduleSave();
}

export function addGroup(name: string, color: string): LauncherGroup {
  return addNestedGroup(name, color, null);
}

export function addNestedGroup(
  name: string,
  color: string,
  parentId: string | null,
): LauncherGroup {
  const group: LauncherGroup = {
    id: createId(),
    name: name.trim() || "新分组",
    color,
    parentId,
    items: [],
  };
  launcher.groups.push(group);
  scheduleSave();
  return group;
}

export function removeGroup(groupId: string) {
  const group = launcher.groups.find((entry) => entry.id === groupId);
  if (!group) return false;
  const ids = new Set([groupId]);
  if (!group.parentId) {
    launcher.groups
      .filter((entry) => entry.parentId === groupId)
      .forEach((entry) => ids.add(entry.id));
  }
  if (launcher.groups.length - ids.size < 1) return false;
  launcher.groups.splice(
    0,
    launcher.groups.length,
    ...launcher.groups.filter((entry) => !ids.has(entry.id)),
  );
  scheduleSave();
  return true;
}

export function updateItem(
  groupId: string,
  item: LauncherItem,
  destinationGroupId: string,
) {
  const source = launcher.groups.find((group) => group.id === groupId);
  const destination = launcher.groups.find(
    (group) => group.id === destinationGroupId,
  );
  if (!source || !destination) return;
  const index = source.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) source.items.splice(index, 1);
  destination.items.push(plainClone(item));
  scheduleSave();
}

export function removeItem(groupId: string, itemId: string) {
  const group = launcher.groups.find((entry) => entry.id === groupId);
  const index = group?.items.findIndex((item) => item.id === itemId) ?? -1;
  if (!group || index < 0) return;
  group.items.splice(index, 1);
  scheduleSave();
}

export function removeItems(
  selections: Array<{ groupId: string; itemId: string }>,
) {
  const itemIdsByGroup = new Map<string, Set<string>>();
  selections.forEach(({ groupId, itemId }) => {
    const itemIds = itemIdsByGroup.get(groupId) ?? new Set<string>();
    itemIds.add(itemId);
    itemIdsByGroup.set(groupId, itemIds);
  });

  let removed = 0;
  launcher.groups.forEach((group) => {
    const itemIds = itemIdsByGroup.get(group.id);
    if (!itemIds?.size) return;
    const remaining = group.items.filter((item) => !itemIds.has(item.id));
    removed += group.items.length - remaining.length;
    group.items.splice(0, group.items.length, ...remaining);
  });
  if (removed) scheduleSave();
  return removed;
}

export async function fetchIcon(path: string) {
  try {
    return await invoke<string>("icon_for_path", { path });
  } catch {
    return undefined;
  }
}

async function pathToItem(path: string): Promise<LauncherItem> {
  const name = path.split(/[\\/]/).pop() || path;
  const extension = name.includes(".")
    ? name.split(".").pop()?.toLowerCase()
    : "";
  const kind: ItemKind =
    extension === "exe" || extension === "lnk" ? "app" : extension ? "file" : "folder";
  return {
    id: createId(),
    title: name.replace(/\.[^.]+$/, ""),
    target: path,
    kind,
    icon: await fetchIcon(path),
    args: "",
    workingDir: "",
    notes: "",
    favorite: false,
    launchCount: 0,
  };
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "网页";
  }
}
