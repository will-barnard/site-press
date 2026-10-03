<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from './api.js';
import { blocks } from '../blocks.js';
import { defaults } from '../../shared/schema.js';
import BlockForm from './BlockForm.vue';

const props = defineProps({ id: { type: String, required: true } });
const page = ref(null);
const error = ref('');
const details = ref([]);
const saved = ref('');
const busy = ref(false);
const openIdx = ref(null);
const newType = ref('rich-text');
const revisions = ref([]);
const showRevisions = ref(false);
const types = computed(() => Object.entries(blocks).map(([type, b]) => ({ type, label: b.schema.label || type, source: b.source })));

async function load() {
  page.value = await api.get(`/api/admin/pages/${props.id}`);
  page.value.seo = page.value.seo || {};
}
onMounted(() => load().catch((e) => { error.value = e.message; }));

function add() {
  const def = blocks[newType.value];
  page.value.blocks.push({ type: newType.value, variant: (def.schema.variants || ['default'])[0], props: defaults(def.schema) });
  openIdx.value = page.value.blocks.length - 1;
}
function move(i, d) {
  const list = page.value.blocks;
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  if (openIdx.value === i) openIdx.value = j;
}
function remove(i) {
  if (!confirm('Remove this section?')) return;
  page.value.blocks.splice(i, 1);
  openIdx.value = null;
}
async function save(status) {
  busy.value = true; error.value = ''; details.value = []; saved.value = '';
  try {
    const body = { ...page.value, status: status || page.value.status };
    page.value = await api.put(`/api/admin/pages/${props.id}`, body);
    page.value.seo = page.value.seo || {};
    saved.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e.message;
    details.value = e.details || [];
  } finally { busy.value = false; }
}
async function loadRevisions() {
  revisions.value = await api.get(`/api/admin/pages/${props.id}/revisions`);
  showRevisions.value = true;
}
async function restore(rev) {
  if (!confirm(`Restore the version from ${new Date(rev.created_at).toLocaleString()}? Your current version is kept in history.`)) return;
  page.value = await api.post(`/api/admin/pages/${props.id}/revisions/${rev.id}/restore`);
  page.value.seo = page.value.seo || {};
  showRevisions.value = false;
}
function label(b) {
  const def = blocks[b.type];
  const p = b.props || {};
  const hint = p.heading || p.quote || p.title || (p.body || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 60);
  return `${def ? def.schema.label : b.type}${hint ? ` — ${hint}` : ''}`;
}
</script>

<template>
  <div v-if="page">
    <div class="spa-row" style="margin-bottom: 1rem">
      <h1 class="spa-grow" style="margin: 0">{{ page.title || 'Untitled page' }}</h1>
      <span class="spa-muted">{{ saved }}</span>
      <a class="spa-btn spa-btn--ghost" :href="`${page.path}?preview=1`" target="_blank">Preview ↗</a>
      <button class="spa-btn spa-btn--ghost" type="button" :disabled="busy" @click="save('draft')">Save draft</button>
      <button class="spa-btn" type="button" :disabled="busy" @click="save('published')">Publish</button>
    </div>
    <p v-if="error" class="spa-error">{{ error }}</p>
    <ul v-if="details.length" class="spa-error"><li v-for="d in details" :key="d">{{ d }}</li></ul>

    <div class="spa-card">
      <div class="spa-row">
        <label class="spa-field spa-grow"><span>Title</span><input v-model="page.title" type="text" /></label>
        <label class="spa-field spa-grow"><span>Address</span><input v-model="page.path" type="text" /></label>
      </div>
      <label class="spa-field"><span>Search description</span><textarea v-model="page.seo.description" rows="2" /></label>
      <p class="spa-muted">Status: {{ page.status }} · <a href="#" @click.prevent="loadRevisions">History</a></p>
      <div v-if="showRevisions">
        <table>
          <tr v-for="r in revisions" :key="r.id">
            <td>{{ new Date(r.created_at).toLocaleString() }}</td><td class="spa-muted">{{ r.edited_by || 'import' }}</td>
            <td><button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="restore(r)">Restore</button></td>
          </tr>
        </table>
      </div>
    </div>

    <h2>Sections</h2>
    <div v-for="(b, i) in page.blocks" :key="b.id || `new-${i}`" class="spa-card">
      <div class="spa-row">
        <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="openIdx = openIdx === i ? null : i">{{ openIdx === i ? '▾' : '▸' }}</button>
        <strong class="spa-grow" style="cursor: pointer" @click="openIdx = openIdx === i ? null : i">{{ label(b) }}</strong>
        <span v-if="b.type === 'placeholder'" class="spa-badge spa-badge--draft">needs review</span>
        <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" :disabled="i === 0" @click="move(i, -1)">↑</button>
        <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" :disabled="i === page.blocks.length - 1" @click="move(i, 1)">↓</button>
        <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="remove(i)">Remove</button>
      </div>
      <BlockForm v-if="openIdx === i" :block="b" style="margin-top: 1rem" />
    </div>
    <div class="spa-card spa-row">
      <select v-model="newType" style="max-width: 280px">
        <option v-for="t in types" :key="t.type" :value="t.type">{{ t.label }}{{ t.source === 'site' ? ' (custom)' : '' }}</option>
      </select>
      <button class="spa-btn" type="button" @click="add">Add section</button>
    </div>
  </div>
  <p v-else-if="error" class="spa-error">{{ error }}</p>
</template>
