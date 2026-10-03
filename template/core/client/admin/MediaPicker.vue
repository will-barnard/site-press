<script setup>
import { ref } from 'vue';
import { useAdminStore } from './store.js';

const props = defineProps({ modelValue: { type: Object, default: null } });
const emit = defineEmits(['update:modelValue']);
const store = useAdminStore();
const open = ref(false);
const error = ref('');

async function toggle() { open.value = !open.value; if (open.value) await store.loadMedia(); }
function pick(m) { emit('update:modelValue', { src: m.url, alt: m.alt || '', width: m.width || undefined, height: m.height || undefined }); open.value = false; }
async function upload(e) {
  const file = e.target.files[0];
  if (!file) return;
  error.value = '';
  try { pick(await store.upload(file)); } catch (err) { error.value = err.message; }
}
function setAlt(v) { emit('update:modelValue', { ...props.modelValue, alt: v }); }
</script>

<template>
  <div>
    <div class="spa-row">
      <img v-if="modelValue && modelValue.src" :src="modelValue.src" alt="" style="width: 96px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e5eb" />
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="toggle">{{ modelValue ? 'Change' : 'Choose image' }}</button>
      <button v-if="modelValue" class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="emit('update:modelValue', null)">Clear</button>
      <input v-if="modelValue" type="text" placeholder="Alt text (describe the image)" :value="modelValue.alt" class="spa-grow" @input="setAlt($event.target.value)" />
    </div>
    <div v-if="open" class="spa-card" style="margin-top: 0.5rem">
      <label class="spa-btn spa-btn--sm" style="display: inline-block; margin-bottom: 0.75rem">Upload… <input type="file" accept="image/*" hidden @change="upload" /></label>
      <p v-if="error" class="spa-error">{{ error }}</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 0.5rem; max-height: 320px; overflow: auto">
        <button v-for="m in store.media" :key="m.id" type="button" style="padding: 0; border: 1px solid #e2e5eb; border-radius: 6px; background: none; cursor: pointer" @click="pick(m)">
          <img :src="m.url" :alt="m.alt" style="width: 100%; height: 80px; object-fit: cover; display: block; border-radius: 6px" />
        </button>
      </div>
    </div>
  </div>
</template>
