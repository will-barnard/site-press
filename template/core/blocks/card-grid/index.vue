<script setup>
defineProps({ content: { type: Object, required: true }, variant: { type: String, default: 'default' } });
</script>

<template>
  <div class="sp-container">
    <h2 v-if="content.heading">{{ content.heading }}</h2>
    <SpRichText v-if="content.intro" :html="content.intro" />
    <div class="cards" :class="`cards--${variant}`" :style="{ '--cols': content.columns || 3 }">
      <article v-for="(card, i) in content.cards" :key="i" class="card">
        <SpMedia v-if="card.image" class="card__img" :value="card.image" />
        <h3 v-if="card.title">{{ card.title }}</h3>
        <SpRichText v-if="card.body" :html="card.body" />
        <SpLink v-if="card.link && card.link.href" class="card__link" :to="card.link.href">{{ card.link.label || 'Learn more' }}</SpLink>
      </article>
    </div>
  </div>
</template>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: var(--sp-gap); }
.cards--bordered .card { border: 1px solid currentColor; border-radius: var(--sp-radius); padding: 1.25rem; }
.card__img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--sp-radius); }
.card h3 { margin: 0.75rem 0 0.5rem; }
.card__link { font-weight: 600; }
@media (max-width: 767px) { .cards { grid-template-columns: 1fr; } }
</style>
