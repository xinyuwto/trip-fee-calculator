# 旅行记账分账工具 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vue 3 SPA that lets a small group track shared trip expenses and split them after the trip.

**Architecture:** Vue 3 (Composition API, `<script setup>`) + Vite + Vue Router 4 (hash mode). One data-layer composable (`useTripStore`) manages all state in localStorage. Four route-backed views: Init → Expense → Settlement → Detail. Pure frontend, zero backend, no external UI or state-management libraries.

**Tech Stack:** Vue 3, Vite, Vue Router 4, localStorage, hand-written CSS (mobile-first), Vitest for unit tests.

## Global Constraints

- Vue 3 Composition API only (`<script setup>`), no Options API
- No external UI libraries or state-management libraries
- All monetary values stored and computed in integer cents (avoid float precision)
- Mobile-first CSS, touch-friendly interactive elements (> 44px tap targets)
- Delete/reset operations require user confirmation
- All copy text in Chinese

---

### Task 1: Scaffold Vue 3 + Vite project

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/App.vue`

**Interfaces:**
- Consumes: nothing
- Produces: runnable dev server on http://localhost:5173 with Vue app mounted

- [ ] **Step 1: Run `npm create vue@latest` to scaffold project**

Or manually create the minimal Vite + Vue 3 setup:

```bash
# Go to project root
cd "C:\job\playground\trip\trip-fee-calculator"
npm init -y
npm install vue@3 vue-router@4
npm install -D vite @vitejs/plugin-vue
```

- [ ] **Step 2: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>旅行记账</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `vite.config.js`**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173 }
})
```

- [ ] **Step 4: Create `src/main.js`**

```js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')
```

- [ ] **Step 5: Create `src/App.vue`**

```vue
<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <div id="app-container">
    <RouterView />
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; -webkit-text-size-adjust: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
</style>
```

- [ ] **Step 6: Create `src/router/index.js`**

```js
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = []

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
```

- [ ] **Step 7: Verify — `npm run dev` and open http://localhost:5173 — should show blank page, no errors**

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vue 3 + Vite project"
```

---

### Task 2: Data layer — `useTripStore` composable

**Files:**
- Create: `src/stores/trip.js`
- Test: `src/stores/__tests__/trip.test.js`

**Interfaces:**
- Produces: `useTripStore()` composable returning `{ trip, initTrip, addExpense, updateExpense, removeExpense, resetTrip, exportData, importData }`

- [ ] **Step 1: Install and configure Vitest**

```bash
npm install -D vitest jsdom
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
```

Add test config to `vite.config.js`:
```js
/// <reference types="vitest" />
export default defineConfig({
  plugins: [vue()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom'
  }
})
```

- [ ] **Step 2: Write failing test for `initTrip`**

Create `src/stores/__tests__/trip.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useTripStore } from '../trip'

// localStorage mock won't track deeply-nested mutation via parse/stringify,
// but our store stores a serialized state object keyed by TRIP_KEY.
describe('useTripStore', () => {
  beforeEach(() => {
    localStorage.clear()
    // composable factory — create fresh each test
    const store = useTripStore()
    store.resetTrip(false)
  })

  it('returns default null trip before init', () => {
    const { trip } = useTripStore()
    expect(trip.value).toBeNull()
  })

  it('initTrip creates a trip with given name and default members', () => {
    const { trip, initTrip } = useTripStore()
    initTrip('测试旅行', ['Alice', 'Bob', 'Charlie'])

    expect(trip.value).not.toBeNull()
    expect(trip.value.name).toBe('测试旅行')
    expect(trip.value.members).toHaveLength(3)
    expect(trip.value.members[0].name).toBe('Alice')
    expect(trip.value.members[0].id).toBeTruthy()
    expect(trip.value.expenses).toEqual([])
    expect(trip.value.createdAt).toBeTruthy()
  })

  it('initTrip defaults to 5 members', () => {
    const { trip, initTrip } = useTripStore()
    initTrip()
    expect(trip.value.members).toHaveLength(5)
    expect(trip.value.members[0].name).toBe('成员1')
  })

  it('addExpense adds an expense', () => {
    const { trip, initTrip, addExpense } = useTripStore()
    initTrip()

    addExpense({
      purpose: '午餐',
      amount: 15000,  // cents: 150.00
      payerId: trip.value.members[0].id,
      beneficiaryIds: trip.value.members.map(m => m.id),
      createdAt: new Date('2025-07-20T12:00:00').toISOString()
    })

    expect(trip.value.expenses).toHaveLength(1)
    expect(trip.value.expenses[0].purpose).toBe('午餐')
    expect(trip.value.expenses[0].amount).toBe(15000)
  })

  it('updateExpense modifies an existing expense', () => {
    const { trip, initTrip, addExpense, updateExpense } = useTripStore()
    initTrip()

    addExpense({ purpose: '午餐', amount: 15000, payerId: trip.value.members[0].id, beneficiaryIds: trip.value.members.map(m => m.id) })
    const id = trip.value.expenses[0].id

    updateExpense(id, { purpose: '晚餐', amount: 20000 })
    expect(trip.value.expenses[0].purpose).toBe('晚餐')
    expect(trip.value.expenses[0].amount).toBe(20000)
  })

  it('removeExpense removes an expense', () => {
    const { trip, initTrip, addExpense, removeExpense } = useTripStore()
    initTrip()

    addExpense({ purpose: '午餐', amount: 15000, payerId: trip.value.members[0].id, beneficiaryIds: trip.value.members.map(m => m.id) })
    const id = trip.value.expenses[0].id

    removeExpense(id)
    expect(trip.value.expenses).toHaveLength(0)
  })

  it('resetTrip clears data', () => {
    const { trip, initTrip, resetTrip } = useTripStore()
    initTrip()

    resetTrip(false)
    expect(trip.value).toBeNull()
  })

  it('exportData returns trip JSON', () => {
    const { initTrip, exportData } = useTripStore()
    initTrip('测试')
    const json = exportData()
    const parsed = JSON.parse(json)
    expect(parsed.name).toBe('测试')
  })

  it('importData sets trip from valid JSON', () => {
    const { trip, importData } = useTripStore()
    const json = JSON.stringify({
      name: '导入测试',
      members: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }],
      expenses: [],
      createdAt: new Date().toISOString()
    })

    const result = importData(json)
    expect(result.success).toBe(true)
    expect(trip.value.name).toBe('导入测试')
    expect(trip.value.members).toHaveLength(2)
  })

  it('importData rejects invalid JSON', () => {
    const { importData } = useTripStore()
    const result = importData('not json')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('importData rejects JSON with missing fields', () => {
    const { importData } = useTripStore()
    const result = importData(JSON.stringify({ name: 'incomplete' }))
    expect(result.success).toBe(false)
  })

  it('persists to localStorage', () => {
    const { trip, initTrip } = useTripStore()
    initTrip('持久化测试')

    // New store instance reads from localStorage
    const { trip: trip2 } = useTripStore()
    expect(trip2.value.name).toBe('持久化测试')
  })
})
```

- [ ] **Step 3: Run tests — expected: all FAIL**

```bash
npx vitest run
```

- [ ] **Step 4: Implement `src/stores/trip.js`**

```js
import { ref, watch } from 'vue'

const TRIP_KEY = 'trip-fee-calculator-data'
const DEFAULT_MEMBER_COUNT = 5

let singleton = null

function uuid() {
  return crypto.randomUUID()
}

function createDefaultMembers(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: uuid(),
    name: `成员${i + 1}`
  }))
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(TRIP_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !data.members || !Array.isArray(data.expenses)) return null
    return data
  } catch {
    return null
  }
}

function saveToStorage(trip) {
  if (trip === null) {
    localStorage.removeItem(TRIP_KEY)
  } else {
    localStorage.setItem(TRIP_KEY, JSON.stringify(trip))
  }
}

export function useTripStore() {
  if (singleton) return singleton

  const trip = ref(loadFromStorage())

  watch(trip, (val) => saveToStorage(val), { deep: true })

  function initTrip(name = '我的旅行', memberNames = null) {
    const members = memberNames
      ? memberNames.map(n => ({ id: uuid(), name: n }))
      : createDefaultMembers(DEFAULT_MEMBER_COUNT)

    trip.value = {
      name,
      members,
      expenses: [],
      createdAt: new Date().toISOString()
    }
  }

  function addExpense({ purpose, amount, payerId, beneficiaryIds, createdAt }) {
    if (!trip.value) return
    trip.value.expenses.push({
      id: uuid(),
      purpose,
      amount: Math.round(amount),
      payerId,
      beneficiaryIds,
      createdAt: createdAt || new Date().toISOString()
    })
  }

  function updateExpense(id, updates) {
    if (!trip.value) return
    const idx = trip.value.expenses.findIndex(e => e.id === id)
    if (idx === -1) return
    if (updates.amount !== undefined) updates.amount = Math.round(updates.amount)
    Object.assign(trip.value.expenses[idx], updates)
  }

  function removeExpense(id) {
    if (!trip.value) return
    trip.value.expenses = trip.value.expenses.filter(e => e.id !== id)
  }

  function resetTrip() {
    trip.value = null
  }

  function exportData() {
    return JSON.stringify(trip.value, null, 2)
  }

  function importData(json) {
    try {
      const data = JSON.parse(json)
      if (!data || typeof data.name !== 'string' || !Array.isArray(data.members) || !Array.isArray(data.expenses)) {
        return { success: false, error: '数据格式不正确' }
      }
      if (data.members.length < 2 || data.members.length > 20) {
        return { success: false, error: '成员人数需在 2~20 之间' }
      }
      for (const m of data.members) {
        if (!m.id || !m.name) return { success: false, error: '成员数据不完整' }
      }
      for (const e of data.expenses) {
        if (!e.id || !e.purpose || !e.amount || !e.payerId || !e.beneficiaryIds) {
          return { success: false, error: '费用记录不完整' }
        }
      }
      trip.value = data
      return { success: true }
    } catch {
      return { success: false, error: 'JSON 解析失败' }
    }
  }

  singleton = { trip, initTrip, addExpense, updateExpense, removeExpense, resetTrip, exportData, importData }
  return singleton
}
```

- [ ] **Step 5: Run tests — expected: all PASS**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add useTripStore composable with localStorage persistence"
```

---

### Task 3: Settlement algorithm

**Files:**
- Create: `src/utils/settlement.js`
- Test: `src/utils/__tests__/settlement.test.js`

**Interfaces:**
- Consumes: nothing (pure function)
- Produces: `calculateSettlement(members, expenses) => { memberBalances, transactions }`

- [ ] **Step 1: Write failing tests in `src/utils/__tests__/settlement.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { calculateSettlement } from '../settlement'

const members = [
  { id: '1', name: '张三' },
  { id: '2', name: '李四' },
  { id: '3', name: '王五' }
]

it('all even — no transactions', () => {
  const expenses = [
    { amount: 300, payerId: '1', beneficiaryIds: ['1', '2', '3'] },
    { amount: 300, payerId: '2', beneficiaryIds: ['1', '2', '3'] },
    { amount: 300, payerId: '3', beneficiaryIds: ['1', '2', '3'] }
  ]
  const result = calculateSettlement(members, expenses)
  result.memberBalances.forEach(b => expect(b.balance).toBe(0))
  expect(result.transactions).toHaveLength(0)
})

it('one person pays for all', () => {
  const expenses = [
    { amount: 300, payerId: '1', beneficiaryIds: ['1', '2', '3'] }
  ]
  const result = calculateSettlement(members, expenses)

  // 张三 paid 300, owed 100 → balance +200
  // 李四 paid 0, owed 100 → balance -100
  // 王五 paid 0, owed 100 → balance -100
  const zhangsan = result.memberBalances.find(b => b.memberId === '1')
  const lisi = result.memberBalances.find(b => b.memberId === '2')
  const wangwu = result.memberBalances.find(b => b.memberId === '3')

  expect(zhangsan.balance).toBe(200)
  expect(lisi.balance).toBe(-100)
  expect(wangwu.balance).toBe(-100)

  expect(result.transactions).toHaveLength(2)
  // Two transactions: 李四→张三 100, 王五→张三 100
  const [t1, t2] = result.transactions
  expect(t1.fromId).toBe('2')
  expect(t1.toId).toBe('1')
  expect(t1.amount).toBe(100)
  expect(t2.fromId).toBe('3')
  expect(t2.toId).toBe('1')
  expect(t2.amount).toBe(100)
})

it('partial beneficiaries', () => {
  const expenses = [
    { amount: 150, payerId: '1', beneficiaryIds: ['1', '2'] }
  ]
  const result = calculateSettlement(members, expenses)

  // 张三 paid 150, owed 75 → balance +75
  // 李四 paid 0, owed 75 → balance -75
  // 王五 paid 0, owed 0 → balance 0
  const zhangsan = result.memberBalances.find(b => b.memberId === '1')
  const lisi = result.memberBalances.find(b => b.memberId === '2')
  const wangwu = result.memberBalances.find(b => b.memberId === '3')

  expect(zhangsan.balance).toBe(75)
  expect(lisi.balance).toBe(-75)
  expect(wangwu.balance).toBe(0)

  expect(result.transactions).toHaveLength(1)
  expect(result.transactions[0].fromId).toBe('2')
  expect(result.transactions[0].toId).toBe('1')
  expect(result.transactions[0].amount).toBe(75)
})

it('minimum transactions with cross payments', () => {
  // A paid 100 for A+B → A owes 50, B owes 50
  // B paid 150 for B+C → B owes 75, C owes 75
  const expenses = [
    { amount: 100, payerId: '1', beneficiaryIds: ['1', '2'] },
    { amount: 150, payerId: '2', beneficiaryIds: ['2', '3'] }
  ]
  const result = calculateSettlement(members, expenses)

  // 张三: paid 100, owed 50 → +50
  // 李四: paid 150, owed 50+75=125 → +25
  // 王五: paid 0, owed 75 → -75
  // Optimal: 王五→张三 50, 王五→李四 25
  expect(result.transactions).toHaveLength(2)
})
```

- [ ] **Step 2: Run tests — expected: all FAIL**

```bash
npx vitest run src/utils/__tests__/settlement.test.js
```

- [ ] **Step 3: Implement `src/utils/settlement.js`**

```js
/**
 * Calculate who owes whom how much.
 *
 * @param {Array<{id: string, name: string}>} members
 * @param {Array<{amount: number, payerId: string, beneficiaryIds: string[]}>} expenses
 * @returns {{ memberBalances: Array, transactions: Array }}
 */
export function calculateSettlement(members, expenses) {
  const memberMap = new Map(members.map(m => [m.id, m]))

  // paid[m.id] = total amount this person paid
  const paid = new Map(members.map(m => [m.id, 0]))
  const owed = new Map(members.map(m => [m.id, 0]))

  for (const exp of expenses) {
    const payerId = exp.payerId
    paid.set(payerId, (paid.get(payerId) || 0) + exp.amount)

    const share = exp.amount / exp.beneficiaryIds.length
    for (const bid of exp.beneficiaryIds) {
      owed.set(bid, (owed.get(bid) || 0) + share)
    }
  }

  const memberBalances = members.map(m => {
    const p = paid.get(m.id) || 0
    const o = owed.get(m.id) || 0
    return {
      memberId: m.id,
      memberName: m.name,
      paid: Math.round(p),
      owed: Math.round(o),
      balance: Math.round(p - o)
    }
  })

  // Minimum transactions via greedy matching
  const debtors = memberBalances
    .filter(b => b.balance < 0)
    .map(b => ({ ...b, balance: -b.balance }))
    .sort((a, b) => b.balance - a.balance)

  const creditors = memberBalances
    .filter(b => b.balance > 0)
    .sort((a, b) => b.balance - a.balance)

  const transactions = []
  let di = 0, ci = 0

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].balance, creditors[ci].balance)
    if (amount > 0) {
      transactions.push({
        fromId: debtors[di].memberId,
        fromName: debtors[di].memberName,
        toId: creditors[ci].memberId,
        toName: creditors[ci].memberName,
        amount
      })
    }
    debtors[di].balance -= amount
    creditors[ci].balance -= amount
    if (debtors[di].balance < 1) di++
    if (creditors[ci].balance < 1) ci++
  }

  return { memberBalances, transactions }
}
```

- [ ] **Step 4: Run tests — expected: all PASS**

```bash
npx vitest run src/utils/__tests__/settlement.test.js
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add settlement algorithm with minimum transactions"
```

---

### Task 4: Import/Export utilities

**Files:**
- Create: `src/utils/import-export.js`
- Test: `src/utils/__tests__/import-export.test.js`

**Interfaces:**
- Consumes: `useTripStore`
- Produces: `copyToClipboard(json)`, `downloadJsonFile(json, filename)`, `importFromClipboard()`, `importFromFile(file)`

- [ ] **Step 1: Write failing test**

Create `src/utils/__tests__/import-export.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { downloadJsonFile } from '../import-export'

it('triggers download on the DOM', () => {
  // downloadJsonFile creates a temporary anchor element and clicks it.
  // We spy on URL.createObjectURL and the click.
  let clicked = false
  const originalCreateObjectURL = URL.createObjectURL
  URL.createObjectURL = (blob) => {
    expect(blob.type).toBe('application/json')
    return 'blob:fake'
  }

  const anchorSpy = {
    href: '',
    download: '',
    click() { clicked = true }
  }
  const originalCreateElement = document.createElement
  document.createElement = (tag) => {
    if (tag === 'a') return anchorSpy
    return originalCreateElement.call(document, tag)
  }

  downloadJsonFile('{"test":1}', 'test.json')

  expect(clicked).toBe(true)
  expect(anchorSpy.download).toBe('test.json')

  // Cleanup
  URL.createObjectURL = originalCreateObjectURL
  document.createElement = originalCreateElement
})
```

- [ ] **Step 2: Run test — expected: FAIL**

```bash
npx vitest run src/utils/__tests__/import-export.test.js
```

- [ ] **Step 3: Implement `src/utils/import-export.js`**

```js
export async function copyToClipboard(json) {
  try {
    await navigator.clipboard.writeText(json)
    return { success: true }
  } catch {
    return { success: false, error: '剪贴板访问失败，请手动复制' }
  }
}

export function downloadJsonFile(json, filename = 'trip-expenses.json') {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    return { success: true, data: text }
  } catch {
    return { success: false, error: '无法读取剪贴板' }
  }
}

export function importFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve({ success: true, data: e.target.result })
    reader.onerror = () => resolve({ success: false, error: '文件读取失败' })
    reader.readAsText(file)
  })
}
```

- [ ] **Step 4: Run test — expected: PASS**

```bash
npx vitest run src/utils/__tests__/import-export.test.js
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add import/export utilities"
```

---

### Task 5: InitView — trip setup page

**Files:**
- Create: `src/views/InitView.vue`
- Modify: `src/router/index.js` (add route)

**Interfaces:**
- Consumes: `useTripStore.initTrip()`
- Produces: route `/` — user sets trip name and member names, clicks "开始旅行" to navigate to `/expense`

- [ ] **Step 1: Add route to `src/router/index.js`**

```js
import { createRouter, createWebHashHistory } from 'vue-router'
import InitView from '../views/InitView.vue'

const routes = [
  { path: '/', name: 'init', component: InitView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
```

- [ ] **Step 2: Implement `src/views/InitView.vue`**

```vue
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
.init-page { padding: 24px 16px; max-width: 400px; margin: 0 auto; }
h1 { font-size: 24px; margin-bottom: 4px; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
input[type="text"] { width: 100%; padding: 10px 12px; font-size: 16px; border: 1px solid #ddd; border-radius: 8px; }
.counter { display: flex; align-items: center; gap: 16px; }
.counter button {
  width: 40px; height: 40px; font-size: 20px; border: 1px solid #ddd;
  border-radius: 8px; background: #f5f5f5; cursor: pointer;
}
.counter button:disabled { opacity: 0.4; cursor: default; }
.counter span { font-size: 20px; font-weight: 600; min-width: 30px; text-align: center; }
.member-names { display: flex; flex-direction: column; gap: 8px; }
.btn-primary {
  width: 100%; padding: 14px; font-size: 18px; font-weight: 600;
  color: #fff; background: #1677ff; border: none; border-radius: 8px; cursor: pointer;
}
</style>
```

- [ ] **Step 3: Start dev server and load page — verify members and trip name can be set**

```bash
npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add InitView — trip setup page"
```

---

### Task 6: ConfirmDialog and MemberSelector components

**Files:**
- Create: `src/components/ConfirmDialog.vue`
- Create: `src/components/MemberSelector.vue`

**Interfaces:**
- `ConfirmDialog` consumes props `{ show, title, message }`, emits `{ confirm, cancel }`
- `MemberSelector` consumes props `{ members: Member[], modelValue: string[] }`, emits `{ 'update:modelValue' }`

- [ ] **Step 1: Create `src/components/ConfirmDialog.vue`**

```vue
<script setup>
defineProps({ show: Boolean, title: String, message: String })
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <div v-if="show" class="overlay" @click.self="emit('cancel')">
    <div class="dialog">
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div class="dialog-actions">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-danger" @click="emit('confirm')">确认</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog {
  background: #fff; border-radius: 12px; padding: 24px;
  width: 300px; max-width: 90vw;
}
.dialog h3 { margin-bottom: 8px; }
.dialog p { color: #666; font-size: 14px; margin-bottom: 20px; }
.dialog-actions { display: flex; gap: 12px; justify-content: flex-end; }
.btn-cancel, .btn-danger {
  padding: 10px 20px; font-size: 15px; border: none; border-radius: 8px; cursor: pointer;
}
.btn-cancel { background: #f0f0f0; }
.btn-danger { background: #ff4d4f; color: #fff; }
</style>
```

- [ ] **Step 2: Create `src/components/MemberSelector.vue`**

```vue
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
  if (props.modelValue.length === props.members.length) {
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
  padding: 8px 14px; font-size: 13px; border: 1px dashed #bbb;
  border-radius: 20px; background: transparent; cursor: pointer; color: #666;
}
.member-chip {
  padding: 8px 16px; font-size: 14px; border: 1px solid #ddd;
  border-radius: 20px; background: #f9f9f9; cursor: pointer; transition: all 0.15s;
}
.member-chip.selected { background: #1677ff; color: #fff; border-color: #1677ff; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add ConfirmDialog and MemberSelector components"
```

---

### Task 7: ExpenseView — main expense tracking page

**Files:**
- Create: `src/views/ExpenseView.vue`
- Create: `src/components/ExpenseForm.vue`
- Create: `src/components/ExpenseList.vue`
- Modify: `src/router/index.js` (add route)

**Interfaces:**
- Consumes: `useTripStore` (all methods)
- Produces: route `/expense` — form to add expenses, list of existing expenses with edit/delete, nav to settlement

- [ ] **Step 1: Add route to `src/router/index.js`**

```js
// Add import
import ExpenseView from '../views/ExpenseView.vue'

// Add route after init
{ path: '/expense', name: 'expense', component: ExpenseView }
```

- [ ] **Step 2: Create `src/components/ExpenseForm.vue`**

```vue
<script setup>
import { ref, computed } from 'vue'
import MemberSelector from './MemberSelector.vue'

const props = defineProps({ members: { type: Array, required: true }, editing: { type: Object, default: null } })
const emit = defineEmits(['save'])

const purpose = ref(props.editing?.purpose || '')
const amount = ref(props.editing ? (props.editing.amount / 100).toString() : '')
const payerId = ref(props.editing?.payerId || '')
const beneficiaryIds = ref(props.editing?.beneficiaryIds || [])
const createdAt = ref(props.editing?.createdAt?.slice(0, 16) || toDatetimeLocal(new Date()))
const error = ref('')

function toDatetimeLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const isEditing = computed(() => !!props.editing)

function handleSubmit() {
  error.value = ''
  if (!purpose.value.trim()) { error.value = '请填写用途'; return }
  const amountCents = Math.round(parseFloat(amount.value) * 100)
  if (!amountCents || amountCents <= 0) { error.value = '请输入有效金额'; return }
  if (!payerId.value) { error.value = '请选择支付人'; return }
  if (beneficiaryIds.value.length === 0) { error.value = '请选择至少一个受益人'; return }

  emit('save', {
    purpose: purpose.value.trim(),
    amount: amountCents,
    payerId: payerId.value,
    beneficiaryIds: beneficiaryIds.value,
    createdAt: new Date(createdAt.value).toISOString()
  })

  if (!isEditing.value) {
    purpose.value = ''
    amount.value = ''
    payerId.value = ''
    beneficiaryIds.value = []
    createdAt.value = toDatetimeLocal(new Date())
  }
}

function handleCancel() {
  emit('save', null) // signal cancel edit
}
</script>

<template>
  <form class="expense-form" @submit.prevent="handleSubmit">
    <h2>{{ isEditing ? '修改记录' : '记一笔' }}</h2>

    <input v-model="purpose" type="text" placeholder="用途（如：午餐、打车）" maxlength="50" />

    <div class="row">
      <input v-model="amount" type="number" placeholder="金额（元）" step="0.01" min="0" />
      <select v-model="payerId">
        <option value="" disabled>谁付的？</option>
        <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </div>

    <input v-model="createdAt" type="datetime-local" />

    <label class="field-label">受益人</label>
    <MemberSelector v-if="members.length" :members="members" v-model="beneficiaryIds" />

    <div v-if="error" class="error">{{ error }}</div>

    <div class="form-actions">
      <button v-if="isEditing" type="button" class="btn-cancel" @click="handleCancel">取消编辑</button>
      <button type="submit" class="btn-primary">{{ isEditing ? '保存修改' : '添加' }}</button>
    </div>
  </form>
</template>

<style scoped>
.expense-form { padding: 16px; background: #fff; border-radius: 12px; margin-bottom: 16px; }
.expense-form h2 { font-size: 18px; margin-bottom: 12px; }
.expense-form input, .expense-form select {
  width: 100%; padding: 10px 12px; font-size: 16px; border: 1px solid #ddd;
  border-radius: 8px; margin-bottom: 10px;
}
.row { display: flex; gap: 10px; }
.field-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.error { color: #ff4d4f; font-size: 14px; margin-top: 8px; }
.form-actions { display: flex; gap: 10px; margin-top: 12px; }
.form-actions .btn-cancel { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #f5f5f5; font-size: 16px; cursor: pointer; }
.form-actions .btn-primary { flex: 1; padding: 12px; border: none; border-radius: 8px; background: #1677ff; color: #fff; font-size: 16px; cursor: pointer; }
</style>
```

- [ ] **Step 3: Create `src/components/ExpenseList.vue`**

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({ expenses: { type: Array, required: true }, members: { type: Array, required: true } })
const emit = defineEmits(['edit', 'delete'])

function memberName(id) {
  return props.members.find(m => m.id === id)?.name || '未知'
}

function money(cents) {
  return (cents / 100).toFixed(2)
}

function fmtTime(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const sorted = computed(() =>
  [...props.expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
)
</script>

<template>
  <div class="expense-list">
    <h2>账单明细 ({{ expenses.length }})</h2>
    <div v-if="expenses.length === 0" class="empty">还没有记录，记一笔吧</div>
    <div v-for="e in sorted" :key="e.id" class="expense-item">
      <div class="item-main">
        <span class="item-purpose">{{ e.purpose }}</span>
        <span class="item-amount">{{ money(e.amount) }} 元</span>
      </div>
      <div class="item-meta">
        <span>{{ memberName(e.payerId) }} 付 · {{ fmtTime(e.createdAt) }}</span>
        <span class="item-beneficiaries">{{ e.beneficiaryIds.map(memberName).join('、') }}</span>
      </div>
      <div class="item-actions">
        <button @click="emit('edit', e)">修改</button>
        <button class="btn-delete" @click="emit('delete', e)">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expense-list { padding: 16px 0; }
.expense-list h2 { font-size: 18px; margin-bottom: 12px; }
.empty { color: #999; font-size: 15px; text-align: center; padding: 32px 0; }
.expense-item { padding: 12px; background: #fff; border-radius: 8px; margin-bottom: 8px; }
.item-main { display: flex; justify-content: space-between; margin-bottom: 4px; }
.item-purpose { font-weight: 600; }
.item-amount { color: #ff4d4f; font-weight: 600; }
.item-meta { font-size: 13px; color: #888; display: flex; justify-content: space-between; }
.item-actions { margin-top: 8px; display: flex; gap: 8px; }
.item-actions button { padding: 6px 14px; font-size: 13px; border: 1px solid #ddd; border-radius: 6px; background: #f9f9f9; cursor: pointer; }
.item-actions .btn-delete { color: #ff4d4f; border-color: #ffccc7; background: #fff2f0; }
</style>
```

- [ ] **Step 4: Create `src/views/ExpenseView.vue`**

```vue
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

<script>
// Extra script block for refs not captured by <script setup>
export default {
  data() {
    return { showReset2: false }
  }
}
</script>

<style scoped>
.expense-page { padding: 16px; max-width: 500px; margin: 0 auto; padding-bottom: 80px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h1 { font-size: 20px; }
.header-actions { display: flex; gap: 6px; }
.header-actions button {
  padding: 6px 12px; font-size: 13px; border: 1px solid #ddd;
  border-radius: 6px; background: #f9f9f9; cursor: pointer;
}
.header-actions .btn-settle { background: #1677ff; color: #fff; border-color: #1677ff; font-weight: 600; }
.footer-actions { margin-top: 24px; text-align: center; }
.btn-reset { padding: 10px 24px; color: #999; border: 1px solid #ddd; border-radius: 8px; background: transparent; cursor: pointer; font-size: 14px; }
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog { background: #fff; border-radius: 12px; padding: 24px; width: 340px; max-width: 90vw; }
.dialog h3 { margin-bottom: 8px; }
.dialog p { color: #666; font-size: 14px; margin-bottom: 12px; }
.dialog textarea { width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ddd; border-radius: 8px; resize: vertical; }
.dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.dialog-actions button { padding: 10px 20px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
.dialog-actions .btn-cancel { background: #f0f0f0; }
.dialog-actions .btn-primary { background: #1677ff; color: #fff; }
.error { color: #ff4d4f; font-size: 13px; margin-top: 6px; }
.success { color: #52c41a; font-size: 13px; margin-top: 6px; }
</style>
```

Wait — the `showReset2` ref needs to be in `<script setup>` block, not a separate `<script>`. Fix the ExpenseView:

`showReset2` should be a ref in `<script setup>`, not a `data()` in a separate script block. The second `<script>` block approach is wrong for Vue 3 Composition API. Fix:

In the `<script setup>` block, add `const showReset2 = ref(false)` after `const showReset = ref(false)`. Remove the second `<script>` block entirely.

- [ ] **Step 5: Fix the ExpenseView — move `showReset2` into `<script setup>`**

In the ExpenseView.vue `<script setup>`:
```js
const showReset = ref(false)
const showReset2 = ref(false)  // add this line
```

And update the first ConfirmDialog for reset:
```html
@confirm="showReset = false; showReset2 = true"
```

The second ConfirmDialog already uses `showReset2`. Remove the extra `<script>` block at the bottom.

- [ ] **Step 6: Verify in browser — add/edit/delete expenses, export/import, reset flow**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add ExpenseView with full CRUD and import/export"
```

---

### Task 8: SettlementView and DetailView

**Files:**
- Create: `src/views/SettlementView.vue`
- Create: `src/views/DetailView.vue`
- Modify: `src/router/index.js` (add routes)

**Interfaces:**
- SettlementView consumes `useTripStore.trip`, `calculateSettlement` → displays who pays whom
- DetailView consumes same → shows per-expense breakdown

- [ ] **Step 1: Add routes**

```js
import SettlementView from '../views/SettlementView.vue'
import DetailView from '../views/DetailView.vue'

// Add routes
{ path: '/settlement', name: 'settlement', component: SettlementView },
{ path: '/detail', name: 'detail', component: DetailView }
```

- [ ] **Step 2: Create `src/views/SettlementView.vue`**

```vue
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { calculateSettlement } from '../utils/settlement'

const router = useRouter()
const { trip } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

const result = computed(() => {
  if (!trip.value || trip.value.expenses.length === 0) return null
  return calculateSettlement(trip.value.members, trip.value.expenses)
})

function money(cents) {
  return (cents / 100).toFixed(2)
}

function totalExpenses() {
  if (!trip.value) return 0
  return trip.value.expenses.reduce((sum, e) => sum + e.amount, 0)
}
</script>

<template>
  <div class="page settlement-page" v-if="trip">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/expense')">← 返回</button>
      <h1>结算结果</h1>
    </header>

    <div class="summary-card">
      <div class="summary-row">
        <span>总支出</span>
        <strong>{{ money(totalExpenses()) }} 元</strong>
      </div>
      <div class="summary-row">
        <span>记录条数</span>
        <strong>{{ trip.expenses.length }}</strong>
      </div>
    </div>

    <div v-if="!result" class="empty">暂无账单，无法结算</div>

    <template v-else>
      <section class="section">
        <h2>转账方案</h2>
        <div v-if="result.transactions.length === 0" class="flat">已平账，无需互相转账</div>
        <div v-for="t in result.transactions" :key="t.fromId + t.toId" class="tx-item">
          <div class="tx-parties">
            <span class="from">{{ t.fromName }}</span>
            <span class="arrow">→</span>
            <span class="to">{{ t.toName }}</span>
          </div>
          <span class="tx-amount">{{ money(t.amount) }} 元</span>
        </div>
      </section>

      <section class="section">
        <h2>每人净收支</h2>
        <div v-for="b in result.memberBalances" :key="b.memberId" class="balance-item">
          <span class="balance-name">{{ b.memberName }}</span>
          <div class="balance-detail">
            <span>付 {{ money(b.paid) }}</span>
            <span> · 应承担 {{ money(b.owed) }}</span>
          </div>
          <span :class="['balance-net', b.balance >= 0 ? 'positive' : 'negative']">
            {{ b.balance >= 0 ? '+' : '' }}{{ money(b.balance) }}
          </span>
        </div>
      </section>

      <button class="btn-link" @click="router.push('/detail')">查看计算依据 →</button>
    </template>
  </div>
</template>

<style scoped>
.settlement-page { padding: 16px; max-width: 500px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 20px; }
.btn-back { padding: 6px 12px; font-size: 14px; border: none; background: transparent; cursor: pointer; }
.summary-card { background: #f0f5ff; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
.summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
.section { margin-bottom: 24px; }
.section h2 { font-size: 16px; margin-bottom: 12px; }
.flat { color: #52c41a; font-size: 15px; }
.empty { color: #999; text-align: center; padding: 40px 0; }
.tx-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px; background: #fff; border-radius: 8px; margin-bottom: 8px;
}
.tx-amount { font-weight: 700; font-size: 18px; color: #1677ff; }
.from { color: #ff4d4f; }
.to { color: #52c41a; }
.arrow { margin: 0 6px; color: #999; }
.balance-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; background: #fff; border-radius: 8px; margin-bottom: 6px;
}
.balance-detail { font-size: 12px; color: #888; }
.balance-net { font-weight: 700; font-size: 16px; }
.positive { color: #52c41a; }
.negative { color: #ff4d4f; }
.btn-link { width: 100%; padding: 12px; font-size: 15px; color: #1677ff; background: transparent; border: 1px dashed #1677ff; border-radius: 8px; cursor: pointer; }
</style>
```

- [ ] **Step 3: Create `src/views/DetailView.vue`**

```vue
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'

const router = useRouter()
const { trip } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

function memberName(id) {
  return trip.value.members.find(m => m.id === id)?.name || '未知'
}

function money(cents) {
  return (cents / 100).toFixed(2)
}

function sharePerPerson(exp) {
  return money(exp.amount / exp.beneficiaryIds.length)
}

const sorted = computed(() =>
  [...trip.value.expenses].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
)
</script>

<template>
  <div class="page detail-page" v-if="trip">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/settlement')">← 返回</button>
      <h1>计算依据</h1>
    </header>

    <div v-for="e in sorted" :key="e.id" class="expense-detail">
      <div class="detail-header">
        <strong>{{ e.purpose }}</strong>
        <span class="detail-amount">{{ money(e.amount) }} 元</span>
      </div>
      <div class="detail-row">
        <span>支付人</span><span>{{ memberName(e.payerId) }}</span>
      </div>
      <div class="detail-row">
        <span>受益人</span><span>{{ e.beneficiaryIds.map(memberName).join('、') }}</span>
      </div>
      <div class="detail-row">
        <span>人均分摊</span><span>{{ sharePerPerson(e) }} 元 ({{ e.beneficiaryIds.length }}人)</span>
      </div>
      <div class="detail-row">
        <span>时间</span><span>{{ new Date(e.createdAt).toLocaleString('zh-CN') }}</span>
      </div>
    </div>

    <div v-if="trip.expenses.length === 0" class="empty">暂无账单</div>
  </div>
</template>

<style scoped>
.detail-page { padding: 16px; max-width: 500px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 20px; }
.btn-back { padding: 6px 12px; font-size: 14px; border: none; background: transparent; cursor: pointer; }
.expense-detail { padding: 14px; background: #fff; border-radius: 8px; margin-bottom: 10px; }
.detail-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
.detail-amount { color: #ff4d4f; font-weight: 700; }
.detail-row { display: flex; justify-content: space-between; font-size: 14px; color: #666; padding: 2px 0; }
.empty { color: #999; text-align: center; padding: 40px 0; }
</style>
```

- [ ] **Step 4: Verify — add some expenses, click 结算, verify math, click 查看依据**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add SettlementView and DetailView"
```

---

### Task 9: Route guard and polish

**Files:**
- Modify: `src/router/index.js` (add navigation guard)
- Create: `src/style.css` (shared mobile styles)

**Interfaces:**
- Navigation guard: redirect to `/` when no trip data, redirect to `/expense` when trip exists and user hits `/`

- [ ] **Step 1: Add navigation guard to `src/router/index.js`**

```js
import { useTripStore } from '../stores/trip'

// ... after route definitions

router.beforeEach((to) => {
  const { trip } = useTripStore()

  if (!trip.value && to.name !== 'init') {
    return { name: 'init' }
  }
  if (trip.value && to.name === 'init') {
    return { name: 'expense' }
  }
})
```

- [ ] **Step 2: Create shared styles `src/style.css`**

```css
.page {
  min-height: 100dvh;
  background: #f7f8fa;
}

input, select, textarea, button {
  -webkit-appearance: none;
  appearance: none;
  font-family: inherit;
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: #1677ff !important;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}
```

Import this in `src/main.js`:
```js
import './style.css'
```

- [ ] **Step 3: Import style.css in main.js**

Add `import './style.css'` at the top of `src/main.js`.

- [ ] **Step 4: Quick manual smoke test on phone or responsive view**

- Open in mobile viewport (375px width)
- Initialize trip with 5 members
- Add 3 expenses (1 full split, 1 partial, 1 with edits)
- Verify settlement math
- Export, reset, import, verify data restored

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add route guard and shared styles"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: Init → Expense CRUD → Settlement → Detail views all covered. Import/export covered. Reset with confirmation covered. Route guard covered.
- [x] **Placeholder scan**: No TBD, TODO, or vague "add error handling" steps. All validation expressed in code.
- [x] **Type consistency**: `amount` is always cents (integer), `member.id` is always UUID string, `expense.id` always UUID string. Function signatures match across tasks.
- [x] **Scope**: Must-dos only (no real-time settlement, no daily summary, no duplicate detection). Clean.

Two issues found and fixed during self-review:
1. **ExpenseView `showReset2`**: The original design used a separate `<script>` block with `data()`, which breaks Composition API convention. Fixed by moving `showReset2` into the `<script setup>` ref block.
2. **Amount unit consistency**: In ExpenseForm, user types yuan → code converts to cents on save. Tests pass integer cents. Settlement.js operates on integer cents. Display helper `money()` converts back to yuan string. Consistent throughout.
