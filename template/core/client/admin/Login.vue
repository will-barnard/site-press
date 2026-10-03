<script setup>
import { ref } from 'vue';
import { useAdminStore } from './store.js';

const store = useAdminStore();
const email = ref('');
const password = ref('');
const token = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    if (store.bootstrapNeeded) await store.bootstrap(token.value, email.value, password.value);
    else await store.login(email.value, password.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="spa-pad" style="max-width: 420px; margin: 8vh auto;">
    <div class="spa-card">
      <h1>{{ store.bootstrapNeeded ? 'Create the owner account' : 'Sign in' }}</h1>
      <p v-if="store.bootstrapNeeded && !store.bootstrapEnabled" class="spa-error">
        No accounts exist yet and ADMIN_BOOTSTRAP_TOKEN isn't set on the server, so the first account can't be created. Set it and restart.
      </p>
      <form @submit.prevent="submit">
        <label v-if="store.bootstrapNeeded" class="spa-field"><span>Setup token</span><input v-model="token" type="password" autocomplete="off" required /></label>
        <label class="spa-field"><span>Email</span><input v-model="email" type="email" autocomplete="username" required /></label>
        <label class="spa-field"><span>Password</span><input v-model="password" type="password" :autocomplete="store.bootstrapNeeded ? 'new-password' : 'current-password'" minlength="10" required /></label>
        <p v-if="error" class="spa-error">{{ error }}</p>
        <button class="spa-btn" type="submit" :disabled="busy">{{ store.bootstrapNeeded ? 'Create account' : 'Sign in' }}</button>
      </form>
    </div>
  </div>
</template>
