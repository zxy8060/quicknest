export type ItemKind = "app" | "file" | "folder" | "url";
export type Theme = "midnight" | "mist";

export interface LauncherItem {
  id: string;
  title: string;
  target: string;
  kind: ItemKind;
  icon?: string;
  args: string;
  workingDir: string;
  notes: string;
  favorite: boolean;
  launchCount: number;
  lastLaunched?: number;
}

export interface LauncherGroup {
  id: string;
  name: string;
  color: string;
  parentId?: string | null;
  items: LauncherItem[];
}

export interface LauncherSettings {
  hotkey: string;
  startOnBoot: boolean;
  hideOnLaunch: boolean;
  hideOnBlur: boolean;
  iconSize: number;
  opacity: number;
  theme: Theme;
  lastViewId?: string;
  lastRootId?: string;
}

export interface LauncherState {
  version: number;
  groups: LauncherGroup[];
  settings: LauncherSettings;
}

export const CURRENT_SCHEMA_VERSION = 6;

export const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const plainClone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export const DEFAULT_STATE: LauncherState = {
  version: CURRENT_SCHEMA_VERSION,
  groups: [
    {
      id: "daily",
      name: "日常",
      color: "#7c9cff",
      parentId: null,
      items: [
        {
          id: "starter-explorer",
          title: "文件资源管理器",
          target: "C:\\Windows\\explorer.exe",
          kind: "app",
          args: "",
          workingDir: "",
          notes: "浏览文件与文件夹",
          favorite: true,
          launchCount: 0,
        },
        {
          id: "starter-notepad",
          title: "记事本",
          target: "C:\\Windows\\System32\\notepad.exe",
          kind: "app",
          args: "",
          workingDir: "",
          notes: "快速记录文本",
          favorite: false,
          launchCount: 0,
        },
        {
          id: "starter-calc",
          title: "计算器",
          target: "C:\\Windows\\System32\\calc.exe",
          kind: "app",
          args: "",
          workingDir: "",
          notes: "",
          favorite: false,
          launchCount: 0,
        },
      ],
    },
    {
      id: "work",
      name: "工作",
      color: "#67d6b3",
      parentId: null,
      items: [],
    },
  ],
  settings: {
    hotkey: "Ctrl+Shift+Space",
    startOnBoot: false,
    hideOnLaunch: true,
    hideOnBlur: false,
    iconSize: 32,
    opacity: 96,
    theme: "midnight",
    lastViewId: "all",
    lastRootId: "daily",
  },
};
