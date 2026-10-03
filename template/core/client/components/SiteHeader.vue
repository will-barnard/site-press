<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import SpLink from './SpLink.vue';
import SpMedia from './SpMedia.vue';

defineProps({ site: { type: Object, default: null } });
const open = ref(false);
const route = useRoute();
watch(() => route.path, () => { open.value = false; });
</script>

<template>
  <header class="sp-header" :class="{ 'sp-header--open': open }">
    <div class="sp-container sp-header__inner">
      <SpLink to="/" class="sp-header__brand">
        <SpMedia v-if="site && site.logo" :value="site.logo" eager class="sp-header__logo" />
        <span v-else>{{ site && site.siteTitle }}</span>
      </SpLink>
      <button class="sp-header__toggle" type="button" :aria-expanded="open" aria-controls="sp-nav" @click="open = !open">
        <span class="sp-visually-hidden">Menu</span><span aria-hidden="true">☰</span>
      </button>
      <nav id="sp-nav" class="sp-header__nav" aria-label="Main">
        <SpLink v-for="item in (site && site.nav) || []" :key="item.href" :to="item.href">{{ item.label }}</SpLink>
      </nav>
    </div>
  </header>
</template>
