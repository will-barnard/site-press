<script setup>
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'default' } });
</script>

<template>
  <figure class="q sp-container" :class="`q--${variant}`">
    <SpMedia v-if="content.image" class="q__img" :value="content.image" />
    <blockquote>{{ content.quote }}</blockquote>
    <figcaption v-if="content.attribution">— {{ content.attribution }}</figcaption>
  </figure>
</template>

<style scoped>
.q { margin: 0 auto; max-width: 48rem; text-align: center; }
blockquote { margin: 0 0 1rem; font-size: 1.35em; font-family: var(--sp-font-heading); }
.q--large blockquote { font-size: 2em; }
.q__img { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; margin-bottom: 1rem; }
</style>
