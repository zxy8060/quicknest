# 贡献指南

感谢参与 QuickNest。项目优先考虑本地隐私、低常驻开销、可恢复的数据格式和清晰的 Windows 交互。

## 开始之前

1. 阅读 [README](README.md) 和 [架构说明](docs/ARCHITECTURE.md)。
2. AI 或自动化代理还应先阅读 [AGENTS.md](AGENTS.md)。
3. 确认工作区中没有真实 `launcher.json`、安装包或迁移备份。

## 开发流程

```powershell
pnpm install
pnpm tauri dev
```

建议一次提交只解决一个明确问题。涉及 UI 与 Rust 边界时，请在提交说明中写清楚两侧的变化。

## 代码约定

- 前端使用 Vue 3 Composition API 和 TypeScript。
- 原生 Windows 操作放在 Tauri/Rust 层。
- 持久化结构统一定义在 `src/types.ts`。
- 新字段必须考虑旧数据兼容。
- 删除快捷项只能删除启动器记录，不能删除目标文件。
- 新增 Tauri API 时同步更新 capability 权限和架构文档。

## 提交前检查

```powershell
pnpm build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

涉及托盘、快捷键、注册表、进程启动或打包时，再运行：

```powershell
pnpm tauri build
```

## 提交信息

使用简短、祈使式或结果式描述，例如：

```text
Document launcher state migrations
Fix hidden-window shortcut handling
Add current-view cleanup confirmation
```

## Pull Request

PR 描述应包含：

- 改了什么；
- 为什么要改；
- 对用户数据和兼容性的影响；
- 已执行的检查；
- UI 变化截图（如果适用）。

不要把 `node_modules`、`dist`、`src-tauri/target`、安装包或个人启动数据放入 PR。
