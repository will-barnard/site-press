import { defineStore } from 'pinia';
import { api } from '../api.js';

export const useAuth = defineStore('auth', {
  state: () => ({ user: null, checked: false, bootstrapNeeded: false, tokenRequired: false }),
  actions: {
    async check() {
      const s = await api.get('/api/auth/state');
      Object.assign(this, { user: s.user, bootstrapNeeded: s.bootstrapNeeded, tokenRequired: s.tokenRequired, checked: true });
    },
    async login(email, password) { this.user = (await api.post('/api/auth/login', { email, password })).user; },
    async bootstrap(email, password, token) { this.user = (await api.post('/api/auth/bootstrap', { email, password, token })).user; this.bootstrapNeeded = false; },
    async logout() { await api.post('/api/auth/logout'); this.user = null; },
  },
});
