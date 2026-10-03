<script setup>
import { onMounted, ref } from 'vue';
import { api } from './api.js';

const rows = ref([]);
const error = ref('');
onMounted(async () => { try { rows.value = await api.get('/api/admin/submissions'); } catch (e) { error.value = e.message; } });
</script>

<template>
  <div>
    <h1>Form submissions</h1>
    <p class="spa-muted">Email notifications aren't set up yet — check here for new messages.</p>
    <p v-if="error" class="spa-error">{{ error }}</p>
    <div class="spa-card">
      <p v-if="!rows.length" class="spa-muted">Nothing yet.</p>
      <table v-else>
        <thead><tr><th>Received</th><th>Page</th><th>Message</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="spa-muted" style="white-space: nowrap">{{ new Date(r.created_at).toLocaleString() }}</td>
            <td><code>{{ r.page_path }}</code></td>
            <td><div v-for="(v, k) in r.payload" :key="k"><strong>{{ k }}:</strong> <span style="white-space: pre-wrap">{{ v }}</span></div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
