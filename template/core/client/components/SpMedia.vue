<script setup>
// value = { src, alt, width, height } as stored in block props.
defineProps({ value: { type: Object, default: null }, eager: { type: Boolean, default: false } });
</script>

<template>
  <img
    v-if="value && value.src"
    :src="value.src"
    :alt="value.alt || ''"
    :width="value.width || undefined"
    :height="value.height || undefined"
    :loading="eager ? 'eager' : 'lazy'"
    decoding="async"
  />
</template>
