<script setup>
import { computed } from 'vue'

const props = defineProps({ expenses: { type: Array, required: true }, members: { type: Array, required: true } })
const emit = defineEmits(['edit', 'delete'])

function memberName(id) {
  return props.members.find(m => m.id === id)?.name || '未知'
}

function money(cents) {
  return (cents / 100).toFixed(2)
}

function fmtTime(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const sorted = computed(() =>
  [...props.expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
)
</script>

<template>
  <div class="expense-list">
    <div class="sec-title"><span class="bar"></span><h2>账 单 明 细</h2><span class="num">{{ expenses.length }} 笔</span><span class="bar"></span></div>
    <div v-if="expenses.length === 0" class="empty">还没有记录，记一笔吧</div>
    <div v-for="e in sorted" :key="e.id" class="bill-item">
      <div class="bill-top">
        <span class="bill-purpose">{{ e.purpose }}</span>
        <span class="bill-amount">¥{{ money(e.amount) }}</span>
      </div>
      <div class="bill-meta">{{ memberName(e.payerId) }} 付 · {{ fmtTime(e.createdAt) }}</div>
      <div class="bill-ben"><span class="lbl">受益</span>{{ e.beneficiaryIds.map(memberName).join('、') }}</div>
      <div v-if="e.note" class="bill-note">{{ e.note }}</div>
      <div class="bill-actions">
        <button class="btn sm" @click="emit('edit', e)">修 改</button>
        <button class="btn sm danger" @click="emit('delete', e)">删 除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expense-list { padding: 0; }
.sec-title { display: flex; align-items: center; gap: 10px; margin: 22px 4px 12px; }
.sec-title .bar { flex: 1; height: 1px; background: var(--rule); }
.sec-title h2 { font-family: var(--font-title); font-weight: 700; font-size: 15px; letter-spacing: 2px; color: var(--ink); }
.sec-title .num { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); }
.empty { text-align: center; color: var(--ink-faint); font-size: 14px; padding: 40px 0; font-family: var(--font-title); }

.bill-item {
  border: 1px solid var(--rule); background: #fbf6e8; border-radius: 8px;
  padding: 12px 14px; margin-bottom: 10px; box-shadow: var(--shadow); position: relative;
}
.bill-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.bill-purpose { font-family: var(--font-title); font-weight: 700; font-size: 15px; }
.bill-amount { font-family: var(--font-mono); font-weight: 700; font-size: 16px; color: var(--vermilion); }
.bill-meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); margin-bottom: 6px; }
.bill-ben { font-size: 12px; color: var(--ink-soft); margin-bottom: 8px; }
.bill-ben .lbl { font-family: var(--font-title); color: var(--ink-faint); margin-right: 4px; }
.bill-note { font-size: 11px; color: var(--ink-faint); margin-bottom: 8px; font-family: var(--font-mono); }
.bill-actions { display: flex; gap: 8px; border-top: 1px dashed var(--rule); padding-top: 8px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 13px 16px; font-size: 15px; font-weight: 600; border-radius: 8px;
  border: 1px solid var(--rule); background: #fbf6e8; color: var(--ink);
  cursor: pointer; font-family: var(--font-body); letter-spacing: 1px;
}
.btn.sm { padding: 6px 12px; font-size: 12px; border-radius: 5px; letter-spacing: .5px; }
.btn.danger { color: var(--vermilion); border-color: rgba(181,75,58,.4); background: rgba(181,75,58,.06); }
</style>
