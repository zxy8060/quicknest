<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import {
  AppWindow,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Globe2,
  GripHorizontal,
  GripVertical,
  Heart,
  Minus,
  MoreHorizontal,
  PackageOpen,
  PanelTopClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sparkles,
  RefreshCw,
  Trash2,
  X,
} from "lucide-vue-next";
import ItemEditor from "./components/ItemEditor.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import {
  addNestedGroup,
  addPaths,
  hydrateIcons,
  launcher,
  loadLauncher,
  removeGroup,
  removeItem,
  removeItems,
  saveLauncher,
  scheduleSave,
  updateItem,
} from "./launcher";
import type { LauncherGroup, LauncherItem, LauncherSettings } from "./types";
import "./styles.css";

type ViewId = "all" | "favorites" | string;
type HotkeyDiagnostics = {
  triggerCount: number;
  windowVisible: boolean;
};
type CleanupCandidate = {
  item: LauncherItem;
  groupId: string;
  groupName: string;
  checked: boolean;
};

const currentView = ref<ViewId>("all");
const query = ref("");
const loading = ref(true);
const dragging = ref(false);
const pinned = ref(false);
const selectedRootId = ref("");
const registryItems = ref<LauncherItem[]>([]);
const registryLoading = ref(false);
const hotkeyTriggerCount = ref(0);
const missingTargets = ref<Set<string>>(new Set());
const targetCheckInProgress = ref(false);
const itemEditor = ref<{ item?: LauncherItem; groupId: string }>();
const settingsOpen = ref(false);
const cleanupStage = ref<"select" | "confirm" | null>(null);
const cleanupCandidates = ref<CleanupCandidate[]>([]);
const contextMenu = ref<{
  x: number;
  y: number;
  item: LauncherItem;
  groupId: string;
}>();
const toast = ref("");
let toastTimer: number | undefined;
let unlistenDrop: (() => void) | undefined;
let unlistenFocus: (() => void) | undefined;
let activeHotkey = "";
let targetCheckTimer: number | undefined;
let lastTargetCheck = 0;
let navigationReady = false;

const activeGroup = computed(() =>
  launcher.groups.find((group) => group.id === currentView.value),
);

const rootGroups = computed(() =>
  launcher.groups.filter((group) => !group.parentId),
);

const activeRoot = computed(() =>
  rootGroups.value.find((group) => group.id === selectedRootId.value)
  ?? rootGroups.value[0],
);

const registryGroup = computed<LauncherGroup>(() => ({
  id: "__registry__",
  name: "已安装应用",
  color: "#55b8e6",
  parentId: null,
  items: registryItems.value,
}));

function childGroups(parentId: string) {
  return launcher.groups.filter((group) => group.parentId === parentId);
}

function groupsInView(group: LauncherGroup) {
  if (group.parentId) return [group];
  return [group, ...childGroups(group.id)];
}

function groupItemCount(group: LauncherGroup) {
  return groupsInView(group).reduce((count, entry) => count + entry.items.length, 0);
}

function groupPath(group: LauncherGroup) {
  if (!group.parentId) return group.name;
  const parent = launcher.groups.find((entry) => entry.id === group.parentId);
  return parent ? `${parent.name} / ${group.name}` : group.name;
}

const visibleEntries = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  const source =
    currentView.value === "all"
      ? launcher.groups.flatMap((group) =>
          group.items.map((item) => ({ item, group })),
        )
      : currentView.value === "registry"
        ? registryItems.value.map((item) => ({
            item,
            group: registryGroup.value,
          }))
      : currentView.value === "favorites"
        ? launcher.groups.flatMap((group) =>
            group.items
              .filter((item) => item.favorite)
              .map((item) => ({ item, group })),
          )
        : activeGroup.value
          ? groupsInView(activeGroup.value).flatMap((group) =>
              group.items.map((item) => ({ item, group })),
            )
          : [];

  if (!normalized) return source;
  return source.filter(({ item }) =>
    [item.title, item.target, item.notes]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
});

const visibleMissingCount = computed(() =>
  visibleEntries.value.filter(({ item }) => isMissingTarget(item)).length,
);

const selectedCleanupCandidates = computed(() =>
  cleanupCandidates.value.filter((candidate) => candidate.checked),
);

const viewTitle = computed(() => {
  if (currentView.value === "all") return "全部项目";
  if (currentView.value === "registry") return "已安装应用";
  if (currentView.value === "favorites") return "我的收藏";
  return activeGroup.value ? groupPath(activeGroup.value) : "启动项";
});

const currentGroupId = computed(() => {
  if (activeGroup.value) return activeGroup.value.id;
  if (activeRoot.value) {
    return childGroups(activeRoot.value.id)[0]?.id ?? activeRoot.value.id;
  }
  return launcher.groups[0]?.id ?? "";
});

watch([currentView, selectedRootId], ([viewId, rootId]) => {
  if (!navigationReady) return;
  launcher.settings.lastViewId = viewId;
  launcher.settings.lastRootId = rootId;
  scheduleSave();
});

onMounted(async () => {
  try {
    await loadLauncher();
    restoreNavigation();
    await loadRegistryApps();
    void refreshTargetHealth();
    targetCheckTimer = window.setInterval(() => {
      void refreshTargetHealth();
    }, 60_000);
    await hydrateIcons();
    scheduleSave();
    try {
      await bindHotkey();
      await refreshHotkeyDiagnostics();
    } catch (error) {
      notify(`快捷键 ${launcher.settings.hotkey} 注册失败`);
      console.warn(error);
    }

    unlistenDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
      dragging.value =
        event.payload.type === "over" || event.payload.type === "enter";
      if (event.payload.type === "drop") {
        await addPaths(currentGroupId.value, event.payload.paths);
        void refreshTargetHealth();
        notify(`已添加 ${event.payload.paths.length} 个项目`);
      }
      if (event.payload.type === "leave") dragging.value = false;
    });

    unlistenFocus = await getCurrentWindow().onFocusChanged(
      async ({ payload }) => {
        if (payload) {
          await refreshHotkeyDiagnostics();
          if (Date.now() - lastTargetCheck > 30_000) void refreshTargetHealth();
        }
        if (!payload && launcher.settings.hideOnBlur && !pinned.value) {
          await invoke("hide_window");
        }
      },
    );
  } catch (error) {
    notify(`初始化失败：${String(error)}`);
  } finally {
    loading.value = false;
  }
  window.addEventListener("keydown", handleKey);
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("wheel", handleWheel, { passive: false });
});

onBeforeUnmount(() => {
  unlistenDrop?.();
  unlistenFocus?.();
  window.removeEventListener("keydown", handleKey);
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("wheel", handleWheel);
  window.clearInterval(targetCheckTimer);
});

function restoreNavigation() {
  const savedViewId = launcher.settings.lastViewId;
  const savedGroup = launcher.groups.find((group) => group.id === savedViewId);
  const savedRoot = rootGroups.value.find(
    (group) => group.id === launcher.settings.lastRootId,
  );
  selectedRootId.value =
    (savedGroup?.parentId
      ? savedGroup.parentId
      : savedGroup && !savedGroup.parentId
        ? savedGroup.id
        : savedRoot?.id)
    ?? rootGroups.value[0]?.id
    ?? "";
  const validSpecialView = ["all", "favorites", "registry"].includes(
    savedViewId ?? "",
  );
  currentView.value = validSpecialView || savedGroup ? savedViewId as ViewId : "all";
  navigationReady = true;
}

async function refreshTargetHealth() {
  if (targetCheckInProgress.value) return;
  targetCheckInProgress.value = true;
  try {
    const targets = Array.from(new Set([
      ...launcher.groups.flatMap((group) => group.items.map((item) => item.target)),
      ...registryItems.value.map((item) => item.target),
    ].filter(Boolean)));
    const status = await invoke<Record<string, boolean>>("check_targets", { targets });
    missingTargets.value = new Set(
      Object.entries(status)
        .filter(([, exists]) => !exists)
        .map(([target]) => target),
    );
    lastTargetCheck = Date.now();
  } catch (error) {
    console.warn("目标检测失败", error);
  } finally {
    targetCheckInProgress.value = false;
  }
}

function isMissingTarget(item: LauncherItem) {
  return missingTargets.value.has(item.target);
}

function itemTitle(item: LauncherItem) {
  return isMissingTarget(item)
    ? `目标不存在：${item.target}`
    : item.notes || item.target;
}

async function bindHotkey(hotkey = launcher.settings.hotkey) {
  const fallbackHotkey = activeHotkey;
  try {
    await unregisterAll();
    await register(hotkey, () => {
      // Window toggling runs in Rust so it also works while the webview is hidden.
    });
    activeHotkey = hotkey;
  } catch (error) {
    if (fallbackHotkey && fallbackHotkey !== hotkey) {
      try {
        await register(fallbackHotkey, () => {});
        activeHotkey = fallbackHotkey;
      } catch (restoreError) {
        activeHotkey = "";
        console.warn("恢复原快捷键失败", restoreError);
      }
    }
    throw error;
  }
}

async function refreshHotkeyDiagnostics() {
  try {
    const diagnostics = await invoke<HotkeyDiagnostics>("hotkey_diagnostics");
    hotkeyTriggerCount.value = diagnostics.triggerCount;
  } catch {
    // Diagnostics are informational and must not block the launcher.
  }
}

async function pickFiles() {
  const selected = await open({
    multiple: true,
    directory: false,
    title: "选择要添加的程序或文件",
  });
  if (!selected) return;
  await addPaths(currentGroupId.value, Array.isArray(selected) ? selected : [selected]);
  void refreshTargetHealth();
}

async function pickFolder() {
  const selected = await open({
    multiple: true,
    directory: true,
    title: "选择要添加的文件夹",
  });
  if (!selected) return;
  await addPaths(currentGroupId.value, Array.isArray(selected) ? selected : [selected]);
  void refreshTargetHealth();
}

async function launchItem(item: LauncherItem) {
  try {
    await invoke("launch_target", {
      target: item.target,
      args: item.args,
      workingDir: item.workingDir,
    });
    if (!isRegistryItem(item)) {
      item.launchCount += 1;
      item.lastLaunched = Date.now();
      scheduleSave();
    }
    if (launcher.settings.hideOnLaunch && !pinned.value) {
      await invoke("hide_window");
    }
  } catch (error) {
    notify(`无法打开：${String(error)}`);
  }
}

async function loadRegistryApps(showMessage = false) {
  registryLoading.value = true;
  try {
    registryItems.value = await invoke<LauncherItem[]>("registry_apps");
    if (showMessage) void refreshTargetHealth();
    if (showMessage) notify(`已刷新 ${registryItems.value.length} 个注册表应用`);
  } catch (error) {
    notify(`读取注册表应用失败：${String(error)}`);
  } finally {
    registryLoading.value = false;
  }
}

function isRegistryItem(item: LauncherItem) {
  return item.id.startsWith("registry-");
}

function addNewGroup(parent?: LauncherGroup) {
  const name = window.prompt(
    parent ? `在“${parent.name}”下新建子分组` : "新分组名称",
    parent ? "新标签" : "新分组",
  );
  if (!name) return;
  const colors = ["#7c9cff", "#67d6b3", "#f2aa6b", "#e58bb4", "#a88ef0"];
  const color = parent?.color ?? colors[rootGroups.value.length % colors.length];
  const group = addNestedGroup(name, color, parent?.id ?? null);
  if (parent) {
    selectedRootId.value = parent.id;
  } else {
    selectedRootId.value = group.id;
  }
  currentView.value = group.id;
}

function selectRoot(group: LauncherGroup) {
  selectedRootId.value = group.id;
  currentView.value = childGroups(group.id)[0]?.id ?? group.id;
}

function selectRootSummary(group: LauncherGroup) {
  selectedRootId.value = group.id;
  currentView.value = group.id;
}

function selectChild(group: LauncherGroup) {
  selectedRootId.value = group.parentId ?? selectedRootId.value;
  currentView.value = group.id;
}

function renameGroup(group: LauncherGroup) {
  const name = window.prompt("修改分组名称", group.name);
  if (!name?.trim()) return;
  group.name = name.trim();
  scheduleSave();
}

function deleteGroup(group: LauncherGroup) {
  const total = groupItemCount(group);
  const childText = !group.parentId && childGroups(group.id).length
    ? `及其 ${childGroups(group.id).length} 个子分组`
    : "";
  const itemText = total ? `，其中 ${total} 个启动项也会删除` : "";
  if (!window.confirm(`删除“${group.name}”${childText}${itemText}？`)) return;
  if (!removeGroup(group.id)) {
    notify("至少要保留一个分组");
    return;
  }
  if (group.id === selectedRootId.value) {
    selectedRootId.value = rootGroups.value[0]?.id ?? "";
  }
  currentView.value = "all";
}

function saveItem(item: LauncherItem, destinationGroupId: string) {
  updateItem(itemEditor.value?.groupId ?? destinationGroupId, item, destinationGroupId);
  itemEditor.value = undefined;
  void refreshTargetHealth();
}

function showItemMenu(event: MouseEvent, item: LauncherItem, groupId: string) {
  event.preventDefault();
  contextMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - 210),
    y: Math.min(event.clientY, window.innerHeight - 230),
    item,
    groupId,
  };
}

function closeContextMenu() {
  contextMenu.value = undefined;
}

function toggleFavorite(item: LauncherItem) {
  item.favorite = !item.favorite;
  scheduleSave();
  closeContextMenu();
}

function deleteItem(groupId: string, item: LauncherItem) {
  if (!window.confirm(`删除“${item.title}”？只移除快捷项，不会删除原文件。`)) return;
  removeItem(groupId, item.id);
  closeContextMenu();
}

function openMissingCleanup() {
  if (targetCheckInProgress.value) {
    notify("目标仍在检测中，请稍后再试");
    return;
  }
  if (currentView.value === "registry") {
    notify("注册表应用不属于 QuickNest 快捷项，不能在这里移除");
    return;
  }
  cleanupCandidates.value = visibleEntries.value
    .filter(({ item }) => !isRegistryItem(item) && isMissingTarget(item))
    .map(({ item, group }) => ({
      item,
      groupId: group.id,
      groupName: groupPath(group),
      checked: true,
    }));
  if (!cleanupCandidates.value.length) {
    notify("当前页面没有失效快捷项");
    return;
  }
  cleanupStage.value = "select";
}

function closeMissingCleanup() {
  cleanupStage.value = null;
  cleanupCandidates.value = [];
}

function toggleAllCleanupCandidates() {
  const checked = !cleanupCandidates.value.every((candidate) => candidate.checked);
  cleanupCandidates.value.forEach((candidate) => {
    candidate.checked = checked;
  });
}

function reviewMissingCleanup() {
  if (!selectedCleanupCandidates.value.length) {
    notify("请至少勾选一个快捷项");
    return;
  }
  cleanupStage.value = "confirm";
}

function confirmMissingCleanup() {
  const selected = selectedCleanupCandidates.value;
  const removed = removeItems(
    selected.map(({ groupId, item }) => ({ groupId, itemId: item.id })),
  );
  closeMissingCleanup();
  if (!removed) {
    notify("没有移除任何快捷项");
    return;
  }
  void refreshTargetHealth();
  notify(`已移除 ${removed} 个失效快捷项，原文件未被删除`);
}

async function applySettings(value: LauncherSettings) {
  try {
    await bindHotkey(value.hotkey);
  } catch (error) {
    notify(`快捷键 ${value.hotkey} 注册失败，请换一个组合`);
    console.warn(error);
    return;
  }
  Object.assign(launcher.settings, value);
  await saveLauncher();
  settingsOpen.value = false;
  notify(`设置已保存，快捷键：${value.hotkey}`);
}

function itemIcon(item: LauncherItem) {
  if (item.icon) return undefined;
  if (item.kind === "folder") return Folder;
  if (item.kind === "url") return Globe2;
  if (item.kind === "file") return File;
  return AppWindow;
}

function handleKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (itemEditor.value) itemEditor.value = undefined;
    else if (cleanupStage.value) closeMissingCleanup();
    else if (settingsOpen.value) settingsOpen.value = false;
    else if (query.value) query.value = "";
    else void invoke("hide_window");
  }
  if (event.ctrlKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    document.querySelector<HTMLInputElement>(".search-input")?.focus();
  }
}

function handleWheel(event: WheelEvent) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const direction = event.deltaY > 0 ? -4 : 4;
  const nextSize = Math.min(64, Math.max(20, launcher.settings.iconSize + direction));
  if (nextSize === launcher.settings.iconSize) return;
  launcher.settings.iconSize = nextSize;
  scheduleSave();
}

async function startWindowDrag(event: MouseEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest("button, input, select, textarea, a, [role='button']")) return;
  await getCurrentWindow().startDragging();
}

function notify(message: string) {
  toast.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ""), 2800);
}
</script>

<template>
  <main
    class="app-shell"
    :class="[`theme-${launcher.settings.theme}`, { loading }]"
    :style="{ '--panel-opacity': `${launcher.settings.opacity / 100}` }"
  >
    <aside class="sidebar">
      <div class="brand" data-tauri-drag-region @mousedown="startWindowDrag">
        <div class="brand-mark"><Sparkles :size="20" /></div>
        <div><strong>QuickNest</strong><small>轻启</small></div>
      </div>

      <nav class="nav-list">
        <button :class="{ active: currentView === 'all' }" @click="currentView = 'all'">
          <GripVertical :size="18" /><span>全部项目</span>
          <em>{{ launcher.groups.reduce((n, g) => n + g.items.length, 0) }}</em>
        </button>
        <button class="registry-nav" :class="{ active: currentView === 'registry' }" @click="currentView = 'registry'">
          <PackageOpen :size="17" /><span>已安装应用</span>
          <em>{{ registryLoading ? "…" : registryItems.length }}</em>
        </button>
        <button :class="{ active: currentView === 'favorites' }" @click="currentView = 'favorites'">
          <Heart :size="17" /><span>我的收藏</span>
        </button>
      </nav>

      <div class="group-label">
        <span>{{ activeRoot?.name ?? "二级分组" }}</span>
        <button v-if="activeRoot" :title="`在“${activeRoot.name}”下新建子分组`" @click="addNewGroup(activeRoot)">
          <Plus :size="15" />
        </button>
      </div>
      <nav class="nav-list groups">
        <button
          v-if="activeRoot"
          class="root-summary"
          :class="{ active: currentView === activeRoot.id }"
          @click="selectRootSummary(activeRoot)"
        >
          <GripVertical :size="16" />
          <span>全部 {{ activeRoot.name }}</span>
          <em>{{ groupItemCount(activeRoot) }}</em>
        </button>
        <button
          v-for="child in activeRoot ? childGroups(activeRoot.id) : []"
          :key="child.id"
          class="child-group"
          :class="{ active: currentView === child.id }"
          @click="selectChild(child)"
          @dblclick="renameGroup(child)"
          @contextmenu.prevent="deleteGroup(child)"
        >
          <i :style="{ background: child.color }"></i>
          <span>{{ child.name }}</span>
          <em>{{ child.items.length }}</em>
        </button>
      </nav>

      <div class="sidebar-foot">
        <button @click="settingsOpen = true"><Settings :size="17" />设置</button>
        <small>
          {{ launcher.settings.hotkey }} 唤起
          <template v-if="hotkeyTriggerCount"> · 已触发 {{ hotkeyTriggerCount }} 次</template>
        </small>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar" data-tauri-drag-region @mousedown="startWindowDrag">
        <div class="search-box">
          <Search :size="18" />
          <input v-model="query" class="search-input" placeholder="搜索名称、路径或备注" />
          <kbd>Ctrl F</kbd>
        </div>
        <div
          class="drag-handle"
          data-tauri-drag-region
          role="button"
          aria-label="按住拖动窗口"
          title="按住拖动窗口"
          @mousedown.stop="startWindowDrag"
        >
          <GripHorizontal :size="19" />
        </div>
        <div class="window-actions">
          <button title="设置" @click="settingsOpen = true"><Settings :size="17" /></button>
          <button :title="pinned ? '取消钉住' : '钉住窗口'" @click="pinned = !pinned">
            <PinOff v-if="pinned" :size="17" /><Pin v-else :size="17" />
          </button>
          <button title="最小化" @click="getCurrentWindow().minimize()"><Minus :size="18" /></button>
          <button title="隐藏到托盘" @click="invoke('hide_window')"><X :size="18" /></button>
        </div>
      </header>

      <nav class="root-tabs" data-tauri-drag-region @mousedown="startWindowDrag">
        <button
          v-for="group in rootGroups"
          :key="group.id"
          :class="{ active: selectedRootId === group.id }"
          @click="selectRoot(group)"
          @dblclick="renameGroup(group)"
          @contextmenu.prevent="deleteGroup(group)"
        >
          <i :style="{ background: group.color }"></i>
          <span>{{ group.name }}</span>
          <em>{{ groupItemCount(group) }}</em>
        </button>
        <button class="add-root" title="新建一级分组" @click="addNewGroup()">
          <Plus :size="15" />
        </button>
      </nav>

      <div class="content">
        <header class="content-header">
          <div>
            <span class="eyebrow">{{ query ? "搜索结果" : "快捷入口" }}</span>
            <h1>{{ viewTitle }}</h1>
            <p>
              {{ visibleEntries.length }} 个项目
              <span v-if="targetCheckInProgress"> · 检测目标中…</span>
              <span v-else-if="visibleMissingCount" class="missing-count"> · {{ visibleMissingCount }} 个目标不存在</span>
            </p>
          </div>
          <div class="add-actions">
            <button v-if="currentView === 'registry'" class="secondary-button" :disabled="registryLoading" @click="loadRegistryApps(true)">
              <RefreshCw :size="16" :class="{ spinning: registryLoading }" />刷新注册表
            </button>
            <template v-else>
              <button
                v-if="visibleMissingCount"
                class="secondary-button cleanup-button"
                :disabled="targetCheckInProgress"
                title="清理当前页面中目标不存在的快捷项"
                @click="openMissingCleanup"
              >
                <Trash2 :size="16" />清理失效 {{ visibleMissingCount }}
              </button>
              <button class="secondary-button" @click="pickFolder"><FolderOpen :size="16" />文件夹</button>
              <button class="primary-button" @click="pickFiles"><Plus :size="17" />添加项目</button>
              <button class="split-button" title="手动填写网址或参数" @click="itemEditor = { groupId: currentGroupId }">
                <ChevronDown :size="16" />
              </button>
            </template>
          </div>
        </header>

        <div
          v-if="visibleEntries.length"
          class="item-grid"
          :style="{ '--icon-size': `${launcher.settings.iconSize}px` }"
        >
          <div
            v-for="{ item, group } in visibleEntries"
            :key="`${group.id}-${item.id}`"
            class="launch-card"
            :class="{ 'missing-target': isMissingTarget(item) }"
            role="button"
            tabindex="0"
            :title="itemTitle(item)"
            @click="launchItem(item)"
            @keydown.enter="launchItem(item)"
            @contextmenu="showItemMenu($event, item, group.id)"
          >
            <span class="icon-wrap" :style="{ '--accent': group.color }">
              <img v-if="item.icon" :src="item.icon" alt="" />
              <component :is="itemIcon(item)" v-else :size="Math.round(launcher.settings.iconSize * 0.52)" />
              <Heart v-if="item.favorite" class="favorite-mark" :size="13" fill="currentColor" />
            </span>
            <strong>{{ item.title }}</strong>
            <small v-if="isMissingTarget(item)" class="missing-label">目标不存在</small>
            <small v-else-if="currentView === 'all' || query || !activeGroup?.parentId">{{ groupPath(group) }}</small>
            <button class="card-menu" title="更多" @click.stop="showItemMenu($event, item, group.id)">
              <MoreHorizontal :size="16" />
            </button>
          </div>
        </div>

        <div v-else class="empty-state">
          <div><PanelTopClose :size="30" /></div>
          <h2>{{ query ? "没有找到匹配项" : currentView === "registry" ? "没有找到可启动的注册表应用" : "这里还很清爽" }}</h2>
          <p>{{ query ? "试试名称、路径或备注里的其他关键词" : currentView === "registry" ? "可点击刷新重新扫描 Windows 注册表" : "拖入程序、文件或文件夹，马上就能启动" }}</p>
          <button v-if="!query && currentView !== 'registry'" class="primary-button" @click="pickFiles"><Plus :size="17" />添加第一个项目</button>
        </div>
      </div>
    </section>

    <div v-if="dragging" class="drop-overlay">
      <div><Plus :size="28" /><strong>松开即可添加</strong><span>将保存到“{{ activeGroup ? groupPath(activeGroup) : launcher.groups[0]?.name }}”</span></div>
    </div>

    <div
      v-if="contextMenu"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button @click="launchItem(contextMenu.item)"><AppWindow :size="16" />打开</button>
      <button v-if="!isRegistryItem(contextMenu.item)" @click="itemEditor = { item: contextMenu.item, groupId: contextMenu.groupId }; closeContextMenu()">
        <Pencil :size="16" />编辑
      </button>
      <button v-if="!isRegistryItem(contextMenu.item)" @click="toggleFavorite(contextMenu.item)">
        <Heart :size="16" />{{ contextMenu.item.favorite ? "取消收藏" : "加入收藏" }}
      </button>
      <button v-if="contextMenu.item.kind !== 'url'" @click="invoke('reveal_target', { target: contextMenu.item.target }); closeContextMenu()">
        <FolderOpen :size="16" />在文件夹中显示
      </button>
      <hr v-if="!isRegistryItem(contextMenu.item)" />
      <button v-if="!isRegistryItem(contextMenu.item)" class="danger" @click="deleteItem(contextMenu.groupId, contextMenu.item)">
        <Trash2 :size="16" />移除快捷项
      </button>
    </div>

    <div
      v-if="cleanupStage === 'select'"
      class="modal-backdrop"
      @mousedown.self="closeMissingCleanup"
    >
      <section class="modal cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="cleanup-select-title">
        <header class="modal-header">
          <div>
            <span class="eyebrow">第一步 · 逐项选择</span>
            <h2 id="cleanup-select-title">清理当前页面失效快捷项</h2>
            <p>默认全部勾选；取消不想移除的项目后再继续。</p>
          </div>
          <button class="icon-button" title="关闭" @click="closeMissingCleanup"><X :size="18" /></button>
        </header>
        <div class="cleanup-toolbar">
          <span>已选 {{ selectedCleanupCandidates.length }} / {{ cleanupCandidates.length }} 项</span>
          <button type="button" @click="toggleAllCleanupCandidates">
            {{ selectedCleanupCandidates.length === cleanupCandidates.length ? "取消全选" : "全选" }}
          </button>
        </div>
        <div class="cleanup-list">
          <label
            v-for="candidate in cleanupCandidates"
            :key="`${candidate.groupId}-${candidate.item.id}`"
            class="cleanup-item"
          >
            <input v-model="candidate.checked" type="checkbox" />
            <span>
              <strong>{{ candidate.item.title }}</strong>
              <small>{{ candidate.groupName }}</small>
              <small :title="candidate.item.target">{{ candidate.item.target }}</small>
            </span>
          </label>
        </div>
        <footer class="modal-actions cleanup-actions">
          <span class="hint">只移除 QuickNest 中的快捷项，不会删除原文件。</span>
          <div>
            <button class="secondary-button" @click="closeMissingCleanup">取消</button>
            <button
              class="primary-button"
              :disabled="!selectedCleanupCandidates.length"
              @click="reviewMissingCleanup"
            >
              下一步确认
            </button>
          </div>
        </footer>
      </section>
    </div>

    <div
      v-if="cleanupStage === 'confirm'"
      class="modal-backdrop"
      @mousedown.self="cleanupStage = 'select'"
    >
      <section class="modal cleanup-modal confirm-cleanup-modal" role="alertdialog" aria-modal="true" aria-labelledby="cleanup-confirm-title">
        <header class="modal-header">
          <div>
            <span class="eyebrow danger-eyebrow">第二步 · 最终确认</span>
            <h2 id="cleanup-confirm-title">确认移除 {{ selectedCleanupCandidates.length }} 个快捷项？</h2>
            <p>操作会立即保存，但不会碰原始程序、文件或文件夹。</p>
          </div>
          <button class="icon-button" title="返回选择" @click="cleanupStage = 'select'"><X :size="18" /></button>
        </header>
        <div class="cleanup-warning">
          <Trash2 :size="22" />
          <div><strong>即将从 QuickNest 移除</strong><small>请再次核对下面的最终清单。</small></div>
        </div>
        <div class="cleanup-list compact">
          <div
            v-for="candidate in selectedCleanupCandidates"
            :key="`${candidate.groupId}-${candidate.item.id}`"
            class="cleanup-item cleanup-summary"
          >
            <span>
              <strong>{{ candidate.item.title }}</strong>
              <small>{{ candidate.groupName }} · {{ candidate.item.target }}</small>
            </span>
          </div>
        </div>
        <footer class="modal-actions cleanup-actions">
          <span class="hint">此操作只删除启动器记录。</span>
          <div>
            <button class="secondary-button" @click="cleanupStage = 'select'">返回修改</button>
            <button class="danger-button solid" @click="confirmMissingCleanup">
              <Trash2 :size="16" />确认移除 {{ selectedCleanupCandidates.length }} 项
            </button>
          </div>
        </footer>
      </section>
    </div>

    <ItemEditor
      v-if="itemEditor"
      :item="itemEditor.item"
      :groups="launcher.groups"
      :group-id="itemEditor.groupId"
      @close="itemEditor = undefined"
      @save="saveItem"
    />
    <SettingsPanel
      v-if="settingsOpen"
      :settings="launcher.settings"
      @close="settingsOpen = false"
      @save="applySettings"
    />
    <transition name="toast"><div v-if="toast" class="toast">{{ toast }}</div></transition>
  </main>
</template>
