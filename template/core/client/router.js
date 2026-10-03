import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router';
import PublicPage from './pages/PublicPage.vue';

export function createSiteRouter(ssr) {
  return createRouter({
    history: ssr ? createMemoryHistory() : createWebHistory(),
    routes: [
      // The admin is client-only and lazy, so none of it ships in the public
      // bundle a visitor downloads or in the server render.
      { path: '/admin/:rest(.*)*', component: () => import('./admin/AdminRoot.vue') },
      { path: '/:path(.*)*', component: PublicPage },
    ],
    scrollBehavior(to, from, saved) {
      if (saved) return saved;
      if (to.hash) return { el: to.hash };
      return { top: 0 };
    },
  });
}
