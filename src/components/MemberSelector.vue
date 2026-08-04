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
  <div class="member-selector">
    <button class="toggle-all" @click="toggleAll">
      {{ modelValue.length === members.length ? '取消全选' : '全选' }}
    </button>
    <button
      v-for="m in members" :key="m.id"
      :class="['member-chip', { selected: modelValue.includes(m.id) }]"
      @click="toggle(m.id)"
    >
      {{ m.name }}
    </button>
  </div>
</template>

<style scoped>
.member-selector { display: flex; flex-wrap: wrap; gap: 8px; }
.toggle-all {
  padding: 8px 14px; font-size: 13px; border: 1px dashed var(--rule);
  border-radius: 20px; background: transparent; cursor: pointer; color: var(--ink-soft);
  min-height: 44px;
}
.member-chip {
  padding: 8px 16px; font-size: 14px; border: 1px solid var(--rule);
  border-radius: 20px; background: #fffdf3; cursor: pointer; transition: all 0.15s;
  min-height: 44px; color: var(--ink);
}
.member-chip.selected { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
</style>
