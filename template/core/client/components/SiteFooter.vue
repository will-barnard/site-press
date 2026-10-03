<script setup>
import SpLink from './SpLink.vue';
import SpRichText from './SpRichText.vue';
defineProps({ site: { type: Object, default: null } });
</script>

<template>
  <footer v-if="site" class="sp-footer">
    <div class="sp-container sp-footer__inner">
      <SpRichText v-if="site.footer && site.footer.text" :html="site.footer.text" />
      <nav v-if="site.footer && site.footer.links && site.footer.links.length" class="sp-footer__links" aria-label="Footer">
        <SpLink v-for="l in site.footer.links" :key="l.href" :to="l.href">{{ l.label }}</SpLink>
      </nav>
      <nav v-if="site.social && site.social.length" class="sp-footer__social" aria-label="Social">
        <a v-for="s in site.social" :key="s.href" :href="s.href" target="_blank" rel="noopener">{{ s.label }}</a>
      </nav>
    </div>
  </footer>
</template>
