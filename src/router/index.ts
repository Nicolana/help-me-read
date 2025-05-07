import { createRouter, createWebHistory } from 'vue-router'
import Reader from '../views/Reader.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'reader',
      component: Reader
    }
  ]
})

export default router 