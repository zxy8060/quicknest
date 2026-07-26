# 数据模型与兼容性

## 存储位置

```text
%APPDATA%\com.quicknest.launcher\launcher.json
```

Rust 通过 Tauri 的 `app_data_dir()` 解析目录。该文件包含个人应用路径、备注和图标，不应提交或公开分享。

## 顶层结构

当前 schema 版本是 `6`：

```json
{
  "version": 6,
  "groups": [],
  "settings": {}
}
```

### `LauncherState`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `number` | 数据结构版本，不等同于应用版本 |
| `groups` | `LauncherGroup[]` | 用户自定义分组 |
| `settings` | `LauncherSettings` | 用户偏好和最后位置 |

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
  "hideOnLaunch": true,
  "hideOnBlur": false,
  "iconSize": 32,
  "opacity": 96,
  "theme": "midnight",
  "lastViewId": "all",
  "lastRootId": "group-id"
}
```

`lastViewId` 可以是：

- `all`
- `favorites`
- `registry`
- 任意仍存在的分组 ID

如果保存位置已经不存在，应用会回退到“全部项目”和第一个根分组。

## 非持久化数据

以下内容仅存在于运行时：

- 注册表应用列表；
- `registry-*` ID；
- 目标失效集合；
- 当前搜索文本；
- Toast、右键菜单和弹窗状态；
- 快捷键触发诊断次数。

## 迁移规则

修改 schema 时：

1. 在 `src/types.ts` 更新接口和 `DEFAULT_STATE`。
2. 增加 `LauncherState.version`。
3. 在 `loadLauncher()` 中兼容缺失字段或旧值。
4. 不要假设旧 `settings` 包含新增属性。
5. 用不含真实路径和隐私数据的 fixture 验证迁移。
6. 更新本文档和 `CHANGELOG.md`。

应用版本与 schema 版本独立；发布新应用版本不一定需要升级 schema。

## 删除语义

所有“删除”“移除”和“清理失效”操作只修改 `groups[].items`。它们绝不能删除 `target` 指向的文件、目录或注册表项。
