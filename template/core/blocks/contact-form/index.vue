<script setup>
import { reactive, ref } from 'vue';
const props = defineProps({
  content: { type: Object, required: true },
  variant: { type: String, default: 'default' },
  blockId: { type: [String, Number], default: null },
});
const values = reactive({});
const hp = ref('');
const state = ref('idle');
const error = ref('');

async function submit() {
  state.value = 'sending';
  error.value = '';
  try {
    const res = await fetch(`/api/forms/${props.blockId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values, _hp: hp.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    state.value = 'sent';
  } catch (e) {
    error.value = e.message;
    state.value = 'idle';
  }
}
</script>

<template>
  <div class="sp-container cf">
    <h2 v-if="content.heading">{{ content.heading }}</h2>
    <SpRichText v-if="content.intro" :html="content.intro" />
    <p v-if="state === 'sent'" class="cf__done" role="status">{{ content.successMessage }}</p>
    <form v-else @submit.prevent="submit">
      <label v-for="f in content.fields" :key="f.name" class="cf__field">
        <span>{{ f.label }}<span v-if="f.required" aria-hidden="true"> *</span></span>
        <textarea v-if="f.type === 'textarea'" v-model="values[f.name]" :name="f.name" :required="f.required" rows="5" />
        <input v-else v-model="values[f.name]" :type="f.type || 'text'" :name="f.name" :required="f.required" />
      </label>
      <!-- Honeypot: hidden from people, irresistible to form bots. -->
      <input v-model="hp" class="cf__hp" type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <p v-if="error" class="cf__error" role="alert">{{ error }}</p>
      <button class="sp-button" type="submit" :disabled="state === 'sending'">{{ content.submitLabel || 'Send' }}</button>
    </form>
  </div>
</template>

<style scoped>
.cf { max-width: 40rem; }
.cf__field { display: grid; gap: 0.35rem; margin-bottom: 1rem; }
.cf__field input, .cf__field textarea { font: inherit; padding: 0.7rem 0.8rem; border: 1px solid currentColor; border-radius: var(--sp-radius); background: transparent; color: inherit; }
.cf__hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.cf__error { color: #b42318; }
</style>
