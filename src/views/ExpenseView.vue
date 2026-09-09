<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import ExpenseForm from '../components/ExpenseForm.vue'
import ExpenseList from '../components/ExpenseList.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SyncDialog from '../components/SyncDialog.vue'

const router = useRouter()
const { trip, toast, addExpense, updateExpense, removeExpense, resetTrip, exportData, importData } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

const editing = ref(null)
const deleteTarget = ref(null)
const showReset = ref(false)
const showReset2 = ref(false)
const showImport = ref(false)
const showSync = ref(false)
const importText = ref('')
const importError = ref('')
const importMsg = ref('')
const localToast = ref({ message: '', id: 0 })

watch(() => toast.value.id, (id) => {
  if (id > 0) {
    localToast.value = { ...toast.value }
    setTimeout(() => { localToast.value = { message: '', id: 0 } }, 2000)
  }
})

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
  <div class="stage" v-if="trip">
    <Transition name="toast">
      <div v-if="localToast.id > 0" class="toast">{{ localToast.message }}</div>
    </Transition>

    <!-- 票据头 -->
    <div class="receipt-head">
      <div class="rh-top">
        <div>
          <div class="rh-title">{{ trip.name }}</div>
          <div class="rh-sub">EXPENSE · 记账流水</div>
        </div>
        <div class="rh-stamp indigo">记账中</div>
      </div>
      <div class="rh-meta">
        <span>step 2 / 4</span>
        <div class="rh-actions">
          <button class="rh-btn" @click="showSync = true">同 步</button>
          <button class="rh-btn" @click="showImport = true">导 入</button>
          <button class="rh-btn" @click="handleExport">导 出</button>
          <button class="rh-btn primary" @click="router.push('/settlement')">结 算</button>
        </div>
      </div>
    </div>

    <ExpenseForm :members="trip.members" :editing="editing" @save="handleSave" />

    <ExpenseList :expenses="trip.expenses" :members="trip.members" @edit="handleEdit" @delete="(e) => deleteTarget = e" />

    <button class="btn ghost block" @click="showReset = true" style="margin-top:18px;color:var(--ink-soft);">重 新 开 始</button>

    <div class="foot-note">
      <strong>功能</strong><br>
      导入(粘贴JSON) · 导出(复制剪贴板) · 结算跳转 · 修改/删除 · 重新开始(二次确认)
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
      <div class="dialog">
        <h3>导 入 账 单</h3>
        <p>粘贴之前导出的 JSON 数据：</p>
        <textarea v-model="importText" rows="6" placeholder="粘贴 JSON 到这里..."></textarea>
        <div v-if="importError" class="error">{{ importError }}</div>
        <div v-if="importMsg" class="success">{{ importMsg }}</div>
        <div class="dialog-actions">
          <button class="btn sm ghost" @click="showImport = false">取 消</button>
          <button class="btn sm primary" @click="handleImport">导 入</button>
        </div>
      </div>
    </div>

    <SyncDialog :show="showSync" @close="showSync = false" />
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
.rh-stamp.indigo { border-color: var(--indigo); color: var(--indigo); }
.rh-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.rh-btn {
  font-family: var(--font-body); font-size: 12px; font-weight: 500;
  padding: 5px 10px; border: 1px solid var(--rule); border-radius: 4px;
  background: #fbf6e8; color: var(--ink-soft); cursor: pointer; letter-spacing: .5px;
}
.rh-btn.primary { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
.rh-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); margin-top: 10px; font-family: var(--font-mono); }

/* btn */
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

/* foot note */
.foot-note { margin-top: 24px; padding: 14px; border-top: 1px dashed var(--rule); font-size: 10.5px; color: var(--ink-soft); line-height: 1.7; text-align: center; font-family: var(--font-mono); }
.foot-note strong { color: var(--ink); font-family: var(--font-title); font-weight: 700; }

/* overlay & dialog */
.overlay { position: fixed; inset: 0; background: rgba(28,25,23,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.dialog {
  background: #fbf6e8; border: 1px solid var(--rule); border-radius: 10px;
  padding: 22px 20px; width: 320px; max-width: 100%; box-shadow: 0 20px 50px -10px rgba(0,0,0,.4); position: relative;
}
.dialog::before { content: ""; position: absolute; left: 6px; top: 8px; width: 4px; height: calc(100% - 16px); background: repeating-linear-gradient(180deg, var(--vermilion) 0 6px, transparent 6px 12px); opacity: .55; }
.dialog h3 { font-family: var(--font-title); font-weight: 700; font-size: 17px; margin-bottom: 10px; letter-spacing: 1px; }
.dialog p { color: var(--ink-soft); font-size: 13px; margin-bottom: 16px; line-height: 1.6; }
.dialog textarea { width: 100%; padding: 10px; font-size: 13px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); font-family: var(--font-mono); resize: vertical; margin-bottom: 10px; color: var(--ink-soft); }
.dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
.error { color: var(--vermilion); font-size: 13px; margin-top: 6px; }
.success { color: var(--moss); font-size: 13px; margin-top: 6px; }

/* toast */
.toast {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: #fbf6e8; padding: 12px 24px;
  border-radius: 8px; font-size: 15px; font-family: var(--font-title);
  z-index: 2000; box-shadow: 0 4px 16px rgba(28,25,23,0.3);
  pointer-events: none;
}
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
</style>
