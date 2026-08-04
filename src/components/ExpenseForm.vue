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
  emit('save', null) // signal cancel edit
}
</script>

<template>
  <div class="expense-form">
    <h2>{{ isEditing ? '修改记录' : '记一笔' }}</h2>

    <select v-model="purpose">
      <option value="" disabled>选择用途</option>
      <option v-for="opt in PURPOSE_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
    </select>

    <div class="row">
      <input v-model="amount" type="number" placeholder="金额（元）" step="0.01" min="0" />
      <select v-model="payerId">
        <option value="" disabled>谁付的？</option>
        <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </div>

    <input v-model="createdAt" type="datetime-local" />

    <input v-model="note" type="text" placeholder="备注（选填）" maxlength="100" />

    <label class="field-label">受益人</label>
    <MemberSelector v-if="members.length" :members="members" v-model="beneficiaryIds" />

    <div v-if="error" class="error">{{ error }}</div>

    <div class="form-actions">
      <button v-if="isEditing" type="button" class="btn-cancel" @click="handleCancel">取消编辑</button>
      <button type="button" class="btn-primary" @click="handleSubmit">{{ isEditing ? '保存修改' : '添加' }}</button>
    </div>
  </div>
</template>

<style scoped>
.expense-form {
  padding: 16px; background: #fffdf3; border-radius: 12px;
  margin-bottom: 16px; border: 1px solid var(--rule); box-shadow: var(--shadow);
}
.expense-form h2 { font-family: var(--font-title); font-size: 18px; margin-bottom: 12px; }
.expense-form input, .expense-form select {
  width: 100%; padding: 10px 12px; font-size: 16px;
  border: 1px solid var(--rule); border-radius: 8px; margin-bottom: 10px;
  background: var(--paper); color: var(--ink);
}
.expense-form input:focus, .expense-form select:focus { outline: none; border-color: var(--indigo); }
.row { display: flex; gap: 10px; }
.field-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: var(--ink-soft); }
.error { color: var(--vermilion); font-size: 14px; margin-top: 8px; }
.form-actions { display: flex; gap: 10px; margin-top: 12px; }
.form-actions .btn-cancel {
  flex: 1; padding: 12px; border: 1px solid var(--rule); border-radius: 8px;
  background: var(--paper-2); font-size: 16px; cursor: pointer; color: var(--ink);
}
.form-actions .btn-primary {
  flex: 1; padding: 12px; border: none; border-radius: 8px;
  background: var(--ink); color: #fbf6e8; font-size: 16px; cursor: pointer;
  font-family: var(--font-title);
}
</style>
