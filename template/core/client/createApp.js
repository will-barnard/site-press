import { createSSRApp, createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createSiteRouter } from './router.js';
import { useContentStore } from './stores/content.js';
import SpMedia from './components/SpMedia.vue';
import SpRichText from './components/SpRichText.vue';
import SpLink from './components/SpLink.vue';
import SpButtons from './components/SpButtons.vue';
import '../../site/theme.css';
import './styles/base.css';

// `hydrate` picks createSSRApp (attach to server markup) over createApp
// (render from scratch). The admin is never server-rendered, so it mounts.
export function createSiteApp({ ssr = false, hydrate = ssr, initial = null } = {}) {
  const app = hydrate ? createSSRApp(App) : createApp(App);
  const pinia = createPinia();
  const router = createSiteRouter(ssr);
  app.use(pinia);
  app.use(router);
  // Registered globally so generated site blocks can use them without imports;
  // the custom-block generator is told these four exist and nothing else.
  app.component('SpMedia', SpMedia);
  app.component('SpRichText', SpRichText);
  app.component('SpLink', SpLink);
  app.component('SpButtons', SpButtons);
  if (initial) {
    const store = useContentStore(pinia);
    store.site = initial.site;
    if (initial.path && initial.page) store.pages[initial.path] = initial.page;
    if (initial.path && initial.notFound) store.missing[initial.path] = true;
  }
  return { app, router, pinia };
}
