import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';
const router = createRouter({ history: createWebHistory(), routes: ['/','/products','/compare','/data'].map(path => ({ path, component: { template: '<span />' } })) });
createApp(App).use(router).mount('#app');
