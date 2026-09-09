<script setup>
import { ref, computed } from 'vue'
import { useTripStore } from '../stores/trip'
import { validateSyncCode, generateSyncCode, pullTrip, pushTrip } from '../utils/sync'
import ConfirmDialog from './ConfirmDialog.vue'

defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const { trip, sync, toast, setSyncState, clearSyncState, importData } = useTripStore()

// idle | active | join-summary | conflict
const mode = ref(sync.value.code ? 'active' : 'idle')
const inputCode = ref('')
const myMemberId = ref(sync.value.myMemberId || '')
const joinPulled = ref(null)
const joinCode = ref('')
const conflict = ref(null)
const busy = ref(false)
const confirmOverwrite = ref(false)
const confirmUnlink = ref(false)

const myName = computed(() =>
  trip.value?.members.find(m => m.id === myMemberId.value)?.name || '未知'
)
const codeValid = computed(() => validateSyncCode(inputCode.value))

function showToast(message) {
  toast.value = { message, id: Date.now() }
}

function fmtTime(iso) {
  if (!iso) return '从未'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function handleEnable() {
  if (!myMemberId.value) { showToast('请先选择你的身份'); return }
  if (!trip.value) return
  busy.value = true
  const code = generateSyncCode()
  const result = await pushTrip({ code, baseRevision: 0, payload: trip.value, updatedBy: myName.value })
  busy.value = false
  if (!result.success) { showToast(result.message); return }
  setSyncState({
    code,
    baseRevision: result.revision,
    lastSyncedAt: new Date().toISOString(),
    myMemberId: myMemberId.value
  })
  mode.value = 'active'
  showToast('同步已开启，把同步码分享给同伴吧')
}

async function handleJoinPull() {
  if (!codeValid.value) { showToast('同步码格式不正确（8 位数字或字母）'); return }
  busy.value = true
  const result = await pullTrip(inputCode.value)
  busy.value = false
  if (!result.success) { showToast(result.message); return }
  joinPulled.value = result
  joinCode.value = inputCode.value.trim().toUpperCase()
  mode.value = 'join-summary'
}

function applyOverwrite() {
  // join-summary 与 conflict/active 的拉取共用确认弹窗，按 mode 分发
  if (mode.value === 'join-summary') applyJoin()
  else applyPull()
}

function applyJoin() {
  confirmOverwrite.value = false
  const r = importData(JSON.stringify(joinPulled.value.payload))
  if (!r.success) { showToast(r.error); mode.value = 'idle'; return }
  setSyncState({
    code: joinCode.value,
    baseRevision: joinPulled.value.revision,
    lastSyncedAt: new Date().toISOString(),
    myMemberId: myMemberId.value
  })
  mode.value = 'active'
  showToast('已加入同步')
}

function applyPull() {
  confirmOverwrite.value = false
  const r = importData(JSON.stringify(joinPulled.value.payload))
  if (!r.success) { showToast(r.error); return }
  setSyncState({ baseRevision: joinPulled.value.revision, lastSyncedAt: new Date().toISOString() })
  conflict.value = null
  mode.value = 'active'
  showToast('已拉取最新数据')
}

async function handlePull() {
  busy.value = true
  const result = await pullTrip(sync.value.code)
  busy.value = false
  if (!result.success) { showToast(result.message); return }
  if (result.revision === sync.value.baseRevision) { showToast('本地已是最新版本'); return }
  joinPulled.value = result
  joinCode.value = sync.value.code
  confirmOverwrite.value = true
}

async function handlePush() {
  if (!trip.value) return
  busy.value = true
  const result = await pushTrip({
    code: sync.value.code,
    baseRevision: sync.value.baseRevision,
    payload: trip.value,
    updatedBy: myName.value
  })
  busy.value = false
  if (result.success) {
    setSyncState({ baseRevision: result.revision, lastSyncedAt: new Date().toISOString() })
    showToast('推送成功')
    return
  }
  if (result.code === 'REVISION_CONFLICT') {
    conflict.value = result
    mode.value = 'conflict'
    return
  }
  showToast(result.message)
}

async function handleForcePush() {
  busy.value = true
  const result = await pushTrip({
    code: sync.value.code,
    baseRevision: sync.value.baseRevision,
    payload: trip.value,
    updatedBy: myName.value,
    force: true
  })
  busy.value = false
  if (!result.success) { showToast(result.message); return }
  setSyncState({ baseRevision: result.revision, lastSyncedAt: new Date().toISOString() })
  conflict.value = null
  mode.value = 'active'
  showToast('已用本地数据覆盖远端')
}

async function handlePullRemoteOnConflict() {
  await handlePull()
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(sync.value.code)
    showToast('同步码已复制')
  } catch {
    showToast('复制失败，请手动记录')
  }
}

function doUnlink() {
  confirmUnlink.value = false
  clearSyncState()
  myMemberId.value = ''
  inputCode.value = ''
  mode.value = 'idle'
  showToast('已解除同步')
}
</script>

<template>
  <div v-if="show" class="overlay" @click.self="emit('close')">
    <div class="dialog">
      <h3>旅 行 同 步</h3>

      <!-- 未开启 -->
      <template v-if="mode === 'idle'">
        <p class="hint">开启后生成 8 位同步码，同伴输入即可同步账单数据。</p>
        <label class="field-label">你 的 身 份</label>
        <select v-model="myMemberId" class="select">
          <option value="" disabled>选择成员</option>
          <option v-for="m in trip?.members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <button class="btn vermilion block" :disabled="busy" @click="handleEnable">开 启 同 步</button>
        <div class="divider"><span>或</span></div>
        <label class="field-label">输 码 加 入</label>
        <input
          v-model="inputCode" class="input mono" maxlength="8"
          placeholder="同伴分享的 8 位同步码" autocomplete="off"
        />
        <button class="btn block" :disabled="busy || !codeValid" @click="handleJoinPull">加 入</button>
      </template>

      <!-- 拉取摘要确认 -->
      <template v-else-if="mode === 'join-summary'">
        <div class="summary">
          <div class="row"><span>旅行名称</span><strong>{{ joinPulled.payload.name }}</strong></div>
          <div class="row"><span>成员</span><strong>{{ joinPulled.payload.members.length }} 人</strong></div>
          <div class="row"><span>账单</span><strong>{{ joinPulled.payload.expenses.length }} 笔</strong></div>
          <div class="row"><span>最后更新</span><strong>{{ joinPulled.updatedBy }} · 第 {{ joinPulled.revision }} 版</strong></div>
        </div>
        <label class="field-label">你 的 身 份</label>
        <select v-model="myMemberId" class="select">
          <option value="" disabled>选择成员</option>
          <option v-for="m in joinPulled.payload.members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <div class="form-actions">
          <button class="btn ghost" @click="mode = 'idle'">返 回</button>
          <button class="btn primary" :disabled="!myMemberId" @click="confirmOverwrite = true">覆盖本地并加入</button>
        </div>
      </template>

      <!-- 已开启 -->
      <template v-else-if="mode === 'active'">
        <div class="code-display" @click="copyCode">{{ sync.code }}</div>
        <p class="hint">点击同步码复制，分享给同伴</p>
        <div class="meta-line">我：{{ myName }} · 上次同步 {{ fmtTime(sync.lastSyncedAt) }}</div>
        <div class="form-actions">
          <button class="btn block" :disabled="busy" @click="handlePull">拉 取</button>
          <button class="btn vermilion block" :disabled="busy" @click="handlePush">推 送</button>
        </div>
        <button class="link-danger" @click="confirmUnlink = true">解除同步</button>
      </template>

      <!-- 冲突 -->
      <template v-else-if="mode === 'conflict'">
        <p class="hint">远端已被更新（{{ conflict.remoteUpdatedBy }} · {{ fmtTime(conflict.remoteUpdatedAt) }} · 第 {{ conflict.remoteRevision }} 版），本地基于第 {{ sync.baseRevision }} 版。</p>
        <div class="form-actions">
          <button class="btn block" :disabled="busy" @click="handlePullRemoteOnConflict">拉取远端</button>
          <button class="btn vermilion block" :disabled="busy" @click="handleForcePush">用我的覆盖</button>
        </div>
        <button class="link-back" @click="conflict = null; mode = 'active'">暂不处理</button>
      </template>

      <button class="close" @click="emit('close')">✕</button>

      <ConfirmDialog
        :show="confirmOverwrite"
        title="覆盖确认"
        :message="`远端数据将覆盖本地全部数据（更新人 ${joinPulled?.updatedBy || ''}），确定继续？`"
        @confirm="applyOverwrite"
        @cancel="confirmOverwrite = false"
      />
      <ConfirmDialog
        :show="confirmUnlink"
        title="解除同步"
        message="解除后本设备停止同步，云端数据和其他成员不受影响。确定解除？"
        @confirm="doUnlink"
        @cancel="confirmUnlink = false"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(28,25,23,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.dialog {
  background: #fbf6e8; border: 1px solid var(--rule); border-radius: 10px;
  padding: 22px 20px; width: 320px; max-width: 100%; box-shadow: 0 20px 50px -10px rgba(0,0,0,.4); position: relative;
}
.dialog::before { content: ""; position: absolute; left: 6px; top: 8px; width: 4px; height: calc(100% - 16px); background: repeating-linear-gradient(180deg, var(--vermilion) 0 6px, transparent 6px 12px); opacity: .55; }
.dialog h3 { font-family: var(--font-title); font-weight: 700; font-size: 17px; margin-bottom: 12px; letter-spacing: 1px; }
.hint { color: var(--ink-soft); font-size: 12.5px; margin-bottom: 12px; line-height: 1.6; }
.field-label { display: block; font-size: 11px; color: var(--ink-soft); letter-spacing: 2px; margin-bottom: 6px; font-weight: 500; }
.select, .input {
  width: 100%; padding: 11px 12px; font-size: 15px; font-family: var(--font-body);
  border: none; border-bottom: 1.5px solid var(--rule); background: transparent;
  color: var(--ink); outline: none; border-radius: 0; margin-bottom: 14px;
}
.input.mono { font-family: var(--font-mono); letter-spacing: 2px; text-transform: uppercase; }
.input::placeholder { color: var(--ink-faint); letter-spacing: .5px; text-transform: none; }
.code-display {
  font-family: var(--font-mono); font-weight: 700; font-size: 28px; letter-spacing: 6px;
  text-align: center; padding: 14px 0 6px; color: var(--ink); cursor: pointer; user-select: all;
}
.meta-line { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); text-align: center; margin-bottom: 14px; }
.summary { border: 1px dashed var(--rule); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
.summary .row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
.summary .row span { color: var(--ink-soft); }
.summary .row strong { font-family: var(--font-title); }
.divider { display: flex; align-items: center; gap: 10px; margin: 4px 0 14px; color: var(--ink-faint); font-size: 11px; }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--rule); }
.form-actions { display: flex; gap: 10px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 13px 16px; font-size: 15px; font-weight: 600; border-radius: 8px;
  border: 1px solid var(--rule); background: #fbf6e8; color: var(--ink);
  cursor: pointer; font-family: var(--font-body); letter-spacing: 1px; margin-bottom: 10px;
}
.btn.block { width: 100%; }
.btn.ghost { background: transparent; }
.btn.primary { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
.btn.vermilion { background: var(--vermilion); color: #fff; border-color: var(--vermilion); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.link-danger { display: block; width: 100%; background: none; border: none; color: var(--vermilion); font-size: 12.5px; padding: 8px; cursor: pointer; font-family: var(--font-body); }
.link-back { display: block; width: 100%; background: none; border: none; color: var(--ink-soft); font-size: 12.5px; padding: 8px; cursor: pointer; font-family: var(--font-body); }
.close {
  position: absolute; top: 10px; right: 10px; background: none; border: none;
  color: var(--ink-faint); font-size: 16px; cursor: pointer; padding: 4px;
}
</style>
