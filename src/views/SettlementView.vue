<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { calculateSettlement } from '../utils/settlement'

const router = useRouter()
const { trip } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

const result = computed(() => {
  if (!trip.value || trip.value.expenses.length === 0) return null
  return calculateSettlement(trip.value.members, trip.value.expenses)
})

function money(cents) {
  return (cents / 100).toFixed(2)
}

function totalExpenses() {
  if (!trip.value) return 0
  return trip.value.expenses.reduce((sum, e) => sum + e.amount, 0)
}
</script>

<template>
  <div class="page settlement-page" v-if="trip">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/expense')">返回</button>
      <h1>结算结果</h1>
    </header>

    <div class="summary-card">
      <div class="summary-row">
        <span>总支出</span>
        <strong>{{ money(totalExpenses()) }} 元</strong>
      </div>
      <div class="summary-row">
        <span>记录条数</span>
        <strong>{{ trip.expenses.length }}</strong>
      </div>
    </div>

    <div v-if="!result" class="empty">暂无账单，无法结算</div>

    <template v-else>
      <section class="section">
        <h2>转账方案</h2>
        <div v-if="result.transactions.length === 0" class="flat">已平账，无需互相转账</div>
        <div v-for="t in result.transactions" :key="t.fromId + t.toId" class="tx-item">
          <div class="tx-parties">
            <span class="from">{{ t.fromName }}</span>
            <span class="arrow">→</span>
            <span class="to">{{ t.toName }}</span>
          </div>
          <span class="tx-amount">{{ money(t.amount) }} 元</span>
        </div>
      </section>

      <section class="section">
        <h2>每人净收支</h2>
        <div v-for="b in result.memberBalances" :key="b.memberId" class="balance-item">
          <span class="balance-name">{{ b.memberName }}</span>
          <div class="balance-detail">
            <span>付 {{ money(b.paid) }}</span>
            <span> · 应承担 {{ money(b.owed) }}</span>
          </div>
          <span :class="['balance-net', b.balance >= 0 ? 'positive' : 'negative']">
            {{ b.balance >= 0 ? '+' : '' }}{{ money(b.balance) }}
          </span>
        </div>
      </section>

      <button class="btn-link" @click="router.push('/detail')">查看计算依据</button>
    </template>
  </div>
</template>

<style scoped>
.settlement-page { padding: 16px; max-width: 500px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 20px; }
.btn-back { padding: 6px 12px; font-size: 14px; border: none; background: transparent; cursor: pointer; }
.summary-card { background: #f0f5ff; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
.summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
.section { margin-bottom: 24px; }
.section h2 { font-size: 16px; margin-bottom: 12px; }
.flat { color: #52c41a; font-size: 15px; }
.empty { color: #999; text-align: center; padding: 40px 0; }
.tx-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px; background: #fff; border-radius: 8px; margin-bottom: 8px;
}
.tx-amount { font-weight: 700; font-size: 18px; color: #1677ff; }
.from { color: #ff4d4f; }
.to { color: #52c41a; }
.arrow { margin: 0 6px; color: #999; }
.balance-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; background: #fff; border-radius: 8px; margin-bottom: 6px;
}
.balance-detail { font-size: 12px; color: #888; }
.balance-net { font-weight: 700; font-size: 16px; }
.positive { color: #52c41a; }
.negative { color: #ff4d4f; }
.btn-link { width: 100%; padding: 12px; font-size: 15px; color: #1677ff; background: transparent; border: 1px dashed #1677ff; border-radius: 8px; cursor: pointer; }
</style>
