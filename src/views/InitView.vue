<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import SyncDialog from '../components/SyncDialog.vue'

const router = useRouter()
const { trip, initTrip } = useTripStore()
const memberCount = ref(5)
const memberNames = ref(['成员1', '成员2', '成员3', '成员4', '成员5'])
const tripName = ref('我的旅行')
const showJoin = ref(false)

function onJoined() {
  showJoin.value = false
  router.replace('/expense')
}

const CHINESE_NUMS = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾',
  '拾壹', '拾贰', '拾叁', '拾肆', '拾伍', '拾陆', '拾柒', '拾捌', '拾玖', '贰拾']

if (trip.value) {
  router.replace('/expense')
}

function updateCount(n) {
  const count = Math.max(2, Math.min(20, n))
  memberCount.value = count
  const current = memberNames.value
  while (current.length < count) {
    current.push(`成员${current.length + 1}`)
  }
  memberNames.value = current.slice(0, count)
}

function handleStart() {
  const names = memberNames.value
    .map(n => n.trim())
    .filter(Boolean)
  if (names.length < 2) return
  initTrip(tripName.value.trim() || '我的旅行', names)
  router.push('/expense')
}
</script>

<template>
  <div class="stage">
    <div class="receipt-head">
      <div class="rh-top">
        <div>
          <div class="rh-title">开 始 旅 行</div>
          <div class="rh-sub">INIT · 设定旅行与成员</div>
        </div>
        <div class="rh-stamp">待启程</div>
      </div>
      <div class="rh-meta">
        <span>step 1 / 4</span>
        <span>成员 2 ~ 20</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">旅 行 名 称</div>
      <div class="field">
        <input class="input" v-model="tripName" type="text" placeholder="我的旅行" maxlength="20" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">成 员 人 数</div>
      <div class="stepper">
        <button @click="updateCount(memberCount - 1)" :disabled="memberCount <= 2">−</button>
        <span class="val">{{ memberCount }}</span>
        <button @click="updateCount(memberCount + 1)" :disabled="memberCount >= 20">+</button>
      </div>
      <div class="stepper-hint">最少 2 · 最多 20</div>
    </div>

    <div class="card">
      <div class="card-title">成 员 昵 称 <span class="cnt">{{ memberCount }} 人</span></div>
      <div class="name-list">
        <div v-for="(_, i) in memberCount" :key="i" class="name-row">
          <span class="name-idx">{{ CHINESE_NUMS[i] }}</span>
          <input class="input" v-model="memberNames[i]" type="text" :placeholder="`成员${i + 1}`" maxlength="10" />
        </div>
      </div>
    </div>

    <button class="btn vermilion block" @click="handleStart">开 始 旅 行</button>

    <button class="btn ghost block" style="margin-top:12px;color:var(--ink-soft);" @click="showJoin = true">加 入 旅 行</button>
    <p class="join-hint">已有同伴开启了同步？输入同步码加入</p>

    <div class="foot-note">
      <strong>说明</strong><br>
      设定旅行名与成员后进入记账页 · 数据仅存本地浏览器
    </div>
  </div>

  <SyncDialog :show="showJoin" join-only @joined="onJoined" @close="showJoin = false" />
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
.rh-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); margin-top: 10px; font-family: var(--font-mono); }

/* card */
.card {
  border: 1px solid var(--rule); background: #fbf6e8;
  border-radius: 10px; padding: 16px; box-shadow: var(--shadow); margin-top: 14px;
}
.card-title {
  font-family: var(--font-title); font-weight: 700; font-size: 15px;
  letter-spacing: 2px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
.card-title::before { content: ""; width: 3px; height: 14px; background: var(--vermilion); }
.card-title .cnt { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); font-weight: 400; margin-left: auto; letter-spacing: 0; }

/* field */
.field { margin-bottom: 0; }
.input {
  width: 100%; padding: 11px 12px; font-size: 15px; font-family: var(--font-body);
  border: none; border-bottom: 1.5px solid var(--rule); background: transparent;
  color: var(--ink); outline: none; border-radius: 0;
}
.input:focus { border-bottom-color: var(--indigo); }
.input::placeholder { color: var(--ink-faint); }

/* stepper */
.stepper { display: flex; align-items: center; gap: 18px; justify-content: center; padding: 6px 0; }
.stepper button {
  width: 44px; height: 44px; border: 1px solid var(--rule); border-radius: 50%;
  background: #fbf6e8; font-size: 22px; color: var(--ink); cursor: pointer;
  display: flex; align-items: center; justify-content: center; line-height: 1;
}
.stepper button:disabled { opacity: .35; cursor: not-allowed; }
.stepper .val { font-family: var(--font-title); font-weight: 900; font-size: 34px; min-width: 60px; text-align: center; }
.stepper-hint { text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); margin-top: 4px; }

/* name list */
.name-list { display: flex; flex-direction: column; gap: 0; }
.name-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px dotted rgba(201,184,150,.6); }
.name-row:last-child { border-bottom: none; }
.name-idx {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: var(--ink); color: #fbf6e8;
  font-family: var(--font-title); font-weight: 700; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
}
.name-row .input { flex: 1; border-bottom: none; padding: 6px 8px; }
.name-row .input:focus { background: rgba(43,58,103,.04); border-radius: 4px; }

/* btn */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 13px 16px; font-size: 15px; font-weight: 600; border-radius: 8px;
  border: 1px solid var(--rule); background: #fbf6e8; color: var(--ink);
  cursor: pointer; font-family: var(--font-body); letter-spacing: 1px;
}
.btn.vermilion { background: var(--vermilion); color: #fff; border-color: var(--vermilion); }
.btn.block { width: 100%; margin-top: 18px; font-size: 17px; padding: 15px; }

/* foot note */
.foot-note { margin-top: 24px; padding: 14px; border-top: 1px dashed var(--rule); font-size: 10.5px; color: var(--ink-soft); line-height: 1.7; text-align: center; font-family: var(--font-mono); }
.foot-note strong { color: var(--ink); font-family: var(--font-title); font-weight: 700; }

.join-hint { text-align: center; font-size: 11px; color: var(--ink-faint); margin-top: 8px; font-family: var(--font-mono); }

</style>
