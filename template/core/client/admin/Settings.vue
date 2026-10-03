<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api.js';
import FieldInput from './FieldInput.vue';

// Site settings use the same field machinery as blocks, so nav and footer get
// list editing, media picking and rich text for free.
const FIELDS = {
  siteTitle: { type: 'text', label: 'Site title' },
  logo: { type: 'media', label: 'Logo' },
  nav: { type: 'list', label: 'Main navigation', fields: { label: { type: 'text', label: 'Label' }, href: { type: 'text', label: 'Address' } } },
  footer: null, // edited as its parts below
  social: { type: 'list', label: 'Social links', fields: { label: { type: 'text', label: 'Label' }, href: { type: 'text', label: 'URL' } } },
  seoDescription: { type: 'textarea', label: 'Default search description' },
};
const FOOTER = {
  text: { type: 'richtext', label: 'Footer text' },
  links: { type: 'list', label: 'Footer links', fields: { label: { type: 'text', label: 'Label' }, href: { type: 'text', label: 'Address' } } },
};
const settings = ref(null);
const error = ref('');
const saved = ref('');

onMounted(async () => {
  try {
    settings.value = await api.get('/api/admin/settings');
    settings.value.footer = settings.value.footer || { text: '', links: [] };
  } catch (e) { error.value = e.message; }
});
async function save() {
  error.value = ''; saved.value = '';
  try { settings.value = await api.put('/api/admin/settings', settings.value); saved.value = 'Saved'; } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div v-if="settings">
    <div class="spa-row" style="margin-bottom: 1rem">
      <h1 class="spa-grow" style="margin: 0">Site settings</h1>
      <span class="spa-ok">{{ saved }}</span>
      <button class="spa-btn" type="button" @click="save">Save</button>
    </div>
    <p v-if="error" class="spa-error">{{ error }}</p>
    <div class="spa-card">
      <template v-for="(field, name) in FIELDS" :key="name">
        <FieldInput v-if="field" v-model="settings[name]" :field="field" :name="name" />
      </template>
    </div>
    <div class="spa-card">
      <h2>Footer</h2>
      <FieldInput v-for="(field, name) in FOOTER" :key="name" v-model="settings.footer[name]" :field="field" :name="name" />
    </div>
  </div>
  <p v-else-if="error" class="spa-error">{{ error }}</p>
</template>
