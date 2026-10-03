import { defineStore } from 'pinia';
import { api } from './api.js';

export const useAdminStore = defineStore('admin', {
  state: () => ({ user: null, checked: false, bootstrapNeeded: false, bootstrapEnabled: false, media: [], mediaLoaded: false }),
  actions: {
    async check() {
      const state = await api.get('/api/auth/state');
      this.user = state.user;
      this.bootstrapNeeded = state.bootstrapNeeded;
      this.bootstrapEnabled = state.bootstrapEnabled;
      this.checked = true;
    },
    async login(email, password) {
      const { user } = await api.post('/api/auth/login', { email, password });
      this.user = user;
    },
    async bootstrap(token, email, password) {
      const { user } = await api.post('/api/auth/bootstrap', { token, email, password });
      this.user = user;
      this.bootstrapNeeded = false;
    },
    async logout() {
      await api.post('/api/auth/logout');
      this.user = null;
    },
    async loadMedia(force = false) {
      if (this.mediaLoaded && !force) return;
      this.media = await api.get('/api/admin/media');
      this.mediaLoaded = true;
    },
    async upload(file) {
      const fd = new FormData();
      fd.append('file', file);
      const item = await api.post('/api/admin/media', fd);
      this.media.unshift(item);
      return item;
    },
  },
});
