import { createRouter, createWebHashHistory } from 'vue-router'
import InitView from '../views/InitView.vue'
import ExpenseView from '../views/ExpenseView.vue'

const routes = [
  { path: '/', name: 'init', component: InitView },
  { path: '/expense', name: 'expense', component: ExpenseView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
