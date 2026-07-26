# 开发、验证与发布

## 环境

建议使用：

- Windows 10/11 x64
- Node.js 20+
- pnpm
- Rust stable
- Visual Studio 2022 C++ Build Tools
- Microsoft Edge WebView2 Runtime

## 安装依赖

```powershell
pnpm install
```

不要提交 `node_modules`。

## 开发

完整桌面应用：

```powershell
pnpm tauri dev
```

仅前端：

```powershell
pnpm dev
```

Vite 开发地址由 Tauri 配置为 `http://localhost:1420`。

## 常用检查

前端类型检查与生产构建：

```powershell
pnpm build
```

Rust 检查：

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
```

Rust 测试：

```powershell
cargo test --manifest-path .\src-tauri\Cargo.toml
```

当前 Windows 注册表测试要求测试机至少存在一个可启动注册表应用。

## 正式构建

```powershell
pnpm tauri build
```

主要输出：

```text
src-tauri\target\release\quicknest.exe
src-tauri\target\release\bundle\nsis\QuickNest_<version>_x64-setup.exe
```

不要把这些生成文件提交到 Git。

## 版本发布

同步修改：

1. `package.json`
2. `src-tauri/Cargo.toml`
3. `src-tauri/Cargo.lock` 中 `name = "quicknest"` 的 package entry
4. `src-tauri/tauri.conf.json`
5. `CHANGELOG.md`

然后依次执行：

```powershell
pnpm build
cargo check --manifest-path .\src-tauri\Cargo.toml
pnpm tauri build
```

检查安装包名称与内嵌版本一致。

## 手工回归清单

- 启动后分组与快捷项正常加载。
- 顶部一级标签进入首个二级标签。
- 左侧“全部 ××”正确汇总。
- 全局快捷键能隐藏并再次唤起窗口。
- 设置页保存按钮始终可见。
- 图标尺寸滑块与 `Ctrl + 滚轮` 生效。
- 拖入程序、文件和文件夹能生成快捷项及图标。
- 注册表页加载且不可编辑、收藏或清理。
- 失效目标在后台检查后标红。
- 批量清理第一步默认全选，第二步展示相同最终清单。
- 取消清理不会修改数据。
- 删除快捷项不会删除目标文件。
- 重启后恢复上次所在页面。

## 数据安全

开发和手工测试默认会访问当前用户的真实应用数据目录。需要破坏性测试时，应使用隔离的 Windows 用户或隔离的 `APPDATA` 环境，不要拿真实 `launcher.json` 做删除测试。
