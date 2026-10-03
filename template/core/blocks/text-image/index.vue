<script setup>
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'image-left' } });
</script>

<template>
  <div class="ti sp-container" :class="`ti--${variant}`">
    <SpMedia class="ti__image" :value="content.image" />
    <div class="ti__text">
      <h2 v-if="content.heading">{{ content.heading }}</h2>
      <SpRichText :html="content.body" />
      <SpButtons v-if="content.button && content.button.href" :buttons="[{ link: content.button }]" />
    </div>
  </div>
</template>

<style scoped>
.ti { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-gap); align-items: center; }
.ti--image-right .ti__image { order: 2; }
.ti__image { width: 100%; height: auto; border-radius: var(--sp-radius); }
@media (max-width: 767px) { .ti { grid-template-columns: 1fr; } .ti--image-right .ti__image { order: 0; } }
</style>
