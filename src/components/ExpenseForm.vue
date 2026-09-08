<script setup>
import { ref, computed, watch } from 'vue'
import MemberSelector from './MemberSelector.vue'

const PURPOSE_OPTIONS = ['正餐', '甜点', '纪念品', '酒店', '机票', '火车', '租车', '交通', '其他']

const props = defineProps({ members: { type: Array, required: true }, editing: { type: Object, default: null } })
const emit = defineEmits(['save'])

const purpose = ref('')
const amount = ref('')
const payerId = ref('')
const beneficiaryIds = ref([])
const createdAt = ref('')
const note = ref('')
const error = ref('')

watch(() => props.editing, (val) => {
  purpose.value = val?.purpose || ''
  amount.value = val ? (val.amount / 100).toString() : ''
  payerId.value = val?.payerId || ''
  beneficiaryIds.value = val?.beneficiaryIds || []
  createdAt.value = val?.createdAt?.slice(0, 16) || toDatetimeLocal(new Date())
  note.value = val?.note || ''
  error.value = ''
}, { immediate: true })

function toDatetimeLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const isEditing = computed(() => !!props.editing)

function handleSubmit() {
  error.value = ''
  if (!purpose.value) { error.value = '请选择用途'; return }
  const amountCents = Math.round(parseFloat(amount.value) * 100)
  if (!amountCents || amountCents <= 0) { error.value = '请输入有效金额'; return }
  if (!payerId.value) { error.value = '请选择支付人'; return }
  if (beneficiaryIds.value.length === 0) { error.value = '请选择至少一个受益人'; return }

  emit('save', {
    purpose: purpose.value,
    amount: amountCents,
    payerId: payerId.value,
    beneficiaryIds: beneficiaryIds.value,
    note: note.value.trim(),
    createdAt: new Date(createdAt.value).toISOString()
  })

  if (!isEditing.value) {
    purpose.value = ''
    amount.value = ''
    payerId.value = ''
    beneficiaryIds.value = []
    note.value = ''
    createdAt.value = toDatetimeLocal(new Date())
  }
}

function handleCancel() {
  emit('save', null)
}
</script>

<template>
  <div class="card">
    <div class="card-title">{{ isEditing ? '修 改 记 录' : '记 一 笔' }}</div>

    <div class="field">
      <label class="field-label">用 途</label>
      <select v-model="purpose" class="select">
        <option value="" disabled>选择用途</option>
        <option v-for="opt in PURPOSE_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <div class="field-row">
      <div class="field" style="flex:1">
        <label class="field-label">金 额 (元)</label>
        <input v-model="amount" type="number" class="input mono" placeholder="0.00" step="0.01" min="0" />
      </div>
      <div class="field" style="flex:1">
        <label class="field-label">支 付 人</label>
        <select v-model="payerId" class="select">
          <option value="" disabled>谁付的？</option>
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </div>
    </div>

    <div class="field">
      <label class="field-label">时 间</label>
      <input v-model="createdAt" type="datetime-local" class="input mono" />
    </div>

    <div class="field">
      <label class="field-label">备 注</label>
      <input v-model="note" type="text" class="input" placeholder="选填" maxlength="100" />
    </div>

    <div class="field">
      <label class="field-label">受 益 人</label>
      <MemberSelector v-if="members.length" :members="members" v-model="beneficiaryIds" />
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="form-actions">
      <button v-if="isEditing" type="button" class="btn sm ghost" @click="handleCancel">取 消 编 辑</button>
      <button type="button" :class="['btn primary block', { sm: isEditing }]" @click="handleSubmit">{{ isEditing ? '保 存 修 改' : '添 加' }}</button>
    </div>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid var(--rule); background: #fbf6e8;
  border-radius: 10px; padding: 16px; box-shadow: var(--shadow); margin-bottom: 16px;
}
.card-title {
  font-family: var(--font-title); font-weight: 700; font-size: 15px;
  letter-spacing: 2px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
.card-title::before { content: ""; width: 3px; height: 14px; background: var(--vermilion); }

.field { margin-bottom: 14px; }
.field-label { display: block; font-size: 11px; color: var(--ink-soft); letter-spacing: 2px; margin-bottom: 6px; font-weight: 500; }
.field-row { display: flex; gap: 10px; }
.input, .select {
  width: 100%; padding: 11px 12px; font-size: 15px; font-family: var(--font-body);
  border: none; border-bottom: 1.5px solid var(--rule); background: transparent;
  color: var(--ink); outline: none; border-radius: 0;
}
.input:focus, .select:focus { border-bottom-color: var(--indigo); }
.input::placeholder { color: var(--ink-faint); }
.input.mono { font-family: var(--font-mono); letter-spacing: .5px; }
.select { appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2357534e' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>"); background-repeat: no-repeat; background-position: right 4px center; padding-right: 24px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 13px 16px; font-size: 15px; font-weight: 600; border-radius: 8px;
  border: 1px solid var(--rule); background: #fbf6e8; color: var(--ink);
  cursor: pointer; font-family: var(--font-body); letter-spacing: 1px;
}
.btn.sm { padding: 6px 12px; font-size: 12px; border-radius: 5px; letter-spacing: .5px; }
.btn.ghost { background: transparent; }
.btn.primary { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
.btn.block { width: 100%; }
.form-actions { display: flex; gap: 10px; margin-top: 12px; }
.error { color: var(--vermilion); font-size: 14px; margin-top: 8px; }
</style>
