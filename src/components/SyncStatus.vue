<script setup>
defineProps({
  status: { type: String, default: 'idle' },
  error: { type: String, default: null },
  pendingCount: { type: Number, default: 0 }
})
const emit = defineEmits(['retry', 'open'])
</script>

<template>
  <span
    v-if="status !== 'idle'"
    :class="['sync-chip', status]"
    @click="status === 'error' ? emit('retry') : emit('open')"
  >
    <template v-if="status === 'syncing'">同步中</template>
    <template v-else-if="status === 'success'">已同步</template>
    <template v-else-if="status === 'error'">同步失败 · 点击重试</template>
    <template v-else-if="status === 'pending'">待确认 {{ pendingCount }} 条</template>
  </span>
</template>

<style scoped>
.sync-chip {
  display: inline-flex; align-items: center;
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .5px;
  padding: 3px 8px; border-radius: 10px; border: 1px solid var(--rule);
  color: var(--ink-soft); background: #fbf6e8; white-space: nowrap;
}
.sync-chip.syncing { color: var(--indigo); border-color: var(--indigo); }
.sync-chip.success { color: var(--moss); border-color: var(--moss); }
.sync-chip.error { color: var(--vermilion); border-color: var(--vermilion); cursor: pointer; }
.sync-chip.pending { color: #fff; background: var(--vermilion); border-color: var(--vermilion); cursor: pointer; }
</style>
