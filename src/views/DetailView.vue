<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'

const router = useRouter()
const { trip } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

function memberName(id) {
  return trip.value.members.find(m => m.id === id)?.name || '未知'
}

function money(cents) {
  return (cents / 100).toFixed(2)
}

function sharePerPerson(exp) {
  return money(exp.amount / exp.beneficiaryIds.length)
}

const sorted = computed(() =>
  [...trip.value.expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
)
</script>

<template>
  <div class="page detail-page" v-if="trip">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/settlement')">返回</button>
      <h1>计算依据</h1>
    </header>

    <div v-for="e in sorted" :key="e.id" class="expense-detail">
      <div class="detail-header">
        <strong>{{ e.purpose }}</strong>
        <span class="detail-amount">{{ money(e.amount) }} 元</span>
      </div>
      <div class="detail-row">
        <span>支付人</span><span>{{ memberName(e.payerId) }}</span>
      </div>
      <div class="detail-row">
        <span>受益人</span><span>{{ e.beneficiaryIds.map(memberName).join('、') }}</span>
      </div>
      <div class="detail-row">
        <span>人均分摊</span><span>{{ sharePerPerson(e) }} 元 ({{ e.beneficiaryIds.length }}人)</span>
      </div>
      <div class="detail-row">
        <span>时间</span><span>{{ new Date(e.createdAt).toLocaleString('zh-CN') }}</span>
      </div>
    </div>

    <div v-if="trip.expenses.length === 0" class="empty">暂无账单</div>
  </div>
</template>

<style scoped>
.detail-page { padding: 16px; max-width: 500px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 20px; }
.btn-back { padding: 6px 12px; font-size: 14px; border: none; background: transparent; cursor: pointer; }
.expense-detail { padding: 14px; background: #fff; border-radius: 8px; margin-bottom: 10px; }
.detail-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
.detail-amount { color: #ff4d4f; font-weight: 700; }
.detail-row { display: flex; justify-content: space-between; font-size: 14px; color: #666; padding: 2px 0; }
.empty { color: #999; text-align: center; padding: 40px 0; }
</style>
