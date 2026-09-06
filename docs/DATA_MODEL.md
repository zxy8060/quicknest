# 数据模型与兼容性

## 存储位置

```text
%APPDATA%\com.quicknest.launcher\launcher.json
```

Rust 通过 Tauri 的 `app_data_dir()` 解析目录。该文件包含个人应用路径、备注和图标，不应提交或公开分享。

持久化使用同目录临时文件和原子替换。上一份可解析的数据保存在：

```text
%APPDATA%\com.quicknest.launcher\launcher.json.bak
```

主文件无法解析时会自动加载备份，并用迁移后的有效状态重建主文件。

## 顶层结构

当前 schema 版本是 `8`：

```json
{
  "version": 8,
  "groups": [],
  "registryUsage": {},
  "settings": {}
}
```

### `LauncherState`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `number` | 数据结构版本，不等同于应用版本 |
| `groups` | `LauncherGroup[]` | 用户自定义分组 |
| `settings` | `LauncherSettings` | 用户偏好和最后位置 |
| `registryUsage` | `Record<string, LaunchUsage>` | 已安装应用的启动次数与最后使用时间 |

`registryUsage` 只保存用户成功启动过的已安装应用统计，不保存注册表扫描
列表或瞬态 ID。键为 `[target, args, workingDir]` 的 JSON 字符串；路径统一
为小写反斜杠形式，参数保留大小写。值为 `{ launchCount, lastLaunched }`。
旧版数据缺少此字段时补为空对象，无效统计被过滤；应用卸载后统计保留，
但扫描不到的应用不会展示。重新扫描到相同启动目标时可恢复使用记录。

常用列表启动时以当前统计计算顺序，并将顺序保存在内存。后续成功启动会
实时进入保存队列，首次使用的项目追加到末尾；重新唤起窗口或刷新注册表
不会重排。删除自定义快捷项仍立即移除对应显示，重启进程后才重新计算排名。

## 分组

```json
{
  "id": "group-id",
  "name": "工作",
  "color": "#67d6b3",
  "parentId": null,
  "items": []
}
```

- 根分组的 `parentId` 是 `null` 或缺省。
- 二级分组的 `parentId` 指向根分组 ID。
- 当前 UI 不支持三级及更深嵌套。
- 根分组自身可以包含项目；“全部 ××”会汇总根分组和直属二级分组。

## 快捷项

```json
{
  "id": "item-id",
  "title": "示例应用",
  "target": "C:\\Program Files\\Example\\example.exe",
  "kind": "app",
  "args": "",
  "workingDir": "",
  "notes": "",
  "favorite": false,
  "launchCount": 0,
  "lastLaunched": 1710000000000,
  "icon": "data:image/png;base64,..."
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | `app \| file \| folder \| url` | 显示和打开方式提示 |
| `target` | `string` | 本地路径、UNC 路径或协议 URL |
| `args` | `string` | 可执行文件启动参数 |
| `workingDir` | `string` | 可选工作目录 |
| `notes` | `string` | 可搜索备注 |
| `favorite` | `boolean` | 是否出现在收藏页 |
| `launchCount` | `number` | 启动次数 |
| `lastLaunched` | `number?` | 最后启动时间，Unix 毫秒 |
| `icon` | `string?` | PNG data URI，可能显著增大 JSON |

## 设置

```json
{
  "hotkey": "Shift+Q",
  "startOnBoot": false,
  "hideOnLaunch": false,
  "hideOnBlur": false,
  "iconSize": 32,
  "opacity": 96,
  "theme": "midnight",
  "lastViewId": "recent",
  "lastRootId": "group-id",
  "lastViewByRoot": {
    "group-id": "child-group-id"
  }
}
```

`hideOnLaunch` 仅为兼容旧版配置而保留；当前版本启动快捷项后始终保持
QuickNest 界面可见。

`lastViewId` 可以是：

- `all`
- `recent`
- `favorites`
- `registry`
- 任意仍存在的分组 ID

`lastViewId` 继续记录最后浏览页以兼容旧数据；启动和每次重新唤起时，
界面固定进入“最近常用”。如果保存的一级分组不存在，则选中第一个一级
分组作为后续分组导航的回退。

`lastViewByRoot` 保存每个一级分组最后停留的页面。值只能是该一级分组
自身的汇总页 ID，或它的直属二级分组 ID。迁移会丢弃已删除、跨一级或
层级不合法的映射；旧数据会使用 `lastRootId` 与 `lastViewId` 补出当前
一级分组的首条记录。

## 非持久化数据

以下内容仅存在于运行时：

- 注册表应用列表；
- `registry-*` ID；
- 目标失效集合；
- 当前搜索文本；
- Toast、右键菜单和弹窗状态；
- 快捷键触发诊断次数。

## 迁移规则

`src/migrations.ts` 是加载边界。它会：

- 拒绝高于当前应用支持版本的数据，避免旧版应用覆盖新版数据；
- 为旧数据补齐字段和默认设置；
- 修正重复 ID、孤儿分组和超过两级的父子关系；
- 约束主题、图标尺寸、透明度、全局最后浏览位置和各一级分组最后位置；
- 保留可识别的用户快捷项，不因缺少新字段而丢弃记录。

修改 schema 时：

1. 在 `src/types.ts` 更新接口和 `DEFAULT_STATE`。
2. 增加 `LauncherState.version`。
3. 在 `migrateLauncherState()` 中增加明确迁移和兼容规则。
4. 不要假设旧 `settings` 包含新增属性。
5. 用不含真实路径和隐私数据的 fixture 验证迁移，并运行 `pnpm test`。
6. 更新本文档和 `CHANGELOG.md`。

应用版本与 schema 版本独立；发布新应用版本不一定需要升级 schema。

## 删除语义

所有“删除”“移除”和“清理失效”操作只修改 `groups[].items`。它们绝不能删除 `target` 指向的文件、目录或注册表项。
