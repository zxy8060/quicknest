import { invoke } from "@tauri-apps/api/core";
import { reactive } from "vue";
import { migrateLauncherState } from "./migrations";
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

type LoadStateResponse = {
  state: unknown | null;
  recoveredFromBackup: boolean;
};

type PendingSave = {
  revision: number;
  snapshot: LauncherState;
};

let saveTimer: number | undefined;
let nextSaveRevision = 0;
let persistedSaveRevision = 0;
let pendingSave: PendingSave | undefined;
let activeSave: Promise<void> | undefined;
let persistenceErrorHandler: ((error: unknown) => void) | undefined;

export async function loadLauncher() {
  const loaded = await invoke<LoadStateResponse>("load_state");
  if (loaded.state) {
    const migrated = migrateLauncherState(loaded.state);
    Object.assign(launcher, migrated.state);
    if (migrated.changed || loaded.recoveredFromBackup) {
      await saveLauncher();
    }
    return {
      recoveredFromBackup: loaded.recoveredFromBackup,
      migrated: migrated.changed,
    };
  } else {
    Object.assign(launcher, plainClone(DEFAULT_STATE));
    await saveLauncher();
    return { recoveredFromBackup: false, migrated: false };
  }
}

export function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void saveLauncher().catch(reportPersistenceError);
  }, 180);
}

export async function saveLauncher() {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  const revision = ++nextSaveRevision;
  pendingSave = {
    revision,
    snapshot: plainClone(launcher),
  };

  while (persistedSaveRevision < revision) {
    await ensureSaveDrain();
  }
}

export async function flushLauncher() {
  await saveLauncher();
  while (activeSave || pendingSave) {
    await ensureSaveDrain();
  }
}

export function setPersistenceErrorHandler(
  handler: ((error: unknown) => void) | undefined,
) {
  persistenceErrorHandler = handler;
}

async function ensureSaveDrain() {
  if (!activeSave) {
    activeSave = drainSaves().finally(() => {
      activeSave = undefined;
    });
  }
  return activeSave;
}

async function drainSaves() {
  while (pendingSave) {
    const request = pendingSave;
    pendingSave = undefined;
    try {
      await invoke("save_state", { state: request.snapshot });
      persistedSaveRevision = Math.max(persistedSaveRevision, request.revision);
    } catch (error) {
      const newerRequest = currentPendingSave();
      if (!newerRequest || newerRequest.revision < request.revision) {
        pendingSave = request;
      }
      throw error;
    }
  }
}

function currentPendingSave() {
  return pendingSave;
}

function reportPersistenceError(error: unknown) {
  console.error("保存启动器数据失败", error);
  persistenceErrorHandler?.(error);
}

export async function hydrateIcons(concurrency = 4) {
  const items = launcher.groups.flatMap((group) => group.items);
  const pending = items.filter((item) => !item.icon && item.kind !== "url");
  let cursor = 0;
  let hydrated = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      const icon = await fetchIcon(item.target);
      if (icon) {
        item.icon = icon;
        hydrated += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  );
  if (hydrated) scheduleSave();
  return hydrated;
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

export function moveItems(
  selections: Array<{ groupId: string; itemId: string }>,
  destinationGroupId: string,
) {
  const destination = launcher.groups.find(
    (group) => group.id === destinationGroupId,
  );
  if (!destination) return 0;

  const selectionKeys = new Set(
    selections.map(({ groupId, itemId }) => `${groupId}\u0000${itemId}`),
  );
  const moving: LauncherItem[] = [];
  launcher.groups.forEach((group) => {
    group.items.forEach((item) => {
      if (selectionKeys.has(`${group.id}\u0000${item.id}`)) {
        moving.push(plainClone(item));
      }
    });
  });
  if (!moving.length) return 0;

  launcher.groups.forEach((group) => {
    const remaining = group.items.filter(
      (item) => !selectionKeys.has(`${group.id}\u0000${item.id}`),
    );
    group.items.splice(0, group.items.length, ...remaining);
  });
  destination.items.push(...moving);
  scheduleSave();
  return moving.length;
}

export function setItemsFavorite(
  selections: Array<{ groupId: string; itemId: string }>,
  favorite: boolean,
) {
  const selectionKeys = new Set(
    selections.map(({ groupId, itemId }) => `${groupId}\u0000${itemId}`),
  );
  let changed = 0;
  launcher.groups.forEach((group) => {
    group.items.forEach((item) => {
      if (
        selectionKeys.has(`${group.id}\u0000${item.id}`)
        && item.favorite !== favorite
      ) {
        item.favorite = favorite;
        changed += 1;
      }
    });
  });
  if (changed) scheduleSave();
  return changed;
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
