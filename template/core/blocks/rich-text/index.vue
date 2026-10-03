<script setup>
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'default' } });
</script>

<template>
  <div class="sp-container" :class="{ 'rt--narrow': variant === 'narrow' }">
    <SpRichText :html="content.body" />
  </div>
</template>

<style scoped>
.rt--narrow { max-width: 44rem; }
</style>
