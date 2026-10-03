<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminStore } from './store.js';
import Login from './Login.vue';
import Pages from './Pages.vue';
import PageEditor from './PageEditor.vue';
import MediaLibrary from './MediaLibrary.vue';
import Settings from './Settings.vue';
import Submissions from './Submissions.vue';
import Users from './Users.vue';

const store = useAdminStore();
const route = useRoute();
const router = useRouter();
const parts = computed(() => [].concat(route.params.rest || []).filter(Boolean));
const section = computed(() => parts.value[0] || 'pages');
const views = { pages: Pages, media: MediaLibrary, settings: Settings, submissions: Submissions, users: Users };
const view = computed(() => (section.value === 'pages' && parts.value[1] ? PageEditor : views[section.value] || Pages));
const nav = [
  ['pages', 'Pages'], ['media', 'Media'], ['settings', 'Site settings'], ['submissions', 'Form submissions'], ['users', 'Users'],
];

onMounted(() => { if (!store.checked) store.check(); });
async function logout() { await store.logout(); router.push('/admin'); }
</script>

<template>
  <div class="spa">
    <p v-if="!store.checked" class="spa-muted spa-pad">Loading…</p>
    <Login v-else-if="!store.user" />
    <div v-else class="spa-shell">
      <aside class="spa-side">
        <RouterLink to="/" class="spa-brand" target="_blank">View site ↗</RouterLink>
        <nav>
          <RouterLink v-for="[key, label] in nav" :key="key" :to="`/admin/${key}`" :class="{ active: section === key }">{{ label }}</RouterLink>
        </nav>
        <div class="spa-side__foot">
          <span class="spa-muted">{{ store.user.email }}</span>
          <button class="spa-btn spa-btn--ghost" type="button" @click="logout">Sign out</button>
        </div>
      </aside>
      <main class="spa-main">
        <component :is="view" :id="parts[1]" />
      </main>
    </div>
  </div>
</template>

<style>
.spa { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.45; color: #1d2433; background: #f5f6f8; min-height: 100vh; }
.spa * { box-sizing: border-box; }
.spa-pad { padding: 2rem; }
.spa-shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
.spa-side { background: #1d2433; color: #e7eaf0; padding: 1.25rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; }
.spa-side nav { display: grid; gap: 0.25rem; }
.spa-side a { color: #c9d0dc; text-decoration: none; padding: 0.45rem 0.6rem; border-radius: 6px; }
.spa-side a.active, .spa-side a:hover { background: #2d3648; color: #fff; }
.spa-brand { font-weight: 600; }
.spa-side__foot { margin-top: auto; display: grid; gap: 0.5rem; font-size: 13px; }
.spa-main { padding: 2rem; max-width: 1100px; width: 100%; }
/* The site's base.css styles bare headings with the client's fonts; the admin keeps its own. */
.spa h1, .spa h2, .spa h3 { font-family: inherit; font-weight: 600; letter-spacing: normal; line-height: 1.3; }
.spa h1 { font-size: 1.5rem; margin: 0 0 1.25rem; }
.spa h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }
.spa-muted { color: #6b7385; }
.spa-card { background: #fff; border: 1px solid #e2e5eb; border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; }
.spa-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.spa-grow { flex: 1; }
.spa-field { display: grid; gap: 0.3rem; margin-bottom: 0.9rem; }
.spa-field > span { font-weight: 600; font-size: 13px; }
.spa input[type=text], .spa input[type=email], .spa input[type=password], .spa input[type=number], .spa input[type=url], .spa textarea, .spa select {
  font: inherit; padding: 0.5rem 0.65rem; border: 1px solid #cdd2db; border-radius: 6px; background: #fff; width: 100%;
}
.spa textarea { min-height: 80px; resize: vertical; }
.spa-btn { font: inherit; border: 1px solid #2557d6; background: #2557d6; color: #fff; padding: 0.45rem 0.9rem; border-radius: 6px; cursor: pointer; }
.spa-btn--ghost { background: transparent; color: inherit; border-color: #cdd2db; }
.spa-btn--danger { background: #b42318; border-color: #b42318; }
.spa-btn--sm { padding: 0.2rem 0.55rem; font-size: 13px; }
.spa-btn:disabled { opacity: 0.55; cursor: default; }
.spa-error { color: #b42318; }
.spa-ok { color: #067647; }
.spa table { width: 100%; border-collapse: collapse; }
.spa th, .spa td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid #e2e5eb; vertical-align: top; }
.spa-badge { display: inline-block; font-size: 12px; padding: 0.05rem 0.45rem; border-radius: 999px; background: #eef1f6; }
.spa-badge--draft { background: #fff4e5; color: #8a4b00; }
@media (max-width: 800px) { .spa-shell { grid-template-columns: 1fr; } .spa-side { flex-direction: row; flex-wrap: wrap; } .spa-main { padding: 1rem; } }
</style>
