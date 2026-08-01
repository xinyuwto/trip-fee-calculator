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
    <h2>账单明细 ({{ expenses.length }})</h2>
    <div v-if="expenses.length === 0" class="empty">还没有记录，记一笔吧</div>
    <div v-for="e in sorted" :key="e.id" class="expense-item">
      <div class="item-main">
        <span class="item-purpose">{{ e.purpose }}</span>
        <span class="item-amount">{{ money(e.amount) }} 元</span>
      </div>
      <div class="item-meta">
        <span>{{ memberName(e.payerId) }} 付 · {{ fmtTime(e.createdAt) }}</span>
        <span class="item-beneficiaries">{{ e.beneficiaryIds.map(memberName).join('、') }}</span>
      </div>
      <div class="item-actions">
        <button @click="emit('edit', e)">修改</button>
        <button class="btn-delete" @click="emit('delete', e)">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expense-list { padding: 16px 0; }
.expense-list h2 { font-size: 18px; margin-bottom: 12px; }
.empty { color: #999; font-size: 15px; text-align: center; padding: 32px 0; }
.expense-item { padding: 12px; background: #fff; border-radius: 8px; margin-bottom: 8px; }
.item-main { display: flex; justify-content: space-between; margin-bottom: 4px; }
.item-purpose { font-weight: 600; }
.item-amount { color: #ff4d4f; font-weight: 600; }
.item-meta { font-size: 13px; color: #888; display: flex; justify-content: space-between; }
.item-actions { margin-top: 8px; display: flex; gap: 8px; }
.item-actions button { padding: 6px 14px; font-size: 13px; border: 1px solid #ddd; border-radius: 6px; background: #f9f9f9; cursor: pointer; }
.item-actions .btn-delete { color: #ff4d4f; border-color: #ffccc7; background: #fff2f0; }
</style>
