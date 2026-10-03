<script setup>
import { computed } from 'vue';
const props = defineProps({ to: { type: String, default: '' } });
const internal = computed(() => props.to.startsWith('/') && !props.to.startsWith('//') && !props.to.startsWith('/media/'));
</script>

<template>
  <RouterLink v-if="internal" :to="to"><slot /></RouterLink>
  <a v-else :href="to" :target="to.startsWith('http') ? '_blank' : undefined" :rel="to.startsWith('http') ? 'noopener' : undefined"><slot /></a>
</template>
