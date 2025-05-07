import { createRouter, createWebHistory } from 'vue-router'
import Reader from '../views/Reader.vue'
import Home from '../views/home.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/reader',
      name: 'reader',
      component: Reader
    }
  ]
})

export default router 