<script setup>
import { computed } from 'vue';
import { blockFor } from '../blocks.js';

const props = defineProps({ block: { type: Object, required: true } });
const def = computed(() => blockFor(props.block.type));

// Per-section presentation from `_style` becomes CSS variables on the wrapper,
// so blocks style themselves from tokens and never read _style directly.
const style = computed(() => {
  const s = props.block.props?._style || {};
  const out = {};
  if (s.bg) out['--sp-section-bg'] = s.bg;
  if (s.color) out['--sp-section-color'] = s.color;
  if (s.bgImage?.src) out['--sp-section-bg-image'] = `url("${s.bgImage.src}")`;
  if (s.overlay != null) out['--sp-overlay'] = s.overlay;
  if (s.padY != null) out['--sp-section-pad'] = `${s.padY}px`;
  if (s.align) out.textAlign = s.align;
  return out;
});
</script>

<template>
  <section
    class="sp-section"
    :class="[`sp-block--${block.type}`, { 'sp-section--styled': block.props?._style?.bg, 'sp-section--bgimg': block.props?._style?.bgImage }]"
    :style="style"
    :data-sp-block="block.id"
    :data-sp-type="block.type"
  >
    <component :is="def.component" :content="block.props || {}" :variant="block.variant || undefined" v-bind="block.type === 'contact-form' ? { blockId: block.id } : {}" />
  </section>
</template>
