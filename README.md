# QuickNest 轻启

QuickNest 是一个轻量、离线、面向 Windows 的桌面快速启动器。它使用 Tauri 2、Vue 3 和 Rust 构建，支持两级分组、全局快捷键、注册表应用汇总、目标失效检测和本地 JSON 存储。

> 当前版本：`0.4.7` · 平台：Windows 10/11 · 许可证：[MIT](LICENSE)

QuickNest 是独立实现项目，与 Lucy、Lily、Maye 及其作者没有隶属、授权或官方关联；这些名称只用于说明交互设计参考。

## 特性

- 一级标签位于顶部，二级标签位于左侧；每个一级标签会记住最后停留的汇总页或二级标签
- “全部项目”汇总所有自定义快捷项，“全部 ××”汇总当前一级分组及其二级分组
- 添加应用、文件、文件夹和 URL，支持拖拽导入与 Windows 原生图标提取
- 单击选中、双击启动快捷项；键盘方向键与回车启动继续可用
- 按名称、目标路径和备注搜索全部软件，覆盖所有自定义分组和注册表应用
- 快捷键唤起后自动聚焦搜索框，支持方向键选择和回车启动；启动搜索结果后自动清空搜索
- 默认进入“最近常用”，支持自定义快捷项和已安装应用；使用记录实时保存，已有项目仅在重启时重排，新项目即时追加
- 在鼠标所在屏幕唤出窗口，最小化收起到托盘
- 已安装应用成功打开后后台尝试提取图标；重启后也会为已有使用记录的应用补齐图标
- 读取 Windows 注册表中的可启动应用，不将注册表项目写入用户数据
- 后台异步检查目标是否存在，失效项目自动标红
- 批量清理当前页面或当前搜索结果内的失效快捷项
  - 第一层弹窗逐项复选，默认全部勾选
  - 第二层弹窗再次展示最终清单
  - 只移除 QuickNest 记录，不删除原程序或文件
- 收藏、编辑、移动和删除自定义快捷项
- 当前页面快捷项可批量移动、收藏、取消收藏或移除
- 录制式全局快捷键；支持 `Shift+Q` 等带修饰键的组合
- 记住每个一级分组最后停留的汇总页或二级分组
- 主窗口不占用 Windows 任务栏，托盘入口、失焦隐藏、窗口钉住和开机启动正常可用
- 深色/浅色主题、透明度及 `20–64px` 图标尺寸调节

## 安装与使用

### 使用预构建版本

项目构建会生成：

- 便携版：`src-tauri/target/release/quicknest.exe`
- NSIS 安装包：`src-tauri/target/release/bundle/nsis/QuickNest_<version>_x64-setup.exe`

当前仓库未配置代码签名，Windows SmartScreen 可能显示“未知发布者”。

### 基本操作

1. 启动 QuickNest。
2. 将程序、文件或文件夹拖入窗口，或点击“添加项目”。
3. 顶部切换一级分组，左侧选择二级分组。
4. 右键快捷项可编辑、收藏、定位目标或移除。
5. 打开“设置”，点击“录制”后直接按下新的全局快捷键，最后点击“应用并保存”。
6. 按住窗口顶部拖动区域可移动窗口；按 `Ctrl + 滚轮` 可调整图标尺寸。

批量清理只处理当前页面中已经检测为失效的自定义快捷项。注册表应用是只读汇总，不会出现在清理清单中。

## 本地数据与隐私

QuickNest 不需要账号，不上传启动数据。用户配置默认位于：

```text
%APPDATA%\com.quicknest.launcher\launcher.json
```

图标以 Base64 data URI 保存在同一个 JSON 中，因此数据文件可能较大。可从设置页直接打开数据目录并备份 `launcher.json`。

保存时会先同步写入临时文件，再原子替换主文件；上一份有效数据保存在 `launcher.json.bak`。如果主文件损坏或在替换前意外中断，应用会自动尝试从备份恢复。

请勿把真实 `launcher.json`、本机构建产物或迁移备份提交到仓库。详细字段说明见 [数据模型](docs/DATA_MODEL.md)。

## 本地开发

### 环境要求

- Windows 10/11
- Node.js 20 或更高版本
- pnpm
- Rust stable 与 Cargo
- Visual Studio C++ Build Tools
- Microsoft Edge WebView2 Runtime

### 启动开发环境

```powershell
pnpm install
pnpm tauri dev
```

只启动 Web 前端：

```powershell
pnpm dev
```

### 检查与构建

```powershell
pnpm build
cargo check --manifest-path .\src-tauri\Cargo.toml
pnpm tauri build
```

`pnpm build` 同时运行 Vue/TypeScript 类型检查和 Vite 生产构建。

## 项目结构

```text
.
├─ src/
│  ├─ App.vue                    # 主界面、导航和交互编排
│  ├─ launcher.ts                # 响应式状态及快捷项 CRUD
│  ├─ migrations.ts              # 数据校验与版本化迁移
│  ├─ types.ts                   # 持久化数据类型和默认状态
│  ├─ styles.css                 # 全局界面样式
│  └─ components/
│     ├─ ItemEditor.vue          # 快捷项编辑器
│     └─ SettingsPanel.vue       # 设置与快捷键录制
├─ src-tauri/
│  ├─ src/lib.rs                 # Tauri 命令、托盘、热键及 Windows 集成
│  ├─ capabilities/default.json  # WebView 权限白名单
│  └─ tauri.conf.json            # 窗口和打包配置
├─ docs/                         # 架构、数据模型及开发说明
├─ AGENTS.md                     # AI/自动化代理的仓库操作约束
└─ CONTRIBUTING.md               # 贡献流程
```

## 文档

- [架构说明](docs/ARCHITECTURE.md)
- [数据模型与兼容性](docs/DATA_MODEL.md)
- [开发、验证与发布](docs/DEVELOPMENT.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [贡献指南](CONTRIBUTING.md)
- [安全说明](SECURITY.md)
- [第三方许可证说明](THIRD_PARTY_NOTICES.md)
- [获取帮助](SUPPORT.md)
- [社区行为准则](CODE_OF_CONDUCT.md)
- [版本记录](CHANGELOG.md)
- [AI 代理指南](AGENTS.md)

## 当前边界

- 桌面能力主要针对 Windows 实现。
- 分组结构固定为一级与二级，不支持任意深度嵌套。
- 注册表应用是运行时扫描结果，不能直接编辑、收藏或批量移除。
- 贴边自动隐藏、快捷项拖拽排序和在线同步尚未实现。
- 图标仍以 Base64 保存在 JSON 中；大量图标会增加配置文件体积。

## 仓库安全与自动化

- Windows CI 会在 push 和 Pull Request 上执行前端构建与 Rust 检查。
- Dependabot 每周检查 npm、Cargo 和 GitHub Actions 更新。
- Tauri WebView 使用显式 CSP，只允许本地资源、IPC、内置 asset 协议和本地 Base64 图标。
- Issue 和 Pull Request 模板会提醒贡献者移除用户数据与个人路径。

## 设计来源与许可

交互思路参考 Lucy、Lily、Maye 等图标式启动器，但代码从零实现。项目未复制无明确许可证的第三方启动器代码。

QuickNest 采用 [MIT License](LICENSE)。
