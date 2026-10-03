<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api.js';
import { useAdminStore } from './store.js';

const store = useAdminStore();
const error = ref('');
onMounted(() => store.loadMedia(true).catch((e) => { error.value = e.message; }));

async function upload(e) {
  error.value = '';
  for (const file of e.target.files) {
    try { await store.upload(file); } catch (err) { error.value = `${file.name}: ${err.message}`; }
  }
}
async function saveAlt(m) { await api.patch(`/api/admin/media/${m.id}`, { alt: m.alt }); }
async function remove(m) {
  if (!confirm('Delete this image? Pages using it will show nothing in its place.')) return;
  await api.del(`/api/admin/media/${m.id}`);
  store.media = store.media.filter((x) => x.id !== m.id);
}
</script>

<template>
  <div>
    <div class="spa-row" style="margin-bottom: 1rem">
      <h1 class="spa-grow" style="margin: 0">Media</h1>
      <label class="spa-btn">Upload images <input type="file" accept="image/*" multiple hidden @change="upload" /></label>
    </div>
    <p v-if="error" class="spa-error">{{ error }}</p>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem">
      <div v-for="m in store.media" :key="m.id" class="spa-card" style="padding: 0.6rem; margin: 0">
        <img :src="m.url" :alt="m.alt" style="width: 100%; height: 140px; object-fit: cover; border-radius: 6px" />
        <input v-model="m.alt" type="text" placeholder="Alt text" style="margin: 0.5rem 0" @change="saveAlt(m)" />
        <div class="spa-row"><span class="spa-muted spa-grow" style="font-size: 12px">{{ m.width }}×{{ m.height }}</span>
          <button class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="remove(m)">Delete</button></div>
      </div>
    </div>
  </div>
</template>
