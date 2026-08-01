import { createRouter, createWebHashHistory } from 'vue-router'
import InitView from '../views/InitView.vue'
import ExpenseView from '../views/ExpenseView.vue'
import SettlementView from '../views/SettlementView.vue'
import DetailView from '../views/DetailView.vue'

const routes = [
  { path: '/', name: 'init', component: InitView },
  { path: '/expense', name: 'expense', component: ExpenseView },
  { path: '/settlement', name: 'settlement', component: SettlementView },
  { path: '/detail', name: 'detail', component: DetailView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
