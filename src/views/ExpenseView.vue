<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import ExpenseForm from '../components/ExpenseForm.vue'
import ExpenseList from '../components/ExpenseList.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const router = useRouter()
const { trip, addExpense, updateExpense, removeExpense, resetTrip, exportData, importData } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

const editing = ref(null)
const deleteTarget = ref(null)
const showReset = ref(false)
const showReset2 = ref(false)
const showImport = ref(false)
const importText = ref('')
const importError = ref('')
const importMsg = ref('')

function handleSave(expense) {
  if (expense === null) {
    editing.value = null
    return
  }
  if (editing.value) {
    updateExpense(editing.value.id, expense)
    editing.value = null
  } else {
    addExpense(expense)
  }
}

function handleEdit(expense) {
  editing.value = expense
  window.scrollTo(0, 0)
}

function handleDelete() {
  if (deleteTarget.value) {
    removeExpense(deleteTarget.value.id)
    deleteTarget.value = null
  }
}

function handleReset() {
  showReset.value = false
  resetTrip()
  router.replace('/')
}

function handleExport() {
  const json = exportData()
  navigator.clipboard.writeText(json).then(() => {
    alert('已复制到剪贴板，发送给其他人即可')
  }).catch(() => {
    alert('复制失败，请在详情页下载文件')
  })
}

function handleImport() {
  importError.value = ''
  importMsg.value = ''
  const result = importData(importText.value)
  if (result.success) {
    importMsg.value = '导入成功！'
    showImport.value = false
    importText.value = ''
  } else {
    importError.value = result.error
  }
}
</script>

<template>
  <div class="page expense-page" v-if="trip">
    <header class="page-header">
      <h1>{{ trip.name }}</h1>
      <div class="header-actions">
        <button @click="showImport = true">导入</button>
        <button @click="handleExport">导出</button>
        <button @click="router.push('/settlement')" class="btn-settle">结算</button>
      </div>
    </header>

    <ExpenseForm :members="trip.members" :editing="editing" @save="handleSave" />

    <ExpenseList :expenses="trip.expenses" :members="trip.members" @edit="handleEdit" @delete="(e) => deleteTarget = e" />

    <div class="footer-actions">
      <button class="btn-reset" @click="showReset = true">重新开始</button>
    </div>

    <ConfirmDialog
      :show="!!deleteTarget"
      title="删除确认"
      :message="`确定删除「${deleteTarget?.purpose}」这条记录吗？`"
      @confirm="handleDelete"
      @cancel="deleteTarget = null"
    />

    <ConfirmDialog
      :show="showReset"
      title="确认重置"
      message="将清除所有旅行数据，此操作不可恢复。确定继续？"
      @confirm="showReset = false; showReset2 = true"
      @cancel="showReset = false"
    />

    <ConfirmDialog
      :show="showReset2"
      title="再次确认"
      message="数据清除后无法找回，确定要重置吗？"
      @confirm="handleReset"
      @cancel="showReset2 = false"
    />

    <!-- Import dialog -->
    <div v-if="showImport" class="overlay" @click.self="showImport = false">
      <div class="dialog import-dialog">
        <h3>导入账单</h3>
        <p>粘贴之前导出的 JSON 数据：</p>
        <textarea v-model="importText" rows="6" placeholder="粘贴 JSON 到这里..."></textarea>
        <div v-if="importError" class="error">{{ importError }}</div>
        <div v-if="importMsg" class="success">{{ importMsg }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="showImport = false">取消</button>
          <button class="btn-primary" @click="handleImport">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expense-page { padding: 16px; max-width: 430px; margin: 0 auto; padding-bottom: 80px; }
.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px; border-bottom: 1px dashed var(--rule); padding-bottom: 12px;
}
.page-header h1 { font-family: var(--font-title); font-size: 20px; }
.header-actions { display: flex; gap: 6px; }
.header-actions button {
  padding: 6px 12px; font-size: 13px; border: 1px solid var(--rule);
  border-radius: 6px; background: transparent; cursor: pointer;
  color: var(--ink); font-family: var(--font-body);
}
.header-actions .btn-settle {
  background: var(--ink); color: #fbf6e8; border-color: var(--ink);
  font-weight: 600;
}
.footer-actions { margin-top: 24px; text-align: center; }
.btn-reset {
  padding: 10px 24px; color: var(--ink-faint); border: 1px solid var(--rule);
  border-radius: 8px; background: transparent; cursor: pointer; font-size: 14px;
}
.overlay {
  position: fixed; inset: 0; background: rgba(28,25,23,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog {
  background: var(--paper); border-radius: 12px; padding: 24px;
  width: 340px; max-width: 90vw; border: 1px solid var(--rule);
  box-shadow: var(--shadow);
}
.dialog h3 { font-family: var(--font-title); margin-bottom: 8px; }
.dialog p { color: var(--ink-soft); font-size: 14px; margin-bottom: 12px; }
.dialog textarea {
  width: 100%; padding: 10px; font-size: 14px; border: 1px solid var(--rule);
  border-radius: 8px; resize: vertical; background: transparent; font-family: var(--font-mono);
}
.dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.dialog-actions button { padding: 10px 20px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
.dialog-actions .btn-cancel { background: var(--paper-2); color: var(--ink); }
.dialog-actions .btn-primary { background: var(--ink); color: #fbf6e8; }
.error { color: var(--vermilion); font-size: 13px; margin-top: 6px; }
.success { color: var(--moss); font-size: 13px; margin-top: 6px; }
</style>
