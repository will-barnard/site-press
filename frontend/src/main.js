import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './styles.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/Jobs.vue') },
    { path: '/jobs/:id', component: () => import('./views/JobDetail.vue'), props: true },
    { path: '/users', component: () => import('./views/Users.vue') },
  ],
});

createApp(App).use(createPinia()).use(router).mount('#app');
