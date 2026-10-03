<script setup>
import { ref } from 'vue';
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'grid' } });
const open = ref(null);
</script>

<template>
  <div class="sp-container">
    <h2 v-if="content.heading">{{ content.heading }}</h2>
    <div class="gal" :class="`gal--${variant}`" :style="{ '--cols': content.columns || 3 }">
      <figure v-for="(item, i) in content.images" :key="i" class="gal__item">
        <button type="button" class="gal__btn" :aria-label="`Open image ${i + 1}`" @click="open = item">
          <SpMedia :value="item.image" />
        </button>
        <figcaption v-if="item.caption">{{ item.caption }}</figcaption>
      </figure>
    </div>
    <div v-if="open" class="gal__lightbox" role="dialog" aria-modal="true" @click="open = null" @keydown.esc="open = null">
      <SpMedia :value="open.image" eager />
    </div>
  </div>
</template>

<style scoped>
.gal--grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: calc(var(--sp-gap) / 2); }
.gal--strip { display: flex; gap: calc(var(--sp-gap) / 2); overflow-x: auto; }
.gal--strip .gal__item { flex: 0 0 auto; width: min(70vw, 420px); }
.gal__item { margin: 0; }
.gal__btn { padding: 0; border: 0; background: none; cursor: zoom-in; display: block; width: 100%; }
.gal__item :deep(img) { width: 100%; height: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
figcaption { font-size: 0.9rem; margin-top: 0.4rem; }
.gal__lightbox { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.88); display: grid; place-items: center; z-index: 1000; cursor: zoom-out; }
.gal__lightbox :deep(img) { max-width: 92vw; max-height: 92vh; object-fit: contain; }
@media (max-width: 767px) { .gal--grid { grid-template-columns: repeat(2, 1fr); } }
</style>
