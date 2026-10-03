<script setup>
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'default' } });
</script>

<template>
  <div class="sp-container ph">
    <h2 v-if="content.heading">{{ content.heading }}</h2>
    <SpRichText v-if="content.body" :html="content.body" />
    <div v-if="content.images && content.images.length" class="ph__images">
      <SpMedia v-for="(item, i) in content.images" :key="i" :value="item.image" />
    </div>
    <SpButtons :buttons="content.buttons" />
  </div>
</template>

<style scoped>
.ph__images { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: calc(var(--sp-gap) / 2); margin-top: 1rem; }
.ph__images :deep(img) { width: 100%; height: auto; }
</style>
