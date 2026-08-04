# UI 改造：原型风格全局应用 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `docs/prototype/settlement-explain.html` 为视觉原型，将 DetailView 完整重写为 per-member 交互视角，并将纸张质感设计系统应用到所有页面。

**Architecture:** 新建 `src/styles/theme.css` 统一定义 CSS 变量（颜色、字体、阴影、纸纹背景），App.vue 全局引入；`settlement.js` 扩展 `analyzeSettlement()` 提供按成员拆分的垫付/被垫付明细；DetailView 重写为 tab 切换 + 净额卡片 + 可展开往来卡片 + why 解释交互。

**Tech Stack:** Vue 3 SFC + scoped CSS + CSS custom properties

## Global Constraints

- 金额精确到分，用整数存储和计算
- 移动端 first，`max-width: 430px` 居中
- 现有测试全程保持通过
- TDD：settlement.js 新函数测试先行
- 字体用系统回退链，不加载 Google Fonts

---

### Task 1: 创建全局 Theme CSS 文件

**Files:**
- Create: `src/styles/theme.css`
- Modify: `src/App.vue`

**Interfaces:**
- Produces: CSS variables (`--paper`, `--ink`, `--vermilion`, `--moss`, etc.) and body styles consumed by all components

- [ ] **Step 1: 创建 `src/styles/theme.css`**

```css
:root {
  --paper: #f4ecd8;
  --paper-2: #ece1c4;
  --ink: #1c1917;
  --ink-soft: #57534e;
  --ink-faint: #a8a29e;
  --rule: #c9b896;
  --indigo: #2b3a67;
  --vermilion: #b54b3a;
  --moss: #4a6b3a;
  --gold: #a87c2c;
  --shadow: 0 1px 0 rgba(28,25,23,.06), 0 12px 28px -18px rgba(28,25,23,.4);

  --font-body: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  --font-title: "Noto Serif SC", "STSong", "SimSun", serif;
  --font-mono: "SF Mono", "Menlo", "Consolas", "IBM Plex Mono", monospace;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  background: var(--paper);
}

body {
  font-family: var(--font-body);
  color: var(--ink);
  min-height: 100vh;
  background-image:
    radial-gradient(circle at 20% 10%, rgba(168,124,44,.06), transparent 40%),
    radial-gradient(circle at 80% 80%, rgba(43,58,103,.05), transparent 45%),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.11 0 0 0 0 0.10 0 0 0 0 0.09 0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}
```

- [ ] **Step 2: 修改 `src/App.vue` — 引入 theme.css**

Replace the existing `<style>` block contents with an import:

```vue
<style>
@import './styles/theme.css';
</style>
```

Remove the old `*, *::before, *::after` and `html`/`body` rules from App.vue (they're now in theme.css).

- [ ] **Step 3: 验证构建不报错**

Run: `npx vite build`
Expected: 构建成功，无 CSS 错误

- [ ] **Step 4: Commit**

```bash
git add src/styles/theme.css src/App.vue
git commit -m "feat: add global theme CSS with paper-texture design tokens"
```

---

### Task 2: TDD — 提取 `shareOf` 独立函数

**Files:**
- Modify: `src/utils/settlement.js`
- Modify: `src/utils/__tests__/settlement.test.js`

**Interfaces:**
- Produces: `shareOf(expense, memberId): number` — 按整数除法+余数分配计算某成员在某笔费用中应承担的分（单位：分）
- Consumes: expense 对象 `{ amount: number, beneficiaryIds: string[] }`

- [ ] **Step 1: 写失败测试**

在 `src/utils/__tests__/settlement.test.js` 顶部添加 import，并新增 describe 块：

```js
import { calculateSettlement, shareOf } from '../settlement'

describe('shareOf', () => {
  it('returns 0 when member is not a beneficiary', () => {
    const exp = { amount: 100, beneficiaryIds: ['A', 'B'] }
    expect(shareOf(exp, 'C')).toBe(0)
  })

  it('evenly divides when amount is multiple of beneficiary count', () => {
    const exp = { amount: 300, beneficiaryIds: ['A', 'B', 'C'] }
    expect(shareOf(exp, 'A')).toBe(100)
    expect(shareOf(exp, 'B')).toBe(100)
    expect(shareOf(exp, 'C')).toBe(100)
  })

  it('distributes remainder to first N beneficiaries', () => {
    // 100 / 3 = 33 remainder 1 → first gets 34, rest 33
    const exp = { amount: 100, beneficiaryIds: ['A', 'B', 'C'] }
    expect(shareOf(exp, 'A')).toBe(34)
    expect(shareOf(exp, 'B')).toBe(33)
    expect(shareOf(exp, 'C')).toBe(33)
  })

  it('distributes remainder of 2 across first 2 beneficiaries', () => {
    // 101 / 3 = 33 remainder 2 → first two get 34, last 33
    const exp = { amount: 101, beneficiaryIds: ['A', 'B', 'C'] }
    expect(shareOf(exp, 'A')).toBe(34)
    expect(shareOf(exp, 'B')).toBe(34)
    expect(shareOf(exp, 'C')).toBe(33)
  })

  it('handles single beneficiary (no remainder)', () => {
    const exp = { amount: 500, beneficiaryIds: ['X'] }
    expect(shareOf(exp, 'X')).toBe(500)
  })
})
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/utils/__tests__/settlement.test.js`
Expected: shareOf 测试 FAIL — `shareOf is not a function` 或 `shareOf is not defined`

- [ ] **Step 3: 实现 `shareOf`**

在 `src/utils/settlement.js` 中导出新函数（放在 calculateSettlement 之前）：

```js
export function shareOf(expense, memberId) {
  if (!expense.beneficiaryIds.includes(memberId)) return 0
  const base = Math.floor(expense.amount / expense.beneficiaryIds.length)
  const remainder = expense.amount % expense.beneficiaryIds.length
  const idx = expense.beneficiaryIds.indexOf(memberId)
  return Math.round(base + (idx < remainder ? 1 : 0))
}
```

- [ ] **Step 4: 验证测试通过**

Run: `npx vitest run src/utils/__tests__/settlement.test.js`
Expected: 所有 shareOf 测试 PASS，现有测试保持绿色

- [ ] **Step 5: Commit**

```bash
git add src/utils/settlement.js src/utils/__tests__/settlement.test.js
git commit -m "feat: extract shareOf — integer-division per-beneficiary share calculation"
```

---

### Task 3: TDD — 新增 `analyzeSettlement` 函数

**Files:**
- Modify: `src/utils/settlement.js`
- Modify: `src/utils/__tests__/settlement.test.js`

**Interfaces:**
- Produces: `analyzeSettlement(members, expenses): AnalysisResult` — 返回完整结算分析，包含每人视角的净额、转账任务、双向往来明细、why 文案数据
- Consumes: `members: Array<{id, name}>`, `expenses: Array<{id, purpose, amount, payerId, beneficiaryIds, createdAt, note?}>`

- [ ] **Step 1: 写失败测试**

在 `src/utils/__tests__/settlement.test.js` import 中加入 `analyzeSettlement`，新增 describe 块：

```js
import { calculateSettlement, shareOf, analyzeSettlement } from '../settlement'

describe('analyzeSettlement', () => {
  const members = [
    { id: 'A', name: 'Alice' },
    { id: 'B', name: 'Bob' },
    { id: 'C', name: 'Charlie' }
  ]
  const expenses = [
    { id: 'e1', purpose: '午餐', amount: 300, payerId: 'A', beneficiaryIds: ['A', 'B', 'C'], createdAt: '2026-08-01T12:00:00Z' },
    { id: 'e2', purpose: '咖啡', amount: 200, payerId: 'B', beneficiaryIds: ['B', 'C'], createdAt: '2026-08-01T15:00:00Z' }
  ]

  it('returns memberBalances and transactions from calculateSettlement', () => {
    const result = analyzeSettlement(members, expenses)
    expect(result.memberBalances).toBeDefined()
    expect(result.transactions).toBeDefined()
    expect(result.members).toHaveLength(3)
  })

  it('computes correct net amounts per member', () => {
    const result = analyzeSettlement(members, expenses)
    // A: paid 300, owed 100 (午餐/3人) = 100, balance +200
    // B: paid 200, owed (午餐 100 + 咖啡 100) = 200, balance 0
    // C: paid 0, owed (午餐 100 + 咖啡 100) = 200, balance -200
    const alice = result.members.find(m => m.memberId === 'A')
    const bob = result.members.find(m => m.memberId === 'B')
    const charlie = result.members.find(m => m.memberId === 'C')
    expect(alice.paid).toBe(300)
    expect(alice.owed).toBe(100)
    expect(alice.balance).toBe(200)
    expect(bob.paid).toBe(200)
    expect(bob.owed).toBe(200)
    expect(bob.balance).toBe(0)
    expect(charlie.paid).toBe(0)
    expect(charlie.owed).toBe(200)
    expect(charlie.balance).toBe(-200)
  })

  it('builds task list for each member', () => {
    const result = analyzeSettlement(members, expenses)
    const charlie = result.members.find(m => m.memberId === 'C')
    // C has negative balance, should have outgoing tasks
    expect(charlie.tasks.length).toBeGreaterThan(0)
    const task = charlie.tasks[0]
    expect(task.fromId).toBe('C')
    expect(task.direction).toBe('out')
    expect(task.amount).toBeGreaterThan(0)
  })

  it('builds relations with bill details', () => {
    const result = analyzeSettlement(members, expenses)
    const alice = result.members.find(m => m.memberId === 'A')
    // A paid for B (via e1: 午餐, share 100)
    const relWithBob = alice.relations.find(r => r.peerId === 'B')
    expect(relWithBob).toBeDefined()
    expect(relWithBob.iGave).toBe(100)
    expect(relWithBob.iPaidForPeer.length).toBeGreaterThan(0)
    const bill = relWithBob.iPaidForPeer[0]
    expect(bill.purpose).toBe('午餐')
    expect(bill.share).toBe(100)
    expect(bill.totalAmount).toBe(300)
  })

  it('relations sorted by total flow descending', () => {
    const members4 = [
      { id: 'A', name: 'Alice' },
      { id: 'B', name: 'Bob' },
      { id: 'C', name: 'Charlie' },
      { id: 'D', name: 'Diana' }
    ]
    const expenses4 = [
      { id: 'e1', purpose: 'A付全款', amount: 400, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D'], createdAt: '2026-08-01T12:00:00Z' },
      { id: 'e2', purpose: 'B付少', amount: 200, payerId: 'B', beneficiaryIds: ['B', 'D'], createdAt: '2026-08-01T13:00:00Z' }
    ]
    const result = analyzeSettlement(members4, expenses4)
    const alice = result.members.find(m => m.memberId === 'A')
    // A's relations: B(100 flow), C(100), D(100+100=200)
    // 200 > 100, so D should be first
    const flowAmounts = alice.relations.map(r => r.iGave + r.theyGave)
    for (let i = 1; i < flowAmounts.length; i++) {
      expect(flowAmounts[i - 1]).toBeGreaterThanOrEqual(flowAmounts[i])
    }
  })

  it('includes why data with narrativeHint', () => {
    const result = analyzeSettlement(members, expenses)
    const alice = result.members.find(m => m.memberId === 'A')
    expect(alice.why).toBeDefined()
    expect(alice.why.isNetCreditor).toBe(true)
    expect(alice.why.maxCreditorName).toBeDefined()
    expect(alice.why.narrativeHint).toBeDefined()
  })

  it('includes time field in bill details for display', () => {
    const result = analyzeSettlement(members, expenses)
    const bob = result.members.find(m => m.memberId === 'B')
    const aBills = bob.peerPaidForMe
    expect(aBills.length).toBeGreaterThan(0)
    expect(aBills[0].time).toBeDefined()
    expect(aBills[0].beneficiaryCount).toBe(3)
  })

  it('member with zero balance has no tasks', () => {
    const result = analyzeSettlement(members, expenses)
    const bob = result.members.find(m => m.memberId === 'B')
    expect(bob.tasks).toEqual([])
  })
})
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/utils/__tests__/settlement.test.js`
Expected: analyzeSettlement 测试 FAIL — `analyzeSettlement is not defined`

- [ ] **Step 3: 实现 `analyzeSettlement`**

在 `src/utils/settlement.js` 中新增函数（放在 `calculateSettlement` 之后）：

```js
export function analyzeSettlement(members, expenses) {
  const settlement = calculateSettlement(members, expenses)

  const membersData = members.map(me => {
    let paid = 0
    let owed = 0

    // iPaidFor[peerId] = total cents I paid for this person
    // theyPaidForMe[peerId] = total cents they paid for me
    const iPaidFor = {}
    const theyPaidForMe = {}
    const iPaidForBills = {}
    const theyPaidForMeBills = {}

    for (const other of members) {
      if (other.id !== me.id) {
        iPaidFor[other.id] = 0
        theyPaidForMe[other.id] = 0
        iPaidForBills[other.id] = []
        theyPaidForMeBills[other.id] = []
      }
    }

    for (const exp of expenses) {
      const myShare = shareOf(exp, me.id)
      owed += myShare

      if (exp.payerId === me.id) {
        paid += exp.amount
        for (const other of exp.beneficiaryIds) {
          if (other !== me.id) {
            const s = shareOf(exp, other)
            iPaidFor[other] += s
            iPaidForBills[other].push({
              expenseId: exp.id,
              purpose: exp.purpose,
              totalAmount: exp.amount,
              share: s,
              beneficiaryCount: exp.beneficiaryIds.length,
              time: fmtTime(exp.createdAt)
            })
          }
        }
      } else if (exp.beneficiaryIds.includes(me.id)) {
        const payer = exp.payerId
        theyPaidForMe[payer] += myShare
        theyPaidForMeBills[payer].push({
          expenseId: exp.id,
          purpose: exp.purpose,
          totalAmount: exp.amount,
          share: myShare,
          payerName: members.find(m => m.id === payer)?.name || '',
          beneficiaryCount: exp.beneficiaryIds.length,
          time: fmtTime(exp.createdAt)
        })
      }
    }

    const balance = Math.round(paid - owed)

    // Tasks from transactions
    const tasks = settlement.transactions
      .filter(t => t.fromId === me.id || t.toId === me.id)
      .map(t => ({
        fromId: t.fromId,
        fromName: t.fromName,
        toId: t.toId,
        toName: t.toName,
        amount: t.amount,
        direction: t.fromId === me.id ? 'out' : 'in'
      }))

    // Relations
    const relations = members
      .filter(o => o.id !== me.id)
      .map(o => ({
        peerId: o.id,
        peerName: o.name,
        iPaidForPeer: iPaidForBills[o.id] || [],
        peerPaidForMe: theyPaidForMeBills[o.id] || [],
        iGave: Math.round(iPaidFor[o.id] || 0),
        theyGave: Math.round(theyPaidForMe[o.id] || 0),
        net: Math.round((iPaidFor[o.id] || 0) - (theyPaidForMe[o.id] || 0))
      }))
      .sort((a, b) => (b.iGave + b.theyGave) - (a.iGave + a.theyGave))

    // Why data
    const netCard = {
      isPositive: balance >= 0,
      paid: Math.round(paid),
      owed: Math.round(owed),
      balance: Math.round(balance)
    }

    const why = {
      isNetCreditor: balance > 0,
      isNetDebtor: balance < 0,
      isEven: balance === 0,
      totalPaidForOthers: Math.round(Object.values(iPaidFor).reduce((s, v) => s + v, 0)),
      totalOthersPaidForMe: Math.round(Object.values(theyPaidForMe).reduce((s, v) => s + v, 0)),
      maxCreditorName: settlement.memberBalances
        .filter(b => b.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .pop()?.memberName || '',
      maxDebtorName: settlement.memberBalances
        .filter(b => b.balance < 0)
        .sort((a, b) => a.balance - b.balance)
        .pop()?.memberName || ''
    }
    why.narrativeHint = why.isNetCreditor
      ? why.totalPaidForOthers > why.totalOthersPaidForMe * 2 ? 'major_creditor' : 'creditor'
      : why.isNetDebtor ? 'debtor' : 'even'

    return {
      memberId: me.id,
      memberName: me.name,
      netCard,
      tasks,
      relations,
      why
    }
  })

  return {
    memberBalances: settlement.memberBalances,
    transactions: settlement.transactions,
    members: membersData
  }
}

function fmtTime(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/utils/__tests__/settlement.test.js`
Expected: 所有 analyzeSettlement 测试 PASS，已有测试保持绿色

- [ ] **Step 5: Commit**

```bash
git add src/utils/settlement.js src/utils/__tests__/settlement.test.js
git commit -m "feat: add analyzeSettlement — per-member breakdown with relations and why data"
```

---

### Task 4: 重写 DetailView.vue — 原型完整交互

**Files:**
- Modify: `src/views/DetailView.vue`

**Interfaces:**
- Consumes: `useTripStore().trip`, `analyzeSettlement(members, expenses)` from `../utils/settlement`
- Produces: 完整 per-member 结算依据页面

- [ ] **Step 1: 替换 script 部分**

```js
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { analyzeSettlement } from '../utils/settlement'

const router = useRouter()
const { trip } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

const analysis = analyzeSettlement(trip.value.members, trip.value.expenses)
const activeMemberId = ref(analysis.members[0]?.memberId || '')

function money(cents) {
  return (cents / 100).toFixed(2)
}

function selectMember(id) {
  activeMemberId.value = id
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function isOpen(id) {
  return activeMemberId.value === id
}
</script>
```

- [ ] **Step 2: 替换 template 部分 — 票据头**

```html
<template>
  <div class="stage" v-if="trip">
    <div class="receipt-head">
      <div class="rh-top">
        <div>
          <div class="rh-title">结 算 依 据</div>
          <div class="rh-sub">SETTLEMENT · BREAKDOWN</div>
        </div>
        <div class="rh-stamp">已对账</div>
      </div>
      <div class="rh-meta">
        <span>旅行 · {{ trip.name }}</span>
        <span>{{ new Date().toLocaleDateString('zh-CN') }}</span>
      </div>
      <div class="rh-summary">
        <div class="rh-sum-item">
          <div class="rh-sum-label">总支出</div>
          <div class="rh-sum-val">¥{{ money(analysis.memberBalances.reduce((s, b) => s + b.paid, 0)) }}</div>
        </div>
        <div class="rh-sum-item">
          <div class="rh-sum-label">账单数</div>
          <div class="rh-sum-val small">{{ trip.expenses.length }}</div>
        </div>
        <div class="rh-sum-item">
          <div class="rh-sum-label">转账笔数</div>
          <div class="rh-sum-val small">{{ analysis.transactions.length }}</div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: 追加 tab 行模板**

```html
    <div class="tab-row">
      <button
        v-for="m in analysis.members"
        :key="m.memberId"
        :class="['tab', { active: isOpen(m.memberId) }]"
        @click="selectMember(m.memberId)"
      >
        <div class="tab-name">{{ m.memberName }}</div>
        <div class="tab-tag" :class="m.netCard.isPositive ? 'pos' : 'neg'">
          {{ m.netCard.isPositive ? '应收 ¥' + money(m.netCard.balance) : (m.netCard.balance < 0 ? '应付 ¥' + money(-m.netCard.balance) : '已平账') }}
        </div>
      </button>
    </div>
```

- [ ] **Step 4: 追加面板容器 + 净额卡片 + 任务条**

```html
    <div class="panels">
      <div v-for="m in analysis.members" :key="m.memberId" :class="['panel', { active: isOpen(m.memberId) }]">
        <div class="net-card">
          <div class="net-label">成员 · 净额</div>
          <div class="net-name">{{ m.memberName }}</div>
          <div :class="['net-amount', m.netCard.isPositive ? 'pos' : 'neg']">
            {{ m.netCard.isPositive ? '+' : '−' }}¥{{ money(Math.abs(m.netCard.balance)) }}<span class="unit">元</span>
          </div>
          <div class="net-foot">
            <span>已支付 ¥{{ money(m.netCard.paid) }}</span>
            <span>应承担 ¥{{ money(m.netCard.owed) }}</span>
          </div>
        </div>

        <div v-if="m.tasks.length === 0" class="task-bar">
          <div>
            <div class="task-label">转账任务</div>
            <div class="task-item" style="color:var(--ink-soft)">已平账，无需转账</div>
          </div>
        </div>
        <div v-else :class="['task-bar', m.netCard.isPositive ? 'recv' : 'pay']">
          <div>
            <div class="task-label">{{ m.netCard.isPositive ? '应收来源' : '应付去向' }}</div>
            <div class="task-list">
              <div v-for="t in m.tasks" :key="t.fromId + t.toId" class="task-item">
                <span class="who">{{ t.fromName }}</span>
                <span class="arr">→</span>
                <span class="who">{{ t.toName }}</span>
                <span :class="['amt', t.direction === 'out' ? 'neg' : 'pos']" style="float:right">
                  {{ t.direction === 'out' ? '-' : '+' }}¥{{ money(t.amount) }}
                </span>
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 5: 追加往来关系区 + 关系卡片**

```html
        <div class="sec-title">
          <span class="bar"></span>
          <h2>与 他 人 往 来</h2>
          <span class="num">{{ m.relations.length }} 方</span>
          <span class="bar"></span>
        </div>

        <div
          v-for="r in m.relations"
          :key="r.peerId"
          :class="['rel-card', { open: expandedRel[m.memberId + '-' + r.peerId] }]"
        >
          <div
            class="rel-head"
            @click="toggleRel(m.memberId, r.peerId)"
          >
            <div class="rel-avatar" :style="{ background: avatarColor(r.peerName) }">{{ r.peerName[0] }}</div>
            <div class="rel-mid">
              <div class="rel-name">与 {{ r.peerName }} 的往来</div>
              <div class="rel-sub">我垫付 ¥{{ money(r.iGave) }} · Ta 垫付 ¥{{ money(r.theyGave) }}</div>
            </div>
            <div :class="['rel-net', r.net > 0 ? 'pos' : (r.net < 0 ? 'neg' : '')]">
              <span class="lbl">{{ r.net > 0 ? 'Ta 应付我' : (r.net < 0 ? '我 应付 Ta' : '已两清') }}</span>
              {{ r.net !== 0 ? (r.net > 0 ? '+' : '') + money(Math.abs(r.net)) : '¥0.00' }}
            </div>
            <svg class="rel-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </div>
          <div class="rel-body">
            <div class="rel-inner">
              <template v-if="r.iPaidForPeer.length">
                <div class="flow-row">
                  <span class="flow-tag pay">我替 Ta 垫付</span>
                  <span class="flow-amt neg">−¥{{ money(r.iGave) }}</span>
                </div>
                <div class="bill-list">
                  <div v-for="b in r.iPaidForPeer" :key="b.expenseId" class="bill">
                    <div class="bill-l">
                      <div class="bill-purpose">{{ b.purpose }}</div>
                      <div class="bill-meta">{{ b.time }} · 我付款 · {{ b.beneficiaryCount }}人分摊</div>
                    </div>
                    <div class="bill-share">
                      −¥{{ money(b.share) }}<span class="of"> /¥{{ money(b.totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <template v-if="r.peerPaidForMe.length">
                <div class="flow-row">
                  <span class="flow-tag recv">Ta 替我垫付</span>
                  <span class="flow-amt pos">+¥{{ money(r.theyGave) }}</span>
                </div>
                <div class="bill-list">
                  <div v-for="b in r.peerPaidForMe" :key="b.expenseId" class="bill">
                    <div class="bill-l">
                      <div class="bill-purpose">{{ b.purpose }}</div>
                      <div class="bill-meta">{{ b.time }} · {{ b.payerName }}付款 · {{ b.beneficiaryCount }}人分摊</div>
                    </div>
                    <div class="bill-share">
                      +¥{{ money(b.share) }}<span class="of"> /¥{{ money(b.totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <div v-if="!r.iPaidForPeer.length && !r.peerPaidForMe.length" style="color:var(--ink-soft);font-size:13px;padding:4px 0">无往来账单</div>
            </div>
          </div>
        </div>
```

- [ ] **Step 6: 追加 Why 解释卡片**

Why 文案根据 `m.why.narrativeHint` 动态选择模板，覆盖四种情况：

```html
        <div v-if="m.why.narrativeHint !== 'even'" class="why-card">
          <div class="why-title">{{ whyTitle(m) }}</div>
          <div class="why-text" v-html="whyText(m)"></div>
        </div>
```

添加 `whyTitle` 和 `whyText` 函数到 `<script setup>`：

```js
function whyTitle(m) {
  const hint = m.why.narrativeHint
  if (hint === 'major_creditor') return '为什么所有人都付给我？'
  if (hint === 'creditor') return '为什么我会收到转账？'
  if (m.tasks.length === 1) return `为什么我只付给 ${m.tasks[0].toName}？`
  return '为什么我的转账方案是这样的？'
}

function whyText(m) {
  const w = m.why
  const balance = Math.abs(m.netCard.balance)
  if (w.isNetCreditor) {
    return `我替他人垫付 <span class="pos">¥${money(w.totalPaidForOthers)}</span>，他人仅替我垫付 ¥${money(w.totalOthersPaidForMe)}。净应收 <span class="pos">+¥${money(balance)}</span>，所有债务人都直接对我结算。`
  }
  const creditors = m.tasks.map(t => `付给 ${t.toName} ¥${money(t.amount)}`).join('　')
  return `我共消费 <strong>¥${money(m.netCard.owed)}</strong>，支付 ¥${money(m.netCard.paid)}，净应付 <strong>−¥${money(balance)}</strong>。系统做<strong>净额抵消</strong>后，我直接付给最终债权人。`
}
```

- [ ] **Step 7: 追加算法脚注 + 关闭标签**

```html
        <div class="algo-foot">
          <strong>净额抵消 · 贪心最小转账</strong><br>
          每人净额 = 总支付 − 总应承担 ｜ 债权人与债务人对冲，最少转账笔数
        </div>
      </div>
    </div>

    <button class="btn-back-bottom" @click="router.push('/settlement')">← 返回结算</button>
  </div>
</template>
```

- [ ] **Step 8: 替换 style 部分**

完整替换 scoped CSS（包含原型所有样式类）：

```css
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
.rh-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed var(--rule); padding-bottom: 12px; }
.rh-title { font-family: var(--font-title); font-weight: 900; font-size: 22px; letter-spacing: 2px; }
.rh-sub { font-size: 11px; color: var(--ink-soft); letter-spacing: 1px; margin-top: 2px; }
.rh-stamp {
  border: 1.5px solid var(--vermilion); color: var(--vermilion);
  font-family: var(--font-title); font-weight: 700; font-size: 11px;
  padding: 4px 8px; border-radius: 3px; transform: rotate(4deg);
  letter-spacing: 1px; opacity: .85;
}
.rh-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); margin-top: 10px; font-family: var(--font-mono); }
.rh-summary { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 14px; border-top: 1px solid var(--rule); padding-top: 12px; }
.rh-sum-item { text-align: center; border-right: 1px dashed var(--rule); }
.rh-sum-item:last-child { border-right: none; }
.rh-sum-label { font-size: 10px; color: var(--ink-soft); letter-spacing: 1px; }
.rh-sum-val { font-family: var(--font-mono); font-weight: 700; font-size: 16px; margin-top: 2px; }
.rh-sum-val.small { font-size: 14px; }

/* tabs */
.tab-row { display: flex; gap: 6px; margin-top: 18px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.tab-row::-webkit-scrollbar { display: none; }
.tab {
  flex: 1; min-width: 0; background: #fffdf3; border: 1px solid var(--rule);
  border-radius: 8px; padding: 10px 6px; text-align: center; cursor: pointer;
  transition: all .2s; font: inherit;
}
.tab.active { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
.tab .tab-name { font-family: var(--font-title); font-weight: 700; font-size: 16px; }
.tab .tab-tag { font-family: var(--font-mono); font-size: 10px; margin-top: 3px; letter-spacing: .5px; }
.tab.active .tab-name { color: #fbf6e8; }
.tab .pos { color: var(--moss); }
.tab .neg { color: var(--vermilion); }
.tab.active .pos, .tab.active .neg { color: inherit; opacity: .85; }

/* panels */
.panels { margin-top: 14px; }
.panel { display: none; animation: fade .35s ease; }
.panel.active { display: block; }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* net card */
.net-card {
  border: 1px solid var(--rule); background: #fbf6e8; border-radius: 10px;
  padding: 18px 16px; box-shadow: var(--shadow); position: relative; overflow: hidden;
}
.net-card::after { content: ""; position: absolute; right: -30px; top: -30px; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, rgba(43,58,103,.06), transparent 70%); }
.net-label { font-size: 11px; color: var(--ink-soft); letter-spacing: 2px; }
.net-name { font-family: var(--font-title); font-weight: 900; font-size: 28px; margin-top: 2px; }
.net-amount { font-family: var(--font-mono); font-weight: 700; font-size: 34px; margin-top: 8px; letter-spacing: -1px; }
.net-amount.pos { color: var(--moss); }
.net-amount.neg { color: var(--vermilion); }
.net-amount .unit { font-size: 14px; font-weight: 500; margin-left: 4px; opacity: .7; }
.net-foot {
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--rule);
  font-size: 11px; color: var(--ink-soft); font-family: var(--font-mono);
  display: flex; justify-content: space-between;
}

/* task bar */
.task-bar {
  margin-top: 12px; border: 1px solid var(--rule); background: #fffdf3;
  border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
}
.task-bar.recv { border-left: 3px solid var(--moss); }
.task-bar.pay { border-left: 3px solid var(--vermilion); }
.task-label { font-size: 11px; color: var(--ink-soft); letter-spacing: 1px; }
.task-list { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.task-item { font-family: var(--font-mono); font-weight: 600; font-size: 14px; }
.task-item .arr { color: var(--ink-faint); margin: 0 6px; }
.task-item .who { font-family: var(--font-title); font-weight: 700; }
.task-item .amt.pos { color: var(--moss); }
.task-item .amt.neg { color: var(--vermilion); }

/* section title */
.sec-title { display: flex; align-items: center; gap: 10px; margin: 22px 4px 12px; }
.sec-title .bar { flex: 1; height: 1px; background: var(--rule); }
.sec-title h2 { font-family: var(--font-title); font-weight: 700; font-size: 15px; letter-spacing: 2px; color: var(--ink); }
.sec-title .num { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); }

/* relation cards */
.rel-card {
  border: 1px solid var(--rule); background: #fbf6e8; border-radius: 10px;
  margin-bottom: 10px; overflow: hidden; box-shadow: var(--shadow);
}
.rel-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; }
.rel-avatar {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-title); font-weight: 900; font-size: 16px; color: #fbf6e8;
}
.rel-mid { flex: 1; min-width: 0; }
.rel-name { font-family: var(--font-title); font-weight: 700; font-size: 15px; }
.rel-sub { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); margin-top: 2px; }
.rel-net { text-align: right; font-family: var(--font-mono); font-weight: 700; font-size: 15px; }
.rel-net.pos { color: var(--moss); }
.rel-net.neg { color: var(--vermilion); }
.rel-net .lbl { font-size: 9px; color: var(--ink-soft); font-weight: 400; letter-spacing: 1px; display: block; }
.rel-toggle { width: 18px; height: 18px; color: var(--ink-faint); transition: transform .25s; flex-shrink: 0; }
.rel-card.open .rel-toggle { transform: rotate(90deg); }
.rel-body { max-height: 0; overflow: hidden; transition: max-height .35s ease; background: linear-gradient(180deg, #f8f0d8, var(--paper-2)); }
.rel-card.open .rel-body { max-height: 600px; }
.rel-inner { padding: 6px 16px 14px; border-top: 1px dashed var(--rule); }

/* bill rows */
.flow-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-size: 12px; }
.flow-row + .flow-row { border-top: 1px dotted rgba(201,184,150,.6); }
.flow-tag { font-family: var(--font-title); font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 3px; letter-spacing: 1px; }
.flow-tag.pay { background: rgba(181,75,58,.12); color: var(--vermilion); }
.flow-tag.recv { background: rgba(74,107,58,.14); color: var(--moss); }
.flow-amt { font-family: var(--font-mono); font-weight: 600; font-size: 13px; }
.flow-amt.pos { color: var(--moss); }
.flow-amt.neg { color: var(--vermilion); }

.bill-list { margin-top: 8px; }
.bill { display: flex; justify-content: space-between; align-items: flex-start; padding: 7px 0; font-size: 12px; border-top: 1px dotted rgba(201,184,150,.5); }
.bill:first-child { border-top: none; }
.bill-l { flex: 1; min-width: 0; }
.bill-purpose { font-weight: 500; font-size: 12.5px; }
.bill-meta { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); margin-top: 2px; }
.bill-share { font-family: var(--font-mono); font-weight: 600; font-size: 13px; color: var(--ink); }
.bill-share .of { color: var(--ink-faint); font-weight: 400; font-size: 10px; }

/* why card */
.why-card {
  margin-top: 18px; border: 1px solid var(--rule); border-radius: 10px;
  background: linear-gradient(180deg, #fbf6e8, var(--paper));
  padding: 16px; box-shadow: var(--shadow); position: relative;
}
.why-card::before {
  content: "注"; position: absolute; top: -9px; left: 14px;
  background: var(--ink); color: #fbf6e8; font-family: var(--font-title);
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 3px; letter-spacing: 2px;
}
.why-title { font-family: var(--font-title); font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.why-text { font-size: 12.5px; line-height: 1.7; color: var(--ink); }
.why-text strong { font-family: var(--font-mono); color: var(--vermilion); }
.why-text .pos { font-family: var(--font-mono); color: var(--moss); font-weight: 600; }

/* algo foot */
.algo-foot {
  margin-top: 22px; padding: 14px; border-top: 1px dashed var(--rule);
  font-size: 10.5px; color: var(--ink-soft); line-height: 1.7;
  text-align: center; font-family: var(--font-mono);
}
.algo-foot strong { color: var(--ink); font-family: var(--font-title); font-weight: 700; }

.btn-back-bottom {
  display: block; margin: 24px auto 0; padding: 12px 24px;
  font-size: 14px; color: var(--ink); background: transparent;
  border: 1px dashed var(--rule); border-radius: 8px; cursor: pointer;
  font-family: var(--font-title);
}
```

- [ ] **Step 4 补充: 在 `<script setup>` 中添加展开状态管理和颜色分配**

在 script 区块添加：

```js
const expandedRel = ref({})

function toggleRel(memberId, peerId) {
  const key = memberId + '-' + peerId
  expandedRel.value[key] = !expandedRel.value[key]
}

const avatarColors = ['#2b3a67', '#7a5c3a', '#4a6b3a', '#a87c2c', '#b54b3a']
function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}
```

- [ ] **Step 9: 运行全部测试确保不被破坏**

Run: `npx vitest run`
Expected: 31 tests PASS (settlement tests 保持，trip tests 保持)

- [ ] **Step 10: Commit**

```bash
git add src/views/DetailView.vue
git commit -m "feat: rewrite DetailView with per-member settlement breakdown"
```

---

### Task 5: SettlementView 风格改造

**Files:**
- Modify: `src/views/SettlementView.vue`

**Interfaces:**
- Consumes: `useTripStore().trip`, `calculateSettlement(members, expenses)`

- [ ] **Step 1: 替换 style 部分**

保持 template 和 script 不变，只替换 `<style scoped>` 块：

```css
.settlement-page { padding: 18px 16px; max-width: 430px; margin: 0 auto; }
.page-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  border-bottom: 1px dashed var(--rule); padding-bottom: 12px;
}
.page-header h1 { font-family: var(--font-title); font-size: 20px; }
.btn-back {
  padding: 6px 12px; font-size: 14px; border: 1px solid var(--rule);
  background: #fffdf3; cursor: pointer; border-radius: 6px;
  font-family: var(--font-body); color: var(--ink);
}
.summary-card {
  background: linear-gradient(180deg, #fbf6e8, var(--paper));
  border: 1px solid var(--rule); border-radius: 10px;
  padding: 16px; margin-bottom: 20px; box-shadow: var(--shadow);
}
.summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
.summary-row strong { font-family: var(--font-mono); }
.section { margin-bottom: 24px; }
.section h2 { font-family: var(--font-title); font-size: 15px; margin-bottom: 12px; letter-spacing: 2px; }
.flat { color: var(--moss); font-size: 15px; padding: 12px; background: #fffdf3; border-radius: 8px; border: 1px solid var(--rule); }
.empty { color: var(--ink-faint); text-align: center; padding: 40px 0; }
.tx-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; background: #fffdf3; border: 1px solid var(--rule);
  border-radius: 8px; margin-bottom: 8px;
}
.tx-amount { font-family: var(--font-mono); font-weight: 700; font-size: 18px; color: var(--indigo); }
.tx-parties { display: flex; align-items: center; gap: 6px; }
.from { font-family: var(--font-title); color: var(--vermilion); font-weight: 700; }
.to { font-family: var(--font-title); color: var(--moss); font-weight: 700; }
.arrow { margin: 0 4px; color: var(--ink-faint); }
.balance-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; background: #fffdf3; border: 1px solid var(--rule);
  border-radius: 8px; margin-bottom: 6px;
}
.balance-name { font-family: var(--font-title); font-weight: 700; font-size: 15px; }
.balance-detail { font-size: 11px; color: var(--ink-soft); font-family: var(--font-mono); }
.balance-net { font-family: var(--font-mono); font-weight: 700; font-size: 16px; }
.positive { color: var(--moss); }
.negative { color: var(--vermilion); }
.btn-link {
  width: 100%; padding: 12px; font-size: 15px; color: var(--ink);
  background: transparent; border: 1px dashed var(--rule); border-radius: 8px;
  cursor: pointer; font-family: var(--font-title);
}
```

- [ ] **Step 2: 验证测试通过**

Run: `npx vitest run`
Expected: 31 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/SettlementView.vue
git commit -m "style: apply paper-texture theme to SettlementView"
```

---

### Task 6: ExpenseView 风格改造

**Files:**
- Modify: `src/views/ExpenseView.vue`

- [ ] **Step 1: 替换 style 部分**

```css
.expense-page { padding: 16px; max-width: 430px; margin: 0 auto; padding-bottom: 80px; }
.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px; border-bottom: 1px dashed var(--rule); padding-bottom: 12px;
}
.page-header h1 { font-family: var(--font-title); font-size: 20px; }
.header-actions { display: flex; gap: 6px; }
.header-actions button {
  padding: 6px 12px; font-size: 13px; border: 1px solid var(--rule);
  border-radius: 6px; background: #fffdf3; cursor: pointer;
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
  border-radius: 8px; resize: vertical; background: #fffdf3; font-family: var(--font-mono);
}
.dialog-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.dialog-actions button { padding: 10px 20px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
.dialog-actions .btn-cancel { background: var(--paper-2); color: var(--ink); }
.dialog-actions .btn-primary { background: var(--ink); color: #fbf6e8; }
.error { color: var(--vermilion); font-size: 13px; margin-top: 6px; }
.success { color: var(--moss); font-size: 13px; margin-top: 6px; }
```

- [ ] **Step 2: 验证 + Commit**

```bash
npx vitest run
git add src/views/ExpenseView.vue
git commit -m "style: apply paper-texture theme to ExpenseView"
```

---

### Task 7: InitView 风格改造

**Files:**
- Modify: `src/views/InitView.vue`

- [ ] **Step 1: 替换 style**

```css
.init-page { padding: 24px 16px; max-width: 430px; margin: 0 auto; }
h1 { font-family: var(--font-title); font-size: 24px; margin-bottom: 4px; }
.subtitle { color: var(--ink-soft); font-size: 14px; margin-bottom: 24px; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--ink-soft); }
input[type="text"] {
  width: 100%; padding: 10px 12px; font-size: 16px;
  border: 1px solid var(--rule); border-radius: 8px;
  background: #fffdf3; color: var(--ink); font-family: var(--font-body);
}
.counter { display: flex; align-items: center; gap: 16px; }
.counter button {
  width: 40px; height: 40px; font-size: 20px; border: 1px solid var(--rule);
  border-radius: 8px; background: #fffdf3; cursor: pointer; color: var(--ink);
}
.counter button:disabled { opacity: 0.4; cursor: default; }
.counter span { font-size: 20px; font-weight: 600; min-width: 30px; text-align: center; font-family: var(--font-mono); }
.member-names { display: flex; flex-direction: column; gap: 8px; }
.btn-primary {
  width: 100%; padding: 14px; font-size: 18px; font-weight: 600;
  color: #fbf6e8; background: var(--ink); border: none; border-radius: 8px;
  cursor: pointer; font-family: var(--font-title);
}
```

- [ ] **Step 2: 验证 + Commit**

```bash
npx vitest run
git add src/views/InitView.vue
git commit -m "style: apply paper-texture theme to InitView"
```

---

### Task 8: ExpenseForm 风格改造

**Files:**
- Modify: `src/components/ExpenseForm.vue`

- [ ] **Step 1: 替换 style**

```css
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
```

- [ ] **Step 2: 验证 + Commit**

```bash
npx vitest run
git add src/components/ExpenseForm.vue
git commit -m "style: apply paper-texture theme to ExpenseForm"
```

---

### Task 9: ExpenseList 风格改造

**Files:**
- Modify: `src/components/ExpenseList.vue`

- [ ] **Step 1: 替换 style**

```css
.expense-list { padding: 16px 0; }
.expense-list h2 { font-family: var(--font-title); font-size: 18px; margin-bottom: 12px; }
.empty { color: var(--ink-faint); font-size: 15px; text-align: center; padding: 32px 0; }
.expense-item {
  padding: 12px; background: #fffdf3; border-radius: 8px;
  margin-bottom: 8px; border: 1px solid var(--rule);
}
.item-main { display: flex; justify-content: space-between; margin-bottom: 4px; }
.item-purpose { font-weight: 600; }
.item-amount { color: var(--vermilion); font-weight: 600; font-family: var(--font-mono); }
.item-meta { font-size: 13px; color: var(--ink-soft); display: flex; justify-content: space-between; }
.item-actions { margin-top: 8px; display: flex; gap: 8px; }
.item-actions button {
  padding: 6px 14px; font-size: 13px; border: 1px solid var(--rule);
  border-radius: 6px; background: #fffdf3; cursor: pointer; color: var(--ink);
}
.item-actions .btn-delete {
  color: var(--vermilion); border-color: rgba(181,75,58,.3); background: rgba(181,75,58,.08);
}
.item-note { font-size: 12px; color: var(--ink-faint); margin-top: 4px; }
```

- [ ] **Step 2: 验证 + Commit**

```bash
npx vitest run
git add src/components/ExpenseList.vue
git commit -m "style: apply paper-texture theme to ExpenseList"
```

---

### Task 10: MemberSelector + ConfirmDialog 风格改造

**Files:**
- Modify: `src/components/MemberSelector.vue`
- Modify: `src/components/ConfirmDialog.vue`

- [ ] **Step 1: 读取 MemberSelector.vue**

- [ ] **Step 2: 替换 MemberSelector style**

当前 MemberSelector 样式在 `src/components/MemberSelector.vue:42-55`。完整替换为：

```css
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
```

- [ ] **Step 3: 替换 ConfirmDialog style**

```css
.overlay {
  position: fixed; inset: 0; background: rgba(28,25,23,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog {
  background: var(--paper); border-radius: 12px; padding: 24px;
  width: 300px; max-width: 90vw; border: 1px solid var(--rule);
  box-shadow: var(--shadow);
}
.dialog h3 { font-family: var(--font-title); margin-bottom: 8px; }
.dialog p { color: var(--ink-soft); font-size: 14px; margin-bottom: 20px; }
.dialog-actions { display: flex; gap: 12px; justify-content: flex-end; }
.btn-cancel, .btn-danger {
  padding: 10px 20px; font-size: 15px; border: none; border-radius: 8px;
  cursor: pointer; min-height: 44px;
}
.btn-cancel { background: var(--paper-2); color: var(--ink); }
.btn-danger { background: var(--vermilion); color: #fff; }
```

- [ ] **Step 4: 验证 + Commit**

```bash
npx vitest run
git add src/components/MemberSelector.vue src/components/ConfirmDialog.vue
git commit -m "style: apply paper-texture theme to MemberSelector and ConfirmDialog"
```

---

### Task 11: 最终验证 — 全量测试 + 浏览器预览

- [ ] **Step 1: 运行全量测试**

Run: `npx vitest run`
Expected: 31 tests PASS, 0 failures

- [ ] **Step 2: 启动开发服务器并浏览器验证**

Run: `npx vite --port 5173`
在浏览器中遍历所有 4 个页面，确认：
- 纸张纹理背景在所有页面一致
- DetailView 的 tab 切换、展开/折叠交互正常
- 所有表单控件使用新颜色体系
- 移动端 375px 宽度下无溢出

- [ ] **Step 3: Commit 若有残留改动**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, theme consistent"
```
