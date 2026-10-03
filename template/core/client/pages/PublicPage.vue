<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useContentStore } from '../stores/content.js';
import SiteHeader from '../components/SiteHeader.vue';
import SiteFooter from '../components/SiteFooter.vue';
import BlockRenderer from '../components/BlockRenderer.vue';

const route = useRoute();
const store = useContentStore();
const path = computed(() => normalise(route.path));
const page = computed(() => store.pages[path.value]);
const missing = computed(() => store.missing[path.value]);

function normalise(p) {
  const s = decodeURIComponent(p).replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

async function load() {
  await Promise.all([store.ensureSite(), store.ensurePage(path.value)]);
  if (typeof document !== 'undefined' && page.value) {
    const site = store.site?.siteTitle || '';
    document.title = page.value.seo?.title || [page.value.title, site].filter(Boolean).join(' — ');
  }
}

// On the server, content is injected into the store before render
// (entry-server.js), so only the client ever fetches.
if (typeof window !== 'undefined') watch(path, load, { immediate: true });
</script>

<template>
  <div class="sp-site">
    <a class="sp-skip" href="#main">Skip to content</a>
    <SiteHeader :site="store.site" />
    <main id="main">
      <template v-if="page">
        <BlockRenderer v-for="block in page.blocks" :key="block.id" :block="block" />
      </template>
      <section v-else-if="missing" class="sp-section"><div class="sp-container">
        <h1>Page not found</h1>
        <p><SpLink to="/">Back to the home page</SpLink></p>
      </div></section>
    </main>
    <SiteFooter :site="store.site" />
  </div>
</template>
