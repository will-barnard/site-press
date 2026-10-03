<script setup>
import { computed } from 'vue';
const props = defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'default' } });

// Only hosts on this list render as a live iframe. An editor pasting an
// arbitrary URL should not be able to frame anything on the client's domain.
const ALLOWED = [
  'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com',
  'www.google.com', 'maps.google.com', 'open.spotify.com', 'w.soundcloud.com', 'bandcamp.com',
  'calendar.google.com', 'docs.google.com',
];
const safeSrc = computed(() => {
  try {
    const u = new URL(props.content.src);
    return u.protocol === 'https:' && ALLOWED.includes(u.hostname) ? u.toString() : null;
  } catch { return null; }
});
const ratio = computed(() => (props.content.aspect || '16:9').replace(':', ' / '));
</script>

<template>
  <div class="sp-container">
    <h2 v-if="content.heading">{{ content.heading }}</h2>
    <div v-if="safeSrc" class="embed" :style="{ aspectRatio: ratio }">
      <iframe :src="safeSrc" :title="content.title || content.heading || 'Embedded content'" loading="lazy" allowfullscreen />
    </div>
    <p v-else class="embed__blocked">This embed's address isn't on the allowed list.</p>
  </div>
</template>

<style scoped>
.embed { position: relative; width: 100%; }
.embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.embed__blocked { opacity: 0.6; font-style: italic; }
</style>
