<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { Database, Keyboard, X } from "lucide-vue-next";
import type { LauncherSettings } from "../types";

const props = defineProps<{ settings: LauncherSettings; saving?: boolean }>();
const emit = defineEmits<{ close: []; save: [settings: LauncherSettings] }>();
const form = ref({ ...props.settings });
const recording = ref(false);
const recordingError = ref("");
const hotkeyChanged = computed(() => form.value.hotkey !== props.settings.hotkey);
let previousHotkey = form.value.hotkey;

onMounted(async () => {
  try {
    form.value.startOnBoot = await isEnabled();
  } catch {
    // Keep the saved value if the OS query is unavailable.
  }
});

onBeforeUnmount(stopRecording);

function beginRecording() {
  previousHotkey = form.value.hotkey;
  recordingError.value = "";
  recording.value = true;
  window.addEventListener("keydown", captureHotkey, true);
}

function stopRecording() {
  recording.value = false;
  window.removeEventListener("keydown", captureHotkey, true);
}

function cancelRecording() {
  form.value.hotkey = previousHotkey;
  recordingError.value = "";
  stopRecording();
}

function captureHotkey(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    cancelRecording();
    return;
  }
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;

  const key = normalizedKey(event);
  if (!key) {
    recordingError.value = "这个按键暂不支持，请换一个组合";
    return;
  }

  const modifiers = [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Super" : "",
  ].filter(Boolean);

  if (!modifiers.length && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    recordingError.value = "请至少同时按住 Ctrl、Alt、Shift 或 Win 中的一个";
    return;
  }

  form.value.hotkey = [...modifiers, key].join("+");
  recordingError.value = "";
  stopRecording();
}

function normalizedKey(event: KeyboardEvent) {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)) return event.code;
  const keys: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Minus: "Minus",
    Equal: "Equal",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Backquote: "Backquote",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Backslash: "Backslash",
  };
  return keys[event.code] ?? "";
}

function save() {
  stopRecording();
  emit("save", { ...form.value });
}
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section class="modal settings-modal">
      <header class="modal-header">
        <div>
          <span class="eyebrow">偏好设置</span>
          <h2>让轻启更顺手</h2>
        </div>
        <button class="icon-button" title="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="settings-scroll">
        <div class="settings-list">
        <div class="setting-row">
          <div>
            <strong>全局唤起快捷键</strong>
            <small v-if="recordingError" class="setting-error">{{ recordingError }}</small>
            <small v-else-if="recording">按下组合键，Esc 取消</small>
            <small v-else-if="hotkeyChanged" class="setting-pending">已录制，请点击底部“应用并保存”</small>
            <small v-else>点击录制，然后直接按下组合键</small>
          </div>
          <div class="hotkey-recorder" :class="{ recording }">
            <button class="hotkey-capture" type="button" @click="recording ? cancelRecording() : beginRecording()">
              <Keyboard :size="16" />
              <kbd>{{ recording ? "等待按键…" : form.hotkey }}</kbd>
            </button>
            <button class="hotkey-record-button" type="button" @click="recording ? cancelRecording() : beginRecording()">
              {{ recording ? "取消" : "录制" }}
            </button>
          </div>
        </div>
        <label class="setting-row">
          <div><strong>开机自动启动</strong><small>启动后安静驻留在系统托盘</small></div>
          <input v-model="form.startOnBoot" type="checkbox" class="switch" />
        </label>
        <label class="setting-row">
          <div><strong>失去焦点后隐藏</strong><small>适合把 QuickNest 当作临时浮层</small></div>
          <input v-model="form.hideOnBlur" type="checkbox" class="switch" />
        </label>
        <label class="setting-row">
          <div><strong>图标尺寸</strong><small>{{ form.iconSize }} 像素 · 也可按 Ctrl + 滚轮调节</small></div>
          <input v-model.number="form.iconSize" type="range" min="20" max="64" step="4" />
        </label>
        <label class="setting-row">
          <div><strong>窗口透明度</strong><small>{{ form.opacity }}%</small></div>
          <input v-model.number="form.opacity" type="range" min="82" max="100" />
        </label>
        <div class="setting-row">
          <div><strong>外观</strong><small>两套低干扰配色</small></div>
          <select v-model="form.theme" class="compact-input">
            <option value="midnight">深夜</option>
            <option value="mist">晨雾</option>
          </select>
        </div>
        </div>

        <button class="data-button" @click="invoke('open_data_folder')">
          <Database :size="17" />
          打开数据目录
          <span>可直接备份 launcher.json</span>
        </button>
      </div>

      <footer class="modal-actions right">
        <button class="secondary-button" @click="emit('close')">取消</button>
        <button class="primary-button" :disabled="saving" @click="save">
          {{ saving ? "正在保存…" : "应用并保存" }}
        </button>
      </footer>
    </section>
  </div>
</template>
