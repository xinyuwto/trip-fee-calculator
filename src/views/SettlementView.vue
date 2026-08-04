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
      <button class="btn-back" @click="router.push('/detail')">结算依据</button>
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

    </template>
  </div>
</template>

<style scoped>
.settlement-page { padding: 18px 16px; max-width: 430px; margin: 0 auto; }
.page-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  border-bottom: 1px dashed var(--rule); padding-bottom: 12px;
}
.page-header h1 { font-family: var(--font-title); font-size: 20px; flex: 1; }
.btn-back {
  padding: 6px 12px; font-size: 14px; border: 1px solid var(--rule);
  background: #fffdf3; cursor: pointer; border-radius: 6px;
  font-family: var(--font-body); color: var(--ink);
}
.summary-card {
  background: linear-gradient(180deg, #fbf6e8, var(--paper));
  border: 1px solid var(--rule); border-radius: 10px;
  padding: 16px; margin-bottom: 20px; box-shadow: var(--shadow);
}
.summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
.summary-row strong { font-family: var(--font-mono); }
.section { margin-bottom: 24px; }
.section h2 { font-family: var(--font-title); font-size: 15px; margin-bottom: 12px; letter-spacing: 2px; }
.flat { color: var(--moss); font-size: 15px; padding: 12px; background: #fffdf3; border-radius: 8px; border: 1px solid var(--rule); }
.empty { color: var(--ink-faint); text-align: center; padding: 40px 0; }
.tx-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; background: #fffdf3; border: 1px solid var(--rule);
  border-radius: 8px; margin-bottom: 8px;
}
.tx-amount { font-family: var(--font-mono); font-weight: 700; font-size: 18px; color: var(--indigo); }
.tx-parties { display: flex; align-items: center; gap: 6px; }
.from { font-family: var(--font-title); color: var(--vermilion); font-weight: 700; }
.to { font-family: var(--font-title); color: var(--moss); font-weight: 700; }
.arrow { margin: 0 4px; color: var(--ink-faint); }
.balance-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; background: #fffdf3; border: 1px solid var(--rule);
  border-radius: 8px; margin-bottom: 6px;
}
.balance-name { font-family: var(--font-title); font-weight: 700; font-size: 15px; }
.balance-detail { font-size: 11px; color: var(--ink-soft); font-family: var(--font-mono); }
.balance-net { font-family: var(--font-mono); font-weight: 700; font-size: 16px; }
.positive { color: var(--moss); }
.negative { color: var(--vermilion); }
</style>
