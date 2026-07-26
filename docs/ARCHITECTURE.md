# 架构说明

## 总览

QuickNest 是单窗口 Tauri 桌面应用：

```text
Vue 3 UI
  │
  ├─ 响应式启动器状态、分组、搜索、弹窗
  ├─ tauri-plugin-* 前端 API
  │
  └─ invoke(command)
          │
          ▼
Rust / Tauri
  ├─ JSON 读写
  ├─ 图标提取
  ├─ 进程与文件打开
  ├─ Windows 注册表扫描
  ├─ 后台目标存在性检查
  ├─ 托盘
  └─ 全局快捷键事件与窗口显隐
```

应用不依赖服务端或数据库。

## 前端

### `src/App.vue`

主编排组件负责：

- 系统页面、一级分组和二级分组导航；
- 当前页面条目计算；
- 搜索过滤；
- 注册表应用加载；
- 后台目标状态刷新；
- 批量清理的两阶段确认；
- 窗口拖动、滚轮缩放和快捷键诊断；
- 编辑器、设置面板、右键菜单和 Toast。

`visibleEntries` 是“当前页面”的唯一语义来源。增加只作用于当前页的功能时，应基于它派生数据，避免忽略搜索结果或一级分组汇总规则。

### `src/launcher.ts`

负责持久化状态的内存模型和 CRUD：

- `loadLauncher` 加载数据并执行兼容性修正；
- `scheduleSave` 合并短时间内的多次保存请求；
- `saveLauncher` 调用 Rust 写入 JSON；
- 文件导入、分组增删、快捷项移动和批量移除；
- 图标补全。

### 组件

- `ItemEditor.vue`：编辑目标、类型、参数、工作目录、备注和分组。
- `SettingsPanel.vue`：录制快捷键、管理开机启动、主题、透明度和图标尺寸。

## Rust/Tauri

`src-tauri/src/lib.rs` 提供以下命令：

| 命令 | 作用 |
| --- | --- |
| `load_state` | 读取并解析 `launcher.json` |
| `save_state` | 格式化并写入 `launcher.json` |
| `icon_for_path` | 提取系统图标并返回 PNG data URI |
| `registry_apps` | 扫描 Windows App Paths 与 Uninstall 注册项 |
| `launch_target` | 启动可执行文件或交给系统 opener |
| `reveal_target` | 在资源管理器中定位目标 |
| `open_data_folder` | 打开用户数据目录 |
| `hide_window` | 隐藏主窗口 |
| `hotkey_diagnostics` | 返回快捷键触发次数和窗口可见状态 |
| `check_targets` | 在阻塞线程池中批量检查目标是否存在 |

### 全局快捷键

前端使用用户保存的组合键调用插件注册。Rust 插件 handler 处理实际按键事件，并直接显示或隐藏窗口。这样即使 WebView 已隐藏，快捷键仍能唤回窗口。

### 注册表应用

Windows 实现扫描：

- `HKLM` 与 `HKCU`；
- 64 位与 32 位 Registry View；
- `Software\Microsoft\Windows\CurrentVersion\App Paths`；
- `Software\Microsoft\Windows\CurrentVersion\Uninstall`。

结果按可执行文件路径去重，运行时生成 `registry-*` ID，不写入 `launcher.json`。

### 目标状态

`check_targets` 使用 `spawn_blocking`，避免文件系统检查阻塞异步运行时和界面。盘符路径与 UNC 路径执行存在性检查；协议目标如 `https:`、`steam:` 被视为可启动。

前端在启动、周期计时以及窗口重新获得焦点时刷新状态。

## 窗口与托盘

- 主窗口无系统装饰、透明、带阴影。
- 关闭请求会被拦截并改为隐藏。
- 托盘左键显示窗口，菜单提供“显示”和“退出”。
- 开机启动使用 `--hidden` 参数。

## 权限

Tauri 权限位于 `src-tauri/capabilities/default.json`。新增插件或原生能力时，只授予需要的最小权限，并同步更新本文档。

## WebView 内容安全策略

生产 CSP 位于 `src-tauri/tauri.conf.json`，仅允许：

- 当前应用自身的脚本、样式和字体；
- Tauri IPC；
- 内置 asset 协议；
- 本地 Base64/blob 图标。

开发 CSP 额外允许 Vite 的 `localhost:1420` HTTP 与 WebSocket 连接。不要为了临时调试把生产 `csp` 改回 `null`。
