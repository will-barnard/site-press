<script setup>
import { ref, onMounted, watch } from 'vue';

// Deliberately small: bold, italic, link, subheading, lists. Clients editing
// copy need these; anything more becomes layout editing, which the lite CMS
// leaves out. The server sanitises whatever arrives regardless.
const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const el = ref(null);
let last = props.modelValue;

onMounted(() => { el.value.innerHTML = props.modelValue || ''; });
watch(() => props.modelValue, (v) => { if (v !== last && el.value) { el.value.innerHTML = v || ''; last = v; } });

function sync() { last = el.value.innerHTML; emit('update:modelValue', last); }
function cmd(name, arg) { el.value.focus(); document.execCommand(name, false, arg); sync(); }
function link() { const href = prompt('Link address (https://… or /page)'); if (href) cmd('createLink', href); }
</script>

<template>
  <div class="spa-rte">
    <div class="spa-row" style="gap: 0.25rem; margin-bottom: 0.35rem">
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="cmd('bold')"><b>B</b></button>
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="cmd('italic')"><i>I</i></button>
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="link">Link</button>
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="cmd('formatBlock', 'h3')">Subheading</button>
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="cmd('formatBlock', 'p')">Paragraph</button>
      <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="cmd('insertUnorderedList')">• List</button>
    </div>
    <div ref="el" class="spa-rte__area" contenteditable="true" @input="sync" @blur="sync" />
  </div>
</template>

<style>
.spa-rte__area { min-height: 110px; padding: 0.6rem 0.75rem; border: 1px solid #cdd2db; border-radius: 6px; background: #fff; }
.spa-rte__area:focus { outline: 2px solid #2557d6; outline-offset: 1px; }
.spa-rte__area p { margin: 0 0 0.6em; }
</style>
