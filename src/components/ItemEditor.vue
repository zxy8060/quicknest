<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Link2, X } from "lucide-vue-next";
import type { LauncherGroup, LauncherItem } from "../types";
import { createId, plainClone } from "../types";
import { fetchIcon } from "../launcher";

const props = defineProps<{
  item?: LauncherItem;
  groups: LauncherGroup[];
  groupId: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [item: LauncherItem, destinationGroupId: string];
}>();

const form = reactive<LauncherItem>(
  props.item
    ? plainClone(props.item)
    : {
        id: createId(),
        title: "",
        target: "",
        kind: "app",
        args: "",
        workingDir: "",
        notes: "",
        favorite: false,
        launchCount: 0,
      },
);
const destination = ref(props.groupId);
const valid = computed(() => form.title.trim() && form.target.trim());
const orderedGroups = computed(() =>
  props.groups
    .filter((group) => !group.parentId)
    .flatMap((parent) => [
      parent,
      ...props.groups.filter((group) => group.parentId === parent.id),
    ]),
);

function groupOptionLabel(group: LauncherGroup) {
  return group.parentId ? `　└ ${group.name}` : group.name;
}

async function browse() {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "选择程序或文件",
  });
  if (!selected) return;
  form.target = selected;
  const name = selected.split(/[\\/]/).pop() || selected;
  if (!form.title) form.title = name.replace(/\.[^.]+$/, "");
  form.icon = await fetchIcon(selected);
}

function save() {
  if (!valid.value) return;
  emit("save", plainClone(form), destination.value);
}
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section class="modal">
      <header class="modal-header">
        <div>
          <span class="eyebrow">快捷项</span>
          <h2>{{ item ? "编辑启动项" : "添加启动项" }}</h2>
        </div>
        <button class="icon-button" title="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="form-grid">
        <label>
          <span>名称</span>
          <input v-model="form.title" autofocus placeholder="例如：Visual Studio Code" />
        </label>
        <label>
          <span>目标</span>
          <div class="input-action">
            <input v-model="form.target" placeholder="程序、文件、文件夹或网址" />
            <button title="浏览" @click="browse"><FolderOpen :size="17" /></button>
          </div>
        </label>
        <label>
          <span>分组</span>
          <select v-model="destination">
            <option v-for="group in orderedGroups" :key="group.id" :value="group.id">
              {{ groupOptionLabel(group) }}
            </option>
          </select>
        </label>
        <label>
          <span>类型</span>
          <select v-model="form.kind">
            <option value="app">应用程序</option>
            <option value="file">文件</option>
            <option value="folder">文件夹</option>
            <option value="url">网址</option>
          </select>
        </label>
        <label>
          <span>启动参数（可选）</span>
          <input v-model="form.args" placeholder='例如："C:\My File.txt"' />
        </label>
        <label>
          <span>工作目录（可选）</span>
          <input v-model="form.workingDir" placeholder="默认使用目标所在目录" />
        </label>
        <label class="full">
          <span>备注</span>
          <textarea v-model="form.notes" rows="3" placeholder="写点提示，搜索时也能找到"></textarea>
        </label>
        <label class="check-row full">
          <input v-model="form.favorite" type="checkbox" />
          <span>加入收藏</span>
        </label>
      </div>

      <footer class="modal-actions">
        <span class="hint"><Link2 :size="14" /> 数据仅保存在本机</span>
        <div>
          <button class="secondary-button" @click="emit('close')">取消</button>
          <button class="primary-button" :disabled="!valid" @click="save">保存</button>
        </div>
      </footer>
    </section>
  </div>
</template>
