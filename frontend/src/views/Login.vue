<script setup>
import { ref } from 'vue';
import { useAuth } from '../stores/auth.js';

const emit = defineEmits(['done']);
const auth = useAuth();
const email = ref('');
const password = ref('');
const token = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  try {
    if (auth.bootstrapNeeded) await auth.bootstrap(email.value, password.value, token.value);
    else await auth.login(email.value, password.value);
    emit('done');
  } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div class="center">
    <form class="card" style="width: 360px" @submit.prevent="submit">
      <h1>{{ auth.bootstrapNeeded ? 'Create the admin account' : 'site-press' }}</h1>
      <p v-if="auth.bootstrapNeeded" class="muted small">No accounts yet — the first one becomes admin.</p>
      <div style="display: grid; gap: 10px">
        <input v-if="auth.bootstrapNeeded && auth.tokenRequired" v-model="token" type="password" placeholder="Setup token" required />
        <input v-model="email" type="email" placeholder="Email" autocomplete="username" required />
        <input v-model="password" type="password" placeholder="Password" minlength="10" :autocomplete="auth.bootstrapNeeded ? 'new-password' : 'current-password'" required />
        <p v-if="error" class="bad">{{ error }}</p>
        <button class="btn" type="submit">{{ auth.bootstrapNeeded ? 'Create account' : 'Sign in' }}</button>
      </div>
    </form>
  </div>
</template>
