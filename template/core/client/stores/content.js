import { defineStore } from 'pinia';

// Public content: the site settings plus every page visited so far, keyed by
// path. On the server this is filled before render and serialised into the
// HTML; the client hydrates from that and only fetches on navigation.
export const useContentStore = defineStore('content', {
  state: () => ({ site: null, pages: {}, missing: {} }),
  actions: {
    async ensurePage(path) {
      if (this.pages[path] || this.missing[path]) return;
      const res = await fetch(`/api/page?path=${encodeURIComponent(path)}`);
      if (res.status === 404) { this.missing[path] = true; return; }
      if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
      const data = await res.json();
      if (!this.site) this.site = data.site;
      this.pages[path] = data.page;
    },
    async ensureSite() {
      if (this.site) return;
      const res = await fetch('/api/site');
      if (res.ok) this.site = await res.json();
    },
  },
});
