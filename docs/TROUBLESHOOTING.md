# 故障排查

## 全局快捷键没有反应

1. 打开设置重新录制组合键并点击“应用并保存”。
2. 确认组合键没有被其他程序占用。
3. 尝试带修饰键的组合，如 `Shift+Q` 或 `Ctrl+Shift+Space`。
4. 完全退出托盘中的旧 QuickNest 进程，避免多个版本同时注册快捷键。

快捷键注册发生在前端，窗口显隐事件由 Rust handler 执行。

## 关闭窗口后程序仍在

这是预期行为。关闭按钮会隐藏主窗口，应用继续驻留托盘。需要退出时使用托盘菜单中的“退出”。

## 启动项被标红

红色表示目标路径在最近一次后台检查中不存在：

- 检查文件或文件夹是否移动；
- 编辑快捷项并更新目标；
- 如果目标已永久删除，可使用“清理失效”逐项确认后移除。

协议 URL（例如 `https:`、`steam:`）不会按本地文件检查。

## 注册表应用不完整

QuickNest 只展示能够从 App Paths 或 Uninstall 注册项解析到现存可执行文件的条目。商店应用、特殊协议应用和缺少 `DisplayIcon` 的程序可能不会出现。

## 图标没有显示

- 确认目标文件存在；
- 重新编辑或重新添加快捷项以触发系统图标提取；
- URL 默认使用通用网页图标。

## 数据加载失败

数据文件位于：

```text
%APPDATA%\com.quicknest.launcher\launcher.json
```

先复制一份备份，再使用 JSON 工具检查语法。不要在 QuickNest 运行时同时让多个版本写入同一文件。

## 构建失败

依次确认：

```powershell
node --version
pnpm --version
rustc --version
cargo --version
```

随后重新执行：

```powershell
pnpm install
pnpm build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

Windows 链接错误通常意味着缺少 Visual Studio C++ Build Tools。运行时白屏或无法启动还应检查 WebView2 Runtime。
