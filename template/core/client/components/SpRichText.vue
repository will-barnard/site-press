<script setup>
// The HTML here was sanitised server-side on save and on seed import
// (core/server/sanitize.js); it is never rendered from unsanitised input.
defineProps({ html: { type: String, default: '' } });
</script>

<template>
  <div v-if="html" class="sp-richtext" v-html="html" />
</template>
