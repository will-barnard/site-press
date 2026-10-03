<script setup>
import { onMounted, onUnmounted, ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const router = useRouter();
const jobs = ref([]);
const error = ref('');
const url = ref('');
const showOptions = ref(false);
const opts = reactive({ maxPages: 30, vp1440: true, vp768: true, vp375: true, ai: 'auto', customBlocks: true, fixLoop: true });
let timer;

async function load() { try { jobs.value = await api.get('/api/jobs'); } catch (e) { error.value = e.message; } }
onMounted(() => { load(); timer = setInterval(load, 5000); });
onUnmounted(() => clearInterval(timer));

async function start() {
  error.value = '';
  try {
    const viewports = [opts.vp1440 && 1440, opts.vp768 && 768, opts.vp375 && 375].filter(Boolean);
    const job = await api.post('/api/jobs', { url: url.value, options: { maxPages: opts.maxPages, viewports, ai: opts.ai, customBlocks: opts.customBlocks, fixLoop: opts.fixLoop } });
    router.push(`/jobs/${job.id}`);
  } catch (e) { error.value = e.message; }
}
const ago = (t) => { if (!t) return ''; const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
</script>

<template>
  <div>
    <h1>Rebuild a site</h1>
    <form class="card" @submit.prevent="start">
      <div class="row">
        <input v-model="url" class="grow" type="url" placeholder="https://www.example.com" required />
        <button class="btn" type="submit">Start</button>
      </div>
      <p class="small"><button class="link" type="button" @click="showOptions = !showOptions">{{ showOptions ? 'Hide' : 'Options' }}</button></p>
      <div v-if="showOptions" class="row" style="gap: 20px; align-items: flex-start">
        <label>Max pages<br /><input v-model.number="opts.maxPages" type="number" min="1" max="200" style="width: 90px" /></label>
        <div>Viewports<br />
          <label><input v-model="opts.vp1440" type="checkbox" /> 1440</label>
          <label><input v-model="opts.vp768" type="checkbox" /> 768</label>
          <label><input v-model="opts.vp375" type="checkbox" /> 375</label>
        </div>
        <label>dry-dock mapping<br />
          <select v-model="opts.ai">
            <option value="auto">only unsure sections</option>
            <option value="all">every section (slow)</option>
            <option value="off">off — rules only</option>
          </select>
        </label>
        <div>
          <label><input v-model="opts.customBlocks" type="checkbox" /> write custom blocks for unmatched sections</label><br />
          <label><input v-model="opts.fixLoop" type="checkbox" /> try other layouts for failing sections</label>
        </div>
      </div>
      <p v-if="error" class="bad">{{ error }}</p>
    </form>

    <div class="card">
      <h2>Jobs</h2>
      <p v-if="!jobs.length" class="muted">None yet.</p>
      <table v-else>
        <thead><tr><th>Site</th><th>Status</th><th>Sections passing</th><th>Started</th></tr></thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.id">
            <td><RouterLink :to="`/jobs/${j.id}`">{{ j.url.replace(/^https?:\/\//, '') }}</RouterLink></td>
            <td><span class="badge" :class="`badge--${j.status}`">{{ j.status }}</span> <span v-if="j.status === 'running'" class="muted small">{{ j.stage }}</span></td>
            <td>{{ j.summary ? `${j.summary.scores.passed}/${j.summary.scores.sections}` : '—' }} <span v-if="j.summary" class="muted small">visual {{ pct(j.summary.scores.visual) }}</span></td>
            <td class="muted">{{ ago(j.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
