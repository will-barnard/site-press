<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const job = ref(null);
const events = ref([]);
const error = ref('');
const logEl = ref(null);
const STAGES = ['capture', 'analyze', 'map', 'generate', 'custom', 'verify', 'report', 'package'];
let timer;
let lastEvent = 0;

async function poll() {
  try {
    job.value = await api.get(`/api/jobs/${props.id}`);
    const fresh = await api.get(`/api/jobs/${props.id}/events?after=${lastEvent}`);
    if (fresh.length) {
      const atBottom = logEl.value && logEl.value.scrollTop + logEl.value.clientHeight >= logEl.value.scrollHeight - 20;
      events.value.push(...fresh);
      lastEvent = fresh.at(-1).id;
      if (atBottom || events.value.length === fresh.length) { await nextTick(); if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; }
    }
    if (['done', 'failed', 'cancelled'].includes(job.value.status) && !fresh.length) clearInterval(timer);
  } catch (e) { error.value = e.message; }
}
onMounted(() => { poll(); timer = setInterval(poll, 2000); });
onUnmounted(() => clearInterval(timer));

const stageState = (s) => {
  if (!job.value) return '';
  if (job.value.status === 'done') return 'done';
  const cur = STAGES.indexOf(job.value.stage);
  const i = STAGES.indexOf(s);
  return i < cur ? 'done' : i === cur && job.value.status === 'running' ? 'active' : '';
};
const s = computed(() => job.value?.summary);
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const time = (t) => new Date(t).toLocaleTimeString();

async function cancel() { try { job.value = await api.post(`/api/jobs/${props.id}/cancel`); } catch (e) { error.value = e.message; } }
async function retry() { const j = await api.post(`/api/jobs/${props.id}/retry`); router.push(`/jobs/${j.id}`); }
async function remove() { if (!confirm('Delete this job and its files?')) return; await api.del(`/api/jobs/${props.id}`); router.push('/'); }
</script>

<template>
  <div v-if="job">
    <div class="row" style="margin-bottom: 8px">
      <h1 class="grow" style="margin: 0">{{ job.url.replace(/^https?:\/\//, '') }}</h1>
      <button v-if="['queued', 'running'].includes(job.status)" class="btn btn--ghost" type="button" :disabled="job.cancel_requested" @click="cancel">{{ job.cancel_requested ? 'Cancelling…' : 'Cancel' }}</button>
      <button v-if="['done', 'failed', 'cancelled'].includes(job.status)" class="btn btn--ghost" type="button" @click="retry">Run again</button>
      <button v-if="job.status !== 'running'" class="btn btn--ghost" type="button" @click="remove">Delete</button>
    </div>
    <p class="muted">
      <span class="badge" :class="`badge--${job.status}`">{{ job.status }}</span>
      <template v-if="job.status === 'queued' && job.queueAhead"> · {{ job.queueAhead }} job(s) ahead</template>
      · {{ job.options.maxPages }} pages max · {{ job.options.viewports.join(' / ') }}px · dry-dock {{ job.options.ai }}
    </p>
    <p v-if="error" class="bad">{{ error }}</p>
    <div class="stages"><div v-for="st in STAGES" :key="st" class="stage" :class="`stage--${stageState(st)}`">{{ st }}</div></div>
    <p v-if="job.error" class="card bad">{{ job.error }}</p>

    <div v-if="s" class="card">
      <div class="row" style="margin-bottom: 12px">
        <h2 class="grow" style="margin: 0">Result</h2>
        <a class="btn" :href="`/api/jobs/${job.id}/report/`" target="_blank">Open report</a>
        <a class="btn btn--ghost" :href="`/api/jobs/${job.id}/download/site`">Download site</a>
        <a class="btn btn--ghost" :href="`/api/jobs/${job.id}/download/report`">Download report</a>
      </div>
      <div class="tiles">
        <div class="tile"><span class="muted">Pages</span><b>{{ s.pages }}</b></div>
        <div class="tile"><span class="muted">Sections passing</span><b>{{ s.scores.passed }}/{{ s.scores.sections }}</b></div>
        <div class="tile"><span class="muted">Mean visual match</span><b>{{ pct(s.scores.visual) }}</b></div>
        <div class="tile"><span class="muted">Mean text kept</span><b>{{ pct(s.scores.text) }}</b></div>
        <div class="tile"><span class="muted">Rule / dry-dock / custom</span><b>{{ s.counts.rule }} / {{ s.counts.ai }} / {{ s.counts.custom }}</b></div>
        <div class="tile"><span class="muted">Placeholders</span><b>{{ s.counts.placeholder }}</b></div>
      </div>
      <p class="muted small" style="margin-top: 12px">
        <template v-if="s.drydock.calls">dry-dock: {{ s.drydock.calls }} calls via {{ Object.keys(s.drydock.workers).join(', ') || '—' }}. </template>
        <template v-if="s.artifacts.siteKey">Saved to brew-bucket at <code>{{ s.artifacts.siteKey }}</code>.</template>
      </p>
      <template v-if="s.decisions.length">
        <h2 style="margin-top: 16px">Needs a decision</h2>
        <ul><li v-for="d in s.decisions" :key="d.title"><strong>{{ d.title }}</strong><br /><span class="muted">{{ d.detail }}</span></li></ul>
      </template>
    </div>

    <div class="card">
      <h2>Log</h2>
      <div ref="logEl" class="log"><div v-for="e in events" :key="e.id" :class="e.level"><span style="opacity: 0.55">{{ time(e.at) }} [{{ e.stage }}]</span> {{ e.message }}</div><div v-if="!events.length" style="opacity: 0.6">Waiting for the worker…</div></div>
    </div>
  </div>
  <p v-else-if="error" class="bad">{{ error }}</p>
</template>
