import { createSiteApp } from './createApp.js';

const state = window.__SP_STATE__;
const isAdmin = location.pathname.startsWith('/admin');
const { app, router, pinia } = createSiteApp({ hydrate: Boolean(state) && !isAdmin });
if (state && !isAdmin) pinia.state.value = state;
router.isReady().then(() => app.mount('#app'));
