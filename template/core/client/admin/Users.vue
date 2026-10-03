<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api.js';
import { useAdminStore } from './store.js';

const store = useAdminStore();
const users = ref([]);
const email = ref('');
const password = ref('');
const role = ref('editor');
const error = ref('');

async function load() { users.value = await api.get('/api/admin/users'); }
onMounted(() => load().catch((e) => { error.value = e.message; }));
async function add() {
  error.value = '';
  try { await api.post('/api/admin/users', { email: email.value, password: password.value, role: role.value }); email.value = ''; password.value = ''; await load(); } catch (e) { error.value = e.message; }
}
async function remove(u) {
  if (!confirm(`Remove ${u.email}?`)) return;
  try { await api.del(`/api/admin/users/${u.id}`); await load(); } catch (e) { error.value = e.message; }
}
</script>

<template>
  <div>
    <h1>Users</h1>
    <p v-if="error" class="spa-error">{{ error }}</p>
    <div class="spa-card">
      <table>
        <thead><tr><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.email }}</td><td>{{ u.role }}</td>
            <td><button v-if="store.user.role === 'owner' && u.id !== store.user.id" class="spa-btn spa-btn--ghost spa-btn--sm" type="button" @click="remove(u)">Remove</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="store.user.role === 'owner'" class="spa-card">
      <h2>Add a user</h2>
      <p class="spa-muted">Share the password with them directly; there's no email invite yet.</p>
      <form class="spa-row" @submit.prevent="add">
        <input v-model="email" type="email" placeholder="email" required style="max-width: 240px" />
        <input v-model="password" type="password" placeholder="temporary password (10+ chars)" minlength="10" required style="max-width: 240px" />
        <select v-model="role" style="max-width: 120px"><option value="editor">editor</option><option value="owner">owner</option></select>
        <button class="spa-btn" type="submit">Add</button>
      </form>
    </div>
  </div>
</template>
