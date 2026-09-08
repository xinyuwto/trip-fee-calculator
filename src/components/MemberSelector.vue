<script setup>
const props = defineProps({
  members: { type: Array, required: true },
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

function toggle(id) {
  const set = new Set(props.modelValue)
  if (set.has(id)) {
    set.delete(id)
  } else {
    set.add(id)
  }
  emit('update:modelValue', [...set])
}

function toggleAll() {
  if (props.members.every(m => props.modelValue.includes(m.id))) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', props.members.map(m => m.id))
  }
}
</script>

<template>
  <div class="chip-group">
    <span :class="['chip', { on: modelValue.length === members.length }]" @click="toggleAll">全选</span>
    <span
      v-for="m in members" :key="m.id"
      :class="['chip', { on: modelValue.includes(m.id) }]"
      @click="toggle(m.id)"
    >
      {{ m.name }}
    </span>
  </div>
</template>

<style scoped>
.chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  padding: 7px 14px; border: 1px solid var(--rule); border-radius: 20px;
  font-size: 13px; background: #fbf6e8; color: var(--ink-soft); cursor: pointer;
  font-family: var(--font-body); user-select: none; min-height: 44px;
  display: flex; align-items: center;
}
.chip.on { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
</style>
