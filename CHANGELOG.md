# Changelog

本项目遵循面向用户的语义化版本记录。

## [Unreleased]

### Security

- 为 Tauri WebView 启用显式 Content Security Policy。
- 增加只读权限的 Windows CI 和 Dependabot 更新检查。

### Documentation

- 增加第三方依赖许可证清单、支持入口、行为准则和 GitHub 社区模板。
- 明确 QuickNest 与设计参考项目不存在官方关联。

### Changed

- 使用 QuickNest 图标替换未使用的 Vite 模板图标，并移除未引用的脚手架资源。

## [0.4.1] - 2026-07-27

### Added

- 当前页面失效快捷项批量清理。
- 默认全选的逐项复选清单。
- 删除前第二层最终确认。

### Safety

- 清理流程排除注册表应用。
- 清理只移除 QuickNest 记录，不删除目标文件。

## [0.4.0] - 2026-07-27

### Added

- 后台异步目标存在性检测。
- 失效目标红色状态。
- 一级标签自动进入首个二级标签。
- 重启恢复上次浏览位置。

### Changed

- 启动项图标和文字改为居中排列。

## Earlier releases

早期版本完成了 Lucy 数据迁移适配、两级分组、注册表应用汇总、可配置图标尺寸、可拖动无边框窗口、固定设置保存栏和录制式全局快捷键。
