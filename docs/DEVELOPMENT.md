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

### 隔离测试数据

桌面回归测试不得使用真实 `launcher.json`。启动测试实例前设置专用目录：

```powershell
$env:QUICKNEST_DATA_DIR = "C:\path\to\isolated-quicknest-data"
pnpm tauri dev
```

该环境变量只改变 QuickNest 配置目录，不改变注册表扫描范围。测试结束后清除变量。

## 常用检查

前端类型检查与生产构建：

```powershell
pnpm build
pnpm test
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

## 持续集成

`.github/workflows/ci.yml` 在 `windows-latest` 上执行：

1. 使用 `packageManager` 字段安装锁定的 pnpm 版本；
2. `pnpm install --frozen-lockfile`；
3. `pnpm build`；
4. `pnpm test`；
5. `cargo fmt --check`；
6. Clippy（warnings as errors）；
7. `cargo test --locked`。

CI 权限只有 `contents: read`，不发布包、不使用仓库密钥。

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
6. `THIRD_PARTY_NOTICES.md`（依赖版本发生变化时）

然后依次执行：

```powershell
pnpm build
cargo check --manifest-path .\src-tauri\Cargo.toml
pnpm tauri build
```

检查安装包名称与内嵌版本一致。

## 手工回归清单

- 启动后分组与快捷项正常加载。
- 单击快捷项只选中，双击或键盘回车才启动。
- 启动快捷项后主界面保持可见，即使已开启失焦隐藏。
- 主窗口不出现在 Windows 任务栏，托盘图标与菜单仍可唤起窗口。
- 顶部一级标签优先恢复各自最后停留的汇总页或二级标签，失效时进入首个二级标签。
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
- 重启后默认进入“最近常用”，各一级分组仍恢复各自最后停留的二级页面。
- 再次启动程序只会唤起现有实例。
- 快捷键唤起后搜索框获得焦点，方向键与回车可以选择并启动项目。
- 启动和每次重新唤起时默认进入“最近常用”。
- “最近常用”按启动次数乘以 30 天半衰期的时间衰减分数排列。
- 批量操作只作用于当前页面/搜索结果中的自定义快捷项。
- 模拟损坏主 JSON 时能从 `launcher.json.bak` 恢复。

## 数据安全

开发和手工测试默认会访问当前用户的真实应用数据目录。桌面回归应设置 `QUICKNEST_DATA_DIR`；需要更完整的系统隔离时使用独立 Windows 用户。不要拿真实 `launcher.json` 做删除测试。
