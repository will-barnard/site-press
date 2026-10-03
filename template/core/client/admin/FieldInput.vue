<script setup>
import { defaults } from '../../shared/schema.js';
import MediaPicker from './MediaPicker.vue';
import RichTextInput from './RichTextInput.vue';

defineOptions({ name: 'FieldInput' });
const props = defineProps({ field: { type: Object, required: true }, name: { type: String, required: true }, modelValue: { default: undefined } });
const emit = defineEmits(['update:modelValue']);
const set = (v) => emit('update:modelValue', v);

function ensureLink() { return props.modelValue && typeof props.modelValue === 'object' ? props.modelValue : { label: '', href: '' }; }
function list() { return Array.isArray(props.modelValue) ? props.modelValue : []; }
function addItem() { set([...list(), defaults({ fields: props.field.fields })]); }
function removeItem(i) { const l = [...list()]; l.splice(i, 1); set(l); }
function moveItem(i, d) { const l = [...list()]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(l); }
function setItem(i, key, v) { const l = [...list()]; l[i] = { ...l[i], [key]: v }; set(l); }
</script>

<template>
  <div class="spa-field">
    <span>{{ field.label || name }}<template v-if="field.required"> *</template></span>
    <input v-if="field.type === 'text'" type="text" :value="modelValue" @input="set($event.target.value)" />
    <textarea v-else-if="field.type === 'textarea'" :value="modelValue" rows="3" @input="set($event.target.value)" />
    <RichTextInput v-else-if="field.type === 'richtext'" :model-value="modelValue" @update:model-value="set" />
    <input v-else-if="field.type === 'number'" type="number" :min="field.min" :max="field.max" :step="field.max === 1 ? 0.05 : 1" :value="modelValue" @input="set($event.target.value === '' ? null : Number($event.target.value))" />
    <label v-else-if="field.type === 'boolean'" class="spa-row"><input type="checkbox" :checked="modelValue" @change="set($event.target.checked)" /> Yes</label>
    <select v-else-if="field.type === 'select'" :value="modelValue" @change="set($event.target.value)">
      <option v-if="!field.required" value="" />
      <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <div v-else-if="field.type === 'color'" class="spa-row">
      <input type="color" :value="/^#[0-9a-f]{6}$/i.test(modelValue || '') ? modelValue : '#ffffff'" @input="set($event.target.value)" />
      <input type="text" :value="modelValue" placeholder="none" style="max-width: 140px" @input="set($event.target.value)" />
    </div>
    <MediaPicker v-else-if="field.type === 'media'" :model-value="modelValue" @update:model-value="set" />
    <div v-else-if="field.type === 'link'" class="spa-row">
      <input type="text" placeholder="Label" :value="ensureLink().label" style="max-width: 220px" @input="set({ ...ensureLink(), label: $event.target.value })" />
      <input type="text" placeholder="/page or https://…" :value="ensureLink().href" class="spa-grow" @input="set({ ...ensureLink(), href: $event.target.value })" />
    </div>
    <div v-else-if="field.type === 'list'" style="display: grid; gap: 0.5rem">
      <div v-for="(item, i) in list()" :key="i" style="border: 1px dashed #cdd2db; border-radius: 8px; padding: 0.75rem">
        <div class="spa-row" style="justify-content: flex-end">
          <span class="spa-muted spa-grow">#{{ i + 1 }}</span>
          <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="moveItem(i, -1)">↑</button>
          <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="moveItem(i, 1)">↓</button>
          <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="removeItem(i)">Remove</button>
        </div>
        <FieldInput v-for="(sub, key) in field.fields" :key="key" :field="sub" :name="key" :model-value="item[key]" @update:model-value="setItem(i, key, $event)" />
      </div>
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" :disabled="field.max && list().length >= field.max" style="justify-self: start" @click="addItem">+ Add</button>
    </div>
  </div>
</template>
