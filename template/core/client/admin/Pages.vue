<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from './api.js';

const router = useRouter();
const pages = ref([]);
const error = ref('');
const title = ref('');
const path = ref('/');

async function load() { pages.value = await api.get('/api/admin/pages'); }
onMounted(() => load().catch((e) => { error.value = e.message; }));

async function create() {
  error.value = '';
  try {
    const page = await api.post('/api/admin/pages', { title: title.value, path: path.value });
    router.push(`/admin/pages/${page.id}`);
  } catch (e) { error.value = e.message; }
}
async function remove(p) {
  if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
  await api.del(`/api/admin/pages/${p.id}`);
  await load();
}
</script>

<template>
  <div>
    <h1>Pages</h1>
    <div class="spa-card">
      <table>
        <thead><tr><th>Title</th><th>Address</th><th>Status</th><th>Updated</th><th /></tr></thead>
        <tbody>
          <tr v-for="p in pages" :key="p.id">
            <td><RouterLink :to="`/admin/pages/${p.id}`">{{ p.title || '(untitled)' }}</RouterLink></td>
            <td><code>{{ p.path }}</code></td>
            <td><span class="spa-badge" :class="{ 'spa-badge--draft': p.status !== 'published' }">{{ p.status }}</span></td>
            <td class="spa-muted">{{ new Date(p.updated_at).toLocaleString() }}</td>
            <td><button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="remove(p)">Delete</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="spa-card">
      <h2>New page</h2>
      <form class="spa-row" @submit.prevent="create">
        <input v-model="title" type="text" placeholder="Title" required style="max-width: 260px" />
        <input v-model="path" type="text" placeholder="/new-page" required style="max-width: 220px" />
        <button class="spa-btn" type="submit">Create</button>
      </form>
      <p v-if="error" class="spa-error">{{ error }}</p>
    </div>
  </div>
</template>
