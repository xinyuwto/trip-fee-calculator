<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'

const router = useRouter()
const { trip, initTrip } = useTripStore()
const memberCount = ref(5)
const memberNames = ref(['成员1', '成员2', '成员3', '成员4', '成员5'])
const tripName = ref('我的旅行')

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
  <div class="page init-page">
    <h1>开始旅行</h1>
    <p class="subtitle">设定旅行信息和成员</p>

    <div class="form-group">
      <label>旅行名称</label>
      <input v-model="tripName" type="text" placeholder="我的旅行" maxlength="20" />
    </div>

    <div class="form-group">
      <label>成员人数</label>
      <div class="counter">
        <button @click="updateCount(memberCount - 1)" :disabled="memberCount <= 2">−</button>
        <span>{{ memberCount }}</span>
        <button @click="updateCount(memberCount + 1)" :disabled="memberCount >= 20">+</button>
      </div>
    </div>

    <div class="form-group">
      <label>成员昵称</label>
      <div class="member-names">
        <input
          v-for="(_, i) in memberCount"
          :key="i"
          v-model="memberNames[i]"
          type="text"
          :placeholder="`成员${i + 1}`"
          maxlength="10"
        />
      </div>
    </div>

    <button class="btn-primary" @click="handleStart">开始旅行</button>
  </div>
</template>

<style scoped>
.init-page { padding: 24px 16px; max-width: 430px; margin: 0 auto; }
h1 { font-family: var(--font-title); font-size: 24px; margin-bottom: 4px; }
.subtitle { color: var(--ink-soft); font-size: 14px; margin-bottom: 24px; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--ink-soft); }
input[type="text"] {
  width: 100%; padding: 10px 12px; font-size: 16px;
  border: 1px solid var(--rule); border-radius: 8px;
  background: transparent; color: var(--ink); font-family: var(--font-body);
}
.counter { display: flex; align-items: center; gap: 16px; }
.counter button {
  width: 40px; height: 40px; font-size: 20px; border: 1px solid var(--rule);
  border-radius: 8px; background: transparent; cursor: pointer; color: var(--ink);
}
.counter button:disabled { opacity: 0.4; cursor: default; }
.counter span { font-size: 20px; font-weight: 600; min-width: 30px; text-align: center; font-family: var(--font-mono); }
.member-names { display: flex; flex-direction: column; gap: 8px; }
.btn-primary {
  width: 100%; padding: 14px; font-size: 18px; font-weight: 600;
  color: #fbf6e8; background: var(--ink); border: none; border-radius: 8px;
  cursor: pointer; font-family: var(--font-title);
}
</style>
