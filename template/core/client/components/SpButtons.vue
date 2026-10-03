<script setup>
import SpLink from './SpLink.vue';
defineProps({ buttons: { type: Array, default: () => [] } });
</script>

<template>
  <div v-if="buttons && buttons.some((b) => b.link && b.link.href)" class="sp-buttons">
    <template v-for="(b, i) in buttons" :key="i">
      <SpLink v-if="b.link && b.link.href" :to="b.link.href" class="sp-button" :class="{ 'sp-button--secondary': i > 0 }">{{ b.link.label || 'Learn more' }}</SpLink>
    </template>
  </div>
</template>
