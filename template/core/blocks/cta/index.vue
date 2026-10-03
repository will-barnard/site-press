<script setup>
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'centered' } });
</script>

<template>
  <div class="cta sp-container" :class="`cta--${variant}`">
    <div>
      <h2>{{ content.heading }}</h2>
      <p v-if="content.body">{{ content.body }}</p>
    </div>
    <SpButtons :buttons="content.buttons" />
  </div>
</template>

<style scoped>
.cta--centered { text-align: center; }
.cta--centered :deep(.sp-buttons) { justify-content: center; }
.cta--split { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-gap); }
@media (max-width: 767px) { .cta--split { flex-direction: column; align-items: flex-start; } }
</style>
