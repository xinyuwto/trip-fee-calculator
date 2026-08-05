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

const avatarColors = ['#2b3a67', '#7a5c3a', '#4a6b3a', '#a87c2c', '#b54b3a']
function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}
</script>

<template>
  <div class="stage" v-if="trip">
    <!-- 票据头 -->
    <div class="receipt-head">
      <div class="rh-top">
        <div>
          <div class="rh-title">结 算 结 果</div>
          <div class="rh-sub">SETTLEMENT · 净额抵消</div>
        </div>
        <div class="rh-stamp moss">已对账</div>
      </div>
      <div class="rh-meta">
        <span>step 3 / 4</span>
        <div class="rh-actions">
          <button class="rh-btn" @click="router.push('/expense')">← 返 回</button>
          <button class="rh-btn primary" @click="router.push('/detail')">结算依据</button>
        </div>
      </div>
    </div>

    <!-- 总览 -->
    <div class="card">
      <div class="card-title">总 览</div>
      <div class="summary-grid">
        <div class="sum-item"><div class="sum-label">总 支 出</div><div class="sum-val vermilion">¥{{ money(totalExpenses()) }}</div></div>
        <div class="sum-item"><div class="sum-label">记 录 条 数</div><div class="sum-val">{{ trip.expenses.length }}</div></div>
      </div>
    </div>

    <div v-if="!result" class="empty">暂无账单，无法结算</div>

    <template v-else>
      <!-- 转账方案 -->
      <div class="sec-title"><span class="bar"></span><h2>转 账 方 案</h2><span class="num">{{ result.transactions.length }} 笔</span><span class="bar"></span></div>

      <div v-if="result.transactions.length === 0" class="flat">已平账，无需互相转账</div>
      <div v-for="t in result.transactions" :key="t.fromId + t.toId" class="tx-item">
        <div class="tx-parties">
          <span class="tx-from">{{ t.fromName }}</span>
          <span class="tx-arr">→</span>
          <span class="tx-to">{{ t.toName }}</span>
        </div>
        <span class="tx-amount">¥{{ money(t.amount) }}</span>
      </div>

      <!-- 每人净收支 -->
      <div class="sec-title"><span class="bar"></span><h2>每 人 净 收 支</h2><span class="num">{{ result.memberBalances.length }} 人</span><span class="bar"></span></div>

      <div v-for="b in result.memberBalances" :key="b.memberId" class="bal-item">
        <div class="bal-avatar" :style="{ background: avatarColor(b.memberName) }">{{ b.memberName[0] }}</div>
        <div class="bal-mid">
          <div class="bal-name">{{ b.memberName }}</div>
          <div class="bal-detail">付 ¥{{ money(b.paid) }} · 应承担 ¥{{ money(b.owed) }}</div>
        </div>
        <div :class="['bal-net', b.balance >= 0 ? 'pos' : 'neg']">
          {{ b.balance >= 0 ? '+' : '−' }}¥{{ money(Math.abs(b.balance)) }}
        </div>
      </div>
    </template>

    <div class="foot-note">
      <strong>算法</strong><br>
      净额 = 总支付 − 总应承担 · 债权人与债务人对冲 · 最少转账笔数
    </div>
  </div>
</template>

<style scoped>
.stage { max-width: 430px; margin: 0 auto; padding: 18px 16px 80px; }

/* receipt head */
.receipt-head {
  position: relative; border: 1px solid var(--rule);
  background: linear-gradient(180deg, #fbf6e8, var(--paper));
  padding: 20px 18px 16px; border-radius: 4px; box-shadow: var(--shadow);
}
.receipt-head::before, .receipt-head::after {
  content: ""; position: absolute; top: 8px; width: 4px; height: calc(100% - 16px);
  background: repeating-linear-gradient(180deg, var(--vermilion) 0 6px, transparent 6px 12px);
  opacity: .55;
}
.receipt-head::before { left: 6px }
.receipt-head::after { right: 6px }
.rh-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed var(--rule); padding-bottom: 12px; gap: 10px; }
.rh-title { font-family: var(--font-title); font-weight: 900; font-size: 22px; letter-spacing: 2px; }
.rh-sub { font-size: 11px; color: var(--ink-soft); letter-spacing: 1px; margin-top: 2px; }
.rh-stamp {
  border: 1.5px solid var(--vermilion); color: var(--vermilion);
  font-family: var(--font-title); font-weight: 700; font-size: 11px;
  padding: 4px 8px; border-radius: 3px; transform: rotate(4deg);
  letter-spacing: 1px; opacity: .85; white-space: nowrap; flex-shrink: 0;
}
.rh-stamp.moss { border-color: var(--moss); color: var(--moss); }
.rh-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.rh-btn {
  font-family: var(--font-body); font-size: 12px; font-weight: 500;
  padding: 5px 10px; border: 1px solid var(--rule); border-radius: 4px;
  background: #fbf6e8; color: var(--ink-soft); cursor: pointer; letter-spacing: .5px;
}
.rh-btn.primary { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
.rh-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); margin-top: 10px; font-family: var(--font-mono); }

/* card */
.card {
  border: 1px solid var(--rule); background: #fbf6e8;
  border-radius: 10px; padding: 16px; box-shadow: var(--shadow); margin-top: 14px;
}
.card-title {
  font-family: var(--font-title); font-weight: 700; font-size: 15px;
  letter-spacing: 2px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
.card-title::before { content: ""; width: 3px; height: 14px; background: var(--vermilion); }

/* summary grid */
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid var(--rule); padding-top: 12px; margin-top: 12px; }
.sum-item { text-align: center; border-right: 1px dashed var(--rule); }
.sum-item:last-child { border-right: none; }
.sum-label { font-size: 10px; color: var(--ink-soft); letter-spacing: 1px; }
.sum-val { font-family: var(--font-mono); font-weight: 700; font-size: 18px; margin-top: 3px; }
.sum-val.vermilion { color: var(--vermilion); }

/* section title */
.sec-title { display: flex; align-items: center; gap: 10px; margin: 22px 4px 12px; }
.sec-title .bar { flex: 1; height: 1px; background: var(--rule); }
.sec-title h2 { font-family: var(--font-title); font-weight: 700; font-size: 15px; letter-spacing: 2px; color: var(--ink); }
.sec-title .num { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); }

/* tx item */
.tx-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 13px 14px; border: 1px solid var(--rule); background: #fbf6e8;
  border-radius: 8px; margin-bottom: 8px; box-shadow: var(--shadow);
}
.tx-parties { display: flex; align-items: center; gap: 10px; font-family: var(--font-title); font-weight: 700; font-size: 15px; }
.tx-from { color: var(--vermilion); }
.tx-to { color: var(--moss); }
.tx-arr { color: var(--ink-faint); font-family: var(--font-mono); }
.tx-amount { font-family: var(--font-mono); font-weight: 700; font-size: 17px; color: var(--indigo); }

/* bal item */
.bal-item {
  display: flex; align-items: center; gap: 12px; padding: 11px 14px;
  border: 1px solid var(--rule); background: #fbf6e8; border-radius: 8px; margin-bottom: 6px;
}
.bal-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; color: #fbf6e8;
  font-family: var(--font-title); font-weight: 900; font-size: 14px;
  display: flex; align-items: center; justify-content: center; background: var(--ink);
}
.bal-mid { flex: 1; min-width: 0; }
.bal-name { font-family: var(--font-title); font-weight: 700; font-size: 14px; }
.bal-detail { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-soft); margin-top: 2px; }
.bal-net { font-family: var(--font-mono); font-weight: 700; font-size: 15px; text-align: right; }
.bal-net.pos { color: var(--moss); }
.bal-net.neg { color: var(--vermilion); }

/* misc */
.flat { color: var(--moss); font-size: 15px; padding: 12px; background: #fbf6e8; border-radius: 8px; border: 1px solid var(--rule); font-family: var(--font-title); }
.empty { text-align: center; color: var(--ink-faint); font-size: 14px; padding: 40px 0; font-family: var(--font-title); }
.foot-note { margin-top: 24px; padding: 14px; border-top: 1px dashed var(--rule); font-size: 10.5px; color: var(--ink-soft); line-height: 1.7; text-align: center; font-family: var(--font-mono); }
.foot-note strong { color: var(--ink); font-family: var(--font-title); font-weight: 700; }
</style>
