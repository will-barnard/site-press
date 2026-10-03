import { defineStore } from 'pinia';
import { api } from '../api.js';

export const useSystem = defineStore('system', {
  state: () => ({ status: null }),
  actions: {
    async refresh() { try { this.status = await api.get('/api/system'); } catch { this.status = null; } },
  },
});
