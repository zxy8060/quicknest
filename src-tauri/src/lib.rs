use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicUsize, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use winreg::{
    enums::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY,
        KEY_WOW64_64KEY,
    },
    RegKey,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;
static HOTKEY_TRIGGER_COUNT: AtomicUsize = AtomicUsize::new(0);

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("launcher.json"))
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("启动数据损坏：{error}"))
}

#[tauri::command]
fn save_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    let path = state_path(&app)?;
    let content = serde_json::to_string_pretty(&state).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn icon_for_path(path: String) -> Result<String, String> {
    let bytes = systemicons::get_icon(&path, 64).map_err(|error| error.message)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistryApp {
    id: String,
    title: String,
    target: String,
    kind: String,
    args: String,
    working_dir: String,
    notes: String,
    favorite: bool,
    launch_count: u32,
}

#[cfg(target_os = "windows")]
fn expand_environment(value: &str) -> String {
    let mut result = value.to_string();
    let mut cursor = 0;
    while let Some(start_offset) = result[cursor..].find('%') {
        let start = cursor + start_offset;
        let Some(end_offset) = result[start + 1..].find('%') else {
            break;
        };
        let end = start + 1 + end_offset;
        let name = &result[start + 1..end];
        if let Ok(replacement) = std::env::var(name) {
            result.replace_range(start..=end, &replacement);
            cursor = start + replacement.len();
        } else {
            cursor = end + 1;
        }
    }
    result
}

#[cfg(target_os = "windows")]
fn executable_from_registry(value: &str) -> Option<PathBuf> {
    let expanded = expand_environment(value.trim().trim_start_matches('@'));
    let candidate = if let Some(rest) = expanded.strip_prefix('"') {
        let end = rest.find('"')?;
        &rest[..end]
    } else {
        let lower = expanded.to_ascii_lowercase();
        let end = lower.find(".exe")? + 4;
        &expanded[..end]
    };
    let path = PathBuf::from(candidate.trim());
    path.is_file().then_some(path)
}

#[cfg(target_os = "windows")]
fn add_registry_app(
    apps: &mut HashMap<String, RegistryApp>,
    title: String,
    target: PathBuf,
    notes: String,
    prefer_title: bool,
) {
    let target_text = target.to_string_lossy().to_string();
    let key = target_text.to_ascii_lowercase();
    let working_dir = target
        .parent()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    let fallback_title = target
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| title.clone());
    let entry = RegistryApp {
        id: String::new(),
        title: if title.trim().is_empty() {
            fallback_title
        } else {
            title
        },
        target: target_text,
        kind: "app".to_string(),
        args: String::new(),
        working_dir,
        notes,
        favorite: false,
        launch_count: 0,
    };
    if prefer_title || !apps.contains_key(&key) {
        apps.insert(key, entry);
    }
}

#[cfg(target_os = "windows")]
fn collect_app_paths(
    hive: &RegKey,
    view: u32,
    apps: &mut HashMap<String, RegistryApp>,
) {
    let Ok(root) = hive.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\App Paths",
        KEY_READ | view,
    ) else {
        return;
    };
    for name in root.enum_keys().filter_map(Result::ok) {
        let Ok(key) = root.open_subkey_with_flags(&name, KEY_READ | view) else {
            continue;
        };
        let Ok(raw_target) = key.get_value::<String, _>("") else {
            continue;
        };
        let Some(target) = executable_from_registry(&raw_target) else {
            continue;
        };
        let title = name
            .strip_suffix(".exe")
            .or_else(|| name.strip_suffix(".EXE"))
            .unwrap_or(&name)
            .to_string();
        add_registry_app(
            apps,
            title,
            target,
            "Windows App Paths 注册项".to_string(),
            false,
        );
    }
}

#[cfg(target_os = "windows")]
fn collect_uninstall_entries(
    hive: &RegKey,
    view: u32,
    apps: &mut HashMap<String, RegistryApp>,
) {
    let Ok(root) = hive.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        KEY_READ | view,
    ) else {
        return;
    };
    for name in root.enum_keys().filter_map(Result::ok) {
        let Ok(key) = root.open_subkey_with_flags(&name, KEY_READ | view) else {
            continue;
        };
        if key.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1 {
            continue;
        }
        let Ok(title) = key.get_value::<String, _>("DisplayName") else {
            continue;
        };
        let Ok(display_icon) = key.get_value::<String, _>("DisplayIcon") else {
            continue;
        };
        let Some(target) = executable_from_registry(&display_icon) else {
            continue;
        };
        let publisher = key.get_value::<String, _>("Publisher").unwrap_or_default();
        let notes = if publisher.trim().is_empty() {
            "Windows 已安装应用注册项".to_string()
        } else {
            format!("{publisher} · Windows 已安装应用注册项")
        };
        add_registry_app(apps, title, target, notes, true);
    }
}

#[tauri::command]
fn registry_apps() -> Result<Vec<RegistryApp>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut apps = HashMap::new();
        let hives = [
            RegKey::predef(HKEY_LOCAL_MACHINE),
            RegKey::predef(HKEY_CURRENT_USER),
        ];
        for hive in &hives {
            for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
                collect_app_paths(hive, view, &mut apps);
                collect_uninstall_entries(hive, view, &mut apps);
            }
        }
        let mut result: Vec<_> = apps.into_values().collect();
        result.sort_by(|left, right| {
            left.title
                .to_lowercase()
                .cmp(&right.title.to_lowercase())
        });
        for (index, app) in result.iter_mut().enumerate() {
            app.id = format!("registry-{index}");
        }
        Ok(result)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn launch_target(target: String, args: String, working_dir: String) -> Result<(), String> {
    let path = Path::new(&target);
    let is_executable = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "exe" | "com"));

    if is_executable {
        let mut command = Command::new(path);
        if !args.trim().is_empty() {
            command.args(split_windows_args(&args));
        }
        if !working_dir.trim().is_empty() {
            command.current_dir(working_dir);
        } else if let Some(parent) = path.parent() {
            command.current_dir(parent);
        }
        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }

    opener::open(path).map_err(|error| error.to_string())
}

fn split_windows_args(value: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for character in value.chars() {
        match character {
            '"' => quoted = !quoted,
            ' ' | '\t' if !quoted && !current.is_empty() => {
                result.push(std::mem::take(&mut current));
            }
            ' ' | '\t' if !quoted => {}
            _ => current.push(character),
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

#[tauri::command]
fn reveal_target(target: String) -> Result<(), String> {
    let path = Path::new(&target);
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer.exe");
        if path.is_file() {
            command.arg(format!("/select,{}", path.display()));
        } else {
            command.arg(path);
        }
        command
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| error.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        opener::open(path.parent().unwrap_or(path)).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let path = state_path(&app)?;
    opener::open(path.parent().unwrap_or(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyDiagnostics {
    trigger_count: usize,
    window_visible: bool,
}

#[tauri::command]
fn hotkey_diagnostics(app: AppHandle) -> Result<HotkeyDiagnostics, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    Ok(HotkeyDiagnostics {
        trigger_count: HOTKEY_TRIGGER_COUNT.load(Ordering::Relaxed),
        window_visible: window.is_visible().map_err(|error| error.to_string())?,
    })
}

fn target_exists(target: &str) -> bool {
    let value = target.trim().trim_matches('"');
    if value.is_empty() {
        return false;
    }
    let bytes = value.as_bytes();
    let is_drive_path = bytes.len() >= 3
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/');
    let is_unc_path = value.starts_with(r"\\");
    let is_protocol = !is_drive_path
        && !is_unc_path
        && value
            .find(':')
            .is_some_and(|index| {
                index > 0
                    && !value[..index].contains('\\')
                    && !value[..index].contains('/')
            });
    is_protocol || Path::new(value).exists()
}

#[tauri::command]
async fn check_targets(targets: Vec<String>) -> Result<HashMap<String, bool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        targets
            .into_iter()
            .map(|target| {
                let exists = target_exists(&target);
                (target, exists)
            })
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state
                        != tauri_plugin_global_shortcut::ShortcutState::Pressed
                    {
                        return;
                    }
                    HOTKEY_TRIGGER_COUNT.fetch_add(1, Ordering::Relaxed);
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示 QuickNest", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("missing app icon").clone())
                .tooltip("QuickNest 轻启")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            if std::env::args().any(|value| value == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            icon_for_path,
            registry_apps,
            launch_target,
            reveal_target,
            open_data_folder,
            hide_window,
            hotkey_diagnostics,
            check_targets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::registry_apps;

    #[test]
    fn registry_scan_finds_launchable_apps() {
        let apps = registry_apps().expect("registry scan should succeed");
        assert!(!apps.is_empty(), "registry scan returned no launchable apps");
        eprintln!("registry apps found: {}", apps.len());
    }
}
