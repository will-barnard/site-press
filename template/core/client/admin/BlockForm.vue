<script setup>
import { computed, ref } from 'vue';
import { blocks } from '../blocks.js';
import { STYLE_FIELDS } from '../../shared/schema.js';
import FieldInput from './FieldInput.vue';

const props = defineProps({ block: { type: Object, required: true } });
const def = computed(() => blocks[props.block.type]);
const showStyle = ref(false);
if (!props.block.props) props.block.props = {};
if (!props.block.props._style) props.block.props._style = {};
</script>

<template>
  <div v-if="def">
    <label v-if="(def.schema.variants || []).length > 1" class="spa-field" style="max-width: 260px">
      <span>Layout</span>
      <select v-model="block.variant"><option v-for="v in def.schema.variants" :key="v" :value="v">{{ v }}</option></select>
    </label>
    <FieldInput v-for="(field, name) in def.schema.fields" :key="name" v-model="block.props[name]" :field="field" :name="name" />
    <p><a href="#" @click.prevent="showStyle = !showStyle">{{ showStyle ? 'Hide' : 'Show' }} section style</a></p>
    <div v-if="showStyle" class="spa-row" style="align-items: flex-start">
      <FieldInput v-for="(field, name) in STYLE_FIELDS" :key="name" v-model="block.props._style[name]" :field="field" :name="name" style="min-width: 200px" />
    </div>
  </div>
  <p v-else class="spa-error">Unknown block type "{{ block.type }}" — its component is missing from this site.</p>
</template>
