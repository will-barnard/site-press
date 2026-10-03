<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';

const users = ref([]);
const email = ref('');
const password = ref('');
const error = ref('');
async function load() { users.value = await api.get('/api/users'); }
onMounted(() => load().catch((e) => { error.value = e.message; }));
async function add() {
  error.value = '';
  try { await api.post('/api/users', { email: email.value, password: password.value }); email.value = ''; password.value = ''; await load(); } catch (e) { error.value = e.message; }
}
async function remove(u) { if (confirm(`Remove ${u.email}?`)) { await api.del(`/api/users/${u.id}`); await load(); } }
</script>

<template>
  <div>
    <h1>Users</h1>
    <p v-if="error" class="bad">{{ error }}</p>
    <div class="card">
      <table><tbody><tr v-for="u in users" :key="u.id"><td>{{ u.email }}</td><td>{{ u.is_admin ? 'admin' : 'member' }}</td><td><button class="link" type="button" @click="remove(u)">Remove</button></td></tr></tbody></table>
    </div>
    <form class="card row" @submit.prevent="add">
      <input v-model="email" type="email" placeholder="email" required />
      <input v-model="password" type="password" placeholder="password (10+ chars)" minlength="10" required />
      <button class="btn" type="submit">Add user</button>
    </form>
  </div>
</template>
