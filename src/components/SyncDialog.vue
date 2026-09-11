<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { useSyncEngine } from '../composables/useSyncEngine'
import { validateSyncCode, generateSyncCode, pullTrip, mergeSync } from '../utils/sync'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  joinOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'joined'])
const router = useRouter()

const { trip, sync, toast, setSyncState, clearSyncState, importData } = useTripStore()
const engine = useSyncEngine()

// joinOnly 模式直接进入输码；普通模式按 sync 状态决定
const mode = ref(props.joinOnly ? 'idle' : (sync.value.code ? 'active' : 'idle'))
const inputCode = ref('')
const myMemberId = ref(sync.value.myMemberId || '')
const joinPulled = ref(null)
const joinCode = ref('')
const busy = ref(false)
const confirmOverwrite = ref(false)
const confirmUnlink = ref(false)
const dupIndex = ref(0)
const dupDecisions = ref([])

const myName = computed(() =>
  trip.value?.members.find((m) => m.id === (sync.value.myMemberId || myMemberId.value))?.name || '未知'
)
const codeValid = computed(() => validateSyncCode(inputCode.value))
const currentDup = computed(() => engine.pendingDuplicates.value[dupIndex.value] || null)

// 自动同步发现重复项时（ExpenseView 自动打开本弹窗），切换到去重确认视图
watch(
  () => [engine.pendingDuplicates.value.length, props.show],
  ([n, show]) => {
    if (n > 0 && show) {
      dupIndex.value = 0
      dupDecisions.value = []
      mode.value = 'duplicates'
    }
  }
)

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
  const result = await mergeSync({ code, payload: trip.value, myMemberId: myMemberId.value })
  busy.value = false
  if (!result.success || result.status !== 'merged') { showToast('同步开启失败，请重试'); return }
  setSyncState({ code, lastSyncedAt: new Date().toISOString(), myMemberId: myMemberId.value })
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
  if (mode.value === 'join-summary') applyJoin()
}

function applyJoin() {
  confirmOverwrite.value = false
  const r = importData(JSON.stringify(joinPulled.value.payload))
  if (!r.success) { showToast(r.error); mode.value = 'idle'; return }
  setSyncState({
    code: joinCode.value,
    lastSyncedAt: new Date().toISOString(),
    myMemberId: myMemberId.value
  })
  mode.value = 'active'
  showToast('已加入同步')
  if (props.joinOnly) emit('joined')
}

async function handleSync() {
  busy.value = true
  await engine.triggerSync()
  busy.value = false
  if (engine.status.value === 'pending') {
    dupIndex.value = 0
    dupDecisions.value = []
    mode.value = 'duplicates'
  } else if (engine.status.value === 'success') {
    showToast('同步成功')
  } else if (engine.status.value === 'error') {
    showToast(engine.errorMessage.value || '同步失败')
  }
}

function decideDup(action) {
  const dup = currentDup.value
  if (!dup) return
  dupDecisions.value.push({ localId: dup.local.id, remoteId: dup.remote.id, action })
  if (dupIndex.value < engine.pendingDuplicates.value.length - 1) {
    dupIndex.value++
    return
  }
  engine.resolveDuplicates(dupDecisions.value).then(() => {
    dupDecisions.value = []
    mode.value = engine.status.value === 'pending' ? 'duplicates' : 'active'
    dupIndex.value = 0
    if (engine.status.value === 'success') showToast('去重完成，同步成功')
  })
}

function dismissDups() {
  engine.dismissDuplicates()
  dupIndex.value = 0
  dupDecisions.value = []
  mode.value = 'active'
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

      <!-- 未开启（joinOnly 模式只显示输码加入） -->
      <template v-if="mode === 'idle'">
        <template v-if="!joinOnly">
          <p class="hint">开启后生成 8 位同步码，同伴输入即可同步账单数据。</p>
          <label class="field-label">你 的 身 份</label>
          <select v-model="myMemberId" class="select">
            <option value="" disabled>选择成员</option>
            <option v-for="m in trip?.members" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <button class="btn vermilion block" :disabled="busy" @click="handleEnable">开 启 同 步</button>
          <div class="divider"><span>或</span></div>
        </template>
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
        <button class="btn vermilion block" :disabled="busy" @click="handleSync">同 步</button>
        <button class="link-danger" @click="confirmUnlink = true">解除同步</button>
      </template>

      <!-- 重复确认（逐条） -->
      <template v-else-if="mode === 'duplicates' && currentDup">
        <p class="hint">发现疑似重复记录（{{ dupIndex + 1 }} / {{ engine.pendingDuplicates.length }} 条）：</p>
        <div class="dup-card">
          <div class="dup-title">本 地</div>
          <div class="dup-line">{{ currentDup.local.purpose }} · ¥{{ (currentDup.local.amount / 100).toFixed(2) }}</div>
          <div class="dup-title" style="margin-top:8px">远 端</div>
          <div class="dup-line">{{ currentDup.remote.purpose }} · ¥{{ (currentDup.remote.amount / 100).toFixed(2) }}</div>
        </div>
        <p class="hint">两笔记录的支付人、受益人、金额、项目完全相同。是重复记录吗？</p>
        <div class="form-actions">
          <button class="btn block" @click="decideDup('keep')">保留两条</button>
          <button class="btn vermilion block" @click="decideDup('duplicate')">是重复，去重</button>
        </div>
        <button class="link-back" @click="dismissDups">稍后处理</button>
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
.dup-card { border: 1px dashed var(--rule); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.dup-title { font-size: 10.5px; color: var(--ink-faint); letter-spacing: 2px; font-family: var(--font-title); }
.dup-line { font-family: var(--font-mono); font-size: 14px; color: var(--ink); }
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
.close { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--ink-faint); font-size: 16px; cursor: pointer; padding: 4px; }
</style>
