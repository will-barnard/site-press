<script setup>
import { computed } from 'vue';
const props = defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'centered' } });
const split = computed(() => props.variant.startsWith('split'));
</script>

<template>
  <div class="hero" :class="[`hero--${variant}`, { 'hero--has-bg': !split && content.image }]">
    <SpMedia v-if="!split && content.image" class="hero__bg" :value="content.image" eager />
    <div class="hero__inner sp-container">
      <div class="hero__text">
        <p v-if="content.eyebrow" class="hero__eyebrow">{{ content.eyebrow }}</p>
        <h1 class="hero__heading">{{ content.heading }}</h1>
        <p v-if="content.subheading" class="hero__sub">{{ content.subheading }}</p>
        <SpButtons :buttons="content.buttons" />
      </div>
      <SpMedia v-if="split && content.image" class="hero__image" :value="content.image" eager />
    </div>
  </div>
</template>

<style scoped>
.hero { position: relative; overflow: hidden; padding: var(--sp-section-pad) 0; }
.hero--has-bg { min-height: var(--sp-hero-min-height, 0); display: flex; align-items: center; color: var(--sp-hero-on-image, #fff); }
.hero__bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
/* Darkening overlay only when the original had one (_style.overlay). */
.hero--has-bg::after { content: ''; position: absolute; inset: 0; background: #000; opacity: var(--sp-overlay, 0); }
.hero__inner { position: relative; z-index: 1; width: 100%; }
.hero--centered .hero__text { text-align: center; margin: 0 auto; max-width: 72rem; }
.hero--centered :deep(.sp-buttons) { justify-content: center; }
.hero--left .hero__text { max-width: 44rem; }
.hero--split-left .hero__inner, .hero--split-right .hero__inner { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-gap); align-items: center; }
.hero--split-left .hero__image { order: -1; }
.hero__image { width: 100%; height: auto; border-radius: var(--sp-radius); }
.hero__eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.85rem; margin: 0 0 0.75rem; }
.hero__heading { font-size: var(--sp-h1-size); margin: 0 0 1rem; }
.hero__sub { font-size: var(--sp-hero-sub-size, 1em); margin: 0 0 1.5rem; }
@media (max-width: 767px) {
  .hero--split-left .hero__inner, .hero--split-right .hero__inner { grid-template-columns: 1fr; }
}
</style>
