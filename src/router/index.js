import { createRouter, createWebHashHistory } from 'vue-router'
import InitView from '../views/InitView.vue'

const routes = [
  { path: '/', name: 'init', component: InitView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
