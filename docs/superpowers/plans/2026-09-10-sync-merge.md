# 合并式同步（sync-merge）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 v1 整包手动同步演进为服务端逐条合并式同步：单一「同步」按钮双向合并（按记录 id + LWW）、删除墓碑传播、两阶段去重确认、记账变更/刷新自动同步 + 右上角状态指示、InitView 加入旅行入口。

**Architecture:** 合并算法 `mergeTrips` 为纯函数（云函数 core.js，TDD 全矩阵），云函数新增 `mode:'merge'` 分支（原子 读→合→写，保留旧 GET/POST 端点过渡）；前端新增 `useSyncEngine` composable（串行队列 + 状态机 + 待确认队列，store 保持无网络），sync.js 客户端升级 v2（mergeSync + 前端去重匹配器），store 数据迁移 v2（记录 updatedAt + 墓碑 + 元数据时间戳），SyncDialog 改造（合并按钮 + 去重裁决视图 + joinOnly 模式）。

**Tech Stack:** 现有栈不变（Vue 3 / Vitest / CloudBase MCP）；前端仍零新增 npm 依赖。

**Spec:** `docs/superpowers/specs/2026-09-10-sync-merge-design.md`
**测试用例（已评审通过）:** `docs/测试用例-合并式同步.md`

## Global Constraints

- 前端**零新增 npm 依赖**；金额仍为整数分；结算算法不动
- 数据模型 v2：每条 expense 带 `updatedAt`（ISO Z 字符串，缺失时 backfill = createdAt）；`deletedIds: [{id, deletedAt}]` 墓碑；trip 带 `metaUpdatedAt`（缺失 backfill = createdAt）
- LWW 裁决：`updatedAt` 字符串比较（ISO Z 同格式，字典序=时间序）；**平局远端胜**（记录与元数据同规则）；墓碑 vs 记录：`record.updatedAt > tombstone.deletedAt` 时记录复活
- 去重四要素：`payerId` + `beneficiaryIds` **集合**相等（忽略顺序）+ `amount`（分）相等 + `purpose` 全等；只对**本次新到**记录检测（本地新增 vs 远端全部、远端新增 vs 本地全部）；已决策对不再出现在 duplicates
- 去重裁决规则（保留非新到方）：本地新增 vs 远端已有 → 保留远端（本地条不上云）；远端新增 vs 本地已有 → 保留本地（远端条加墓碑）；双端各自新增 → 保留 createdAt 早者，平局保留远端
- API：`POST /trip-sync` body 含 `mode:'merge'`；响应 `status: 'merged' | 'duplicates_found'`；`duplicates_found` 时服务端已写入无争议合并，**客户端不替换本地**；`revision` 仅有实际变更时 +1（canonical 比对）；`mode:'merge'` 且码不存在 → 用本地 payload 创建（revision 1）
- **旧端点保留**：`GET ?code=` 与无 `mode` 字段的旧 POST（v1 推送）在函数中保留，直到线上 H5 更新（本计划不删除）
- 自动同步：串行队列（同一时刻 ≤1 在途请求，触发时在途则置 pending 完成后补跑一次）；失败静默置错误态（无弹窗）；`duplicates_found` → 状态 `pending` + 待确认队列（内存，不持久化）
- 现有 91 个测试保持通过；测试用例文档中 P0/P1 用例须在对应任务中实现，P2（T-L05/06）合并后手动补
- UI 遵循原型纸质风格；SyncDialog/SyncStatus 视觉与现有组件一致
- 云函数部署沿用现有方式（manageFunctions updateFunctionCode + functionRootPath `cloudfunctions` 目录）；API Key 已在函数环境变量中，**不触碰、不轮换**

---

### Task 1: 合并核心算法 core.js 扩展（TDD）

**Files:**
- Modify: `cloudfunctions/trip-sync/core.js`
- Create: `cloudfunctions/trip-sync/__tests__/merge.test.js`

**Interfaces:**
- Consumes: 现有 core.js 导出（不动）
- Produces（新增 CommonJS 导出，Task 2 的 index.js 消费）:
  - `migrateTripToV2(trip) → tripV2`（backfill updatedAt/deletedIds/metaUpdatedAt，返回新对象不改入参）
  - `matchDuplicate(a, b) → boolean`（四要素）
  - `canonicalTrip(trip) → string`（键排序后的稳定序列化，用于 changed 比对）
  - `mergeTrips(localTrip, remoteTrip, dedupDecisions = [], nowIso) → { merged, duplicates, changed }`
  - `mergeTrips` 的 `duplicates` 元素：`{ local: <expense>, remote: <expense }`

- [ ] **Step 1: 写失败测试**

创建 `cloudfunctions/trip-sync/__tests__/merge.test.js`（覆盖 T-M01~M13、T-D09~D11 合并语义；时间用 `t1 < t2 < t3` 字典序递增的 ISO 字符串）：

```js
import { describe, it, expect } from 'vitest'
import { migrateTripToV2, matchDuplicate, mergeTrips, canonicalTrip } from '../core'

const t0 = '2026-09-10T00:00:00.000Z'
const t1 = '2026-09-10T01:00:00.000Z'
const t2 = '2026-09-10T02:00:00.000Z'
const t3 = '2026-09-10T03:00:00.000Z'
const NOW = '2026-09-10T04:00:00.000Z'

const mk = (id, over = {}) => ({
  id, purpose: '正餐', amount: 5000, payerId: 'm1',
  beneficiaryIds: ['m1', 'm2'], note: '', createdAt: t1, updatedAt: t1, ...over
})

const baseTrip = (expenses = [], deletedIds = [], over = {}) => ({
  name: '测试旅行', createdAt: t0, metaUpdatedAt: t0,
  members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }],
  expenses, deletedIds, ...over
})

const withIds = (ids) => ids.map((id) => mk(id))

describe('migrateTripToV2', () => {
  it('backfills updatedAt from createdAt for each expense', () => {
    const v1 = baseTrip([{ id: 'e1', purpose: 'x', amount: 100, payerId: 'm1', beneficiaryIds: ['m1'], note: '', createdAt: t1 }])
    const v2 = migrateTripToV2(v1)
    expect(v2.expenses[0].updatedAt).toBe(t1)
    expect(v1.expenses[0].updatedAt).toBeUndefined() // 不改入参
  })
  it('backfills deletedIds and metaUpdatedAt', () => {
    const v2 = migrateTripToV2({ name: 'x', members: [], expenses: [], createdAt: t0 })
    expect(v2.deletedIds).toEqual([])
    expect(v2.metaUpdatedAt).toBe(t0)
  })
  it('keeps existing v2 fields', () => {
    const v2 = migrateTripToV2(baseTrip([mk('e1', { updatedAt: t2 })], [{ id: 'e9', deletedAt: t2 }], { metaUpdatedAt: t2 }))
    expect(v2.expenses[0].updatedAt).toBe(t2)
    expect(v2.deletedIds).toEqual([{ id: 'e9', deletedAt: t2 }])
    expect(v2.metaUpdatedAt).toBe(t2)
  })
})

describe('matchDuplicate', () => {
  it('matches on all four factors', () => {
    expect(matchDuplicate(mk('a'), mk('b'))).toBe(true)
  })
  it('ignores beneficiary order (set equality)', () => {
    expect(matchDuplicate(mk('a'), mk('b', { beneficiaryIds: ['m2', 'm1'] }))).toBe(true)
  })
  it('rejects on any factor difference', () => {
    expect(matchDuplicate(mk('a'), mk('b', { amount: 5001 }))).toBe(false)
    expect(matchDuplicate(mk('a'), mk('b', { purpose: '甜点' }))).toBe(false)
    expect(matchDuplicate(mk('a'), mk('b', { payerId: 'm2' }))).toBe(false)
    expect(matchDuplicate(mk('a'), mk('b', { beneficiaryIds: ['m1'] }))).toBe(false)
    expect(matchDuplicate(mk('a'), mk('b', { beneficiaryIds: ['m1', 'm3'] }))).toBe(false)
  })
  it('note / createdAt / id differences do not affect matching', () => {
    expect(matchDuplicate(mk('a', { note: 'n', createdAt: t2 }), mk('b', { note: 'm', createdAt: t3 }))).toBe(true)
  })
})

describe('mergeTrips — record merge matrix (T-M01..M09)', () => {
  it('T-M01: local-only record is merged in', () => {
    const local = baseTrip([mk('e1'), mk('e2', { amount: 6000 })])
    const remote = baseTrip(withIds(['e1']))
    const { merged, duplicates } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(duplicates).toEqual([])
  })
  it('T-M02: remote-only record is merged in', () => {
    const local = baseTrip(withIds(['e1']))
    const remote = baseTrip([mk('e1'), mk('e3', { amount: 7000 })])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses.map((e) => e.id).sort()).toEqual(['e1', 'e3'])
  })
  it('T-M03: same id both edited, local newer wins', () => {
    const local = baseTrip([mk('e1', { note: 'local', updatedAt: t2 })])
    const remote = baseTrip([mk('e1', { note: 'remote', updatedAt: t1 })])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses[0].note).toBe('local')
  })
  it('T-M04: same id both edited, remote newer wins', () => {
    const local = baseTrip([mk('e1', { note: 'local', updatedAt: t1 })])
    const remote = baseTrip([mk('e1', { note: 'remote', updatedAt: t2 })])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses[0].note).toBe('remote')
  })
  it('T-M05: identical updatedAt → remote wins (deterministic)', () => {
    const local = baseTrip([mk('e1', { note: 'local' })])
    const remote = baseTrip([mk('e1', { note: 'remote' })])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses[0].note).toBe('remote')
  })
  it('T-M06: local delete propagates via tombstone', () => {
    const local = baseTrip([], [{ id: 'e1', deletedAt: t2 }])
    const remote = baseTrip(withIds(['e1']))
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses).toEqual([])
    expect(merged.deletedIds).toEqual([{ id: 'e1', deletedAt: t2 }])
  })
  it('T-M07: remote delete propagates to local', () => {
    const local = baseTrip(withIds(['e1']))
    const remote = baseTrip([], [{ id: 'e1', deletedAt: t2 }])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses).toEqual([])
  })
  it('T-M08: tombstone newer than record edit → stays deleted', () => {
    const local = baseTrip([], [{ id: 'e1', deletedAt: t2 }])
    const remote = baseTrip([mk('e1', { updatedAt: t1 })])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses).toEqual([])
  })
  it('T-M09: record edited after tombstone → resurrects', () => {
    const local = baseTrip([], [{ id: 'e1', deletedAt: t1 }])
    const remote = baseTrip([mk('e1', { note: 'new', updatedAt: t2 })])
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.expenses.map((e) => e.note)).toEqual(['new'])
  })
})

describe('mergeTrips — meta & idempotence (T-M10..M12)', () => {
  it('T-M10: meta LWW by metaUpdatedAt', () => {
    const local = baseTrip([], [], { name: '本地名', metaUpdatedAt: t2 })
    const remote = baseTrip([], [], { name: '远端名', metaUpdatedAt: t1 })
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.name).toBe('本地名')
    const r2 = mergeTrips(baseTrip([], [], { name: '本地名', metaUpdatedAt: t1 }), baseTrip([], [], { name: '远端名', metaUpdatedAt: t2 }), [], NOW)
    expect(r2.merged.name).toBe('远端名')
  })
  it('T-M11: meta tie → remote wins', () => {
    const local = baseTrip([], [], { name: '本地名' })
    const remote = baseTrip([], [], { name: '远端名' })
    const { merged } = mergeTrips(local, remote, [], NOW)
    expect(merged.name).toBe('远端名')
  })
  it('T-M12: no-change merge → changed=false, idempotent', () => {
    const remote = baseTrip(withIds(['e1', 'e2']), [{ id: 'e9', deletedAt: t2 }])
    const { merged, changed } = mergeTrips(remote, remote, [], NOW)
    expect(changed).toBe(false)
    expect(canonicalTrip(merged)).toBe(canonicalTrip(remote))
  })
})

describe('mergeTrips — dedup detection & decisions (T-D01..D11)', () => {
  it('T-D01: local-new duplicates remote-existing → candidate; decision duplicate keeps remote, local not merged', () => {
    const R1 = mk('r1')
    const L2 = mk('l2') // 四要素同 r1，不同 id
    const local = baseTrip([R1, L2].map((e) => ({ ...e })), [], {})
    const remote = baseTrip([{ ...R1 }])
    const phase1 = mergeTrips(local, remote, [], NOW)
    expect(phase1.duplicates).toEqual([{ local: L2, remote: R1 }])
    expect(phase1.merged.expenses.map((e) => e.id)).toEqual(['r1']) // 本地候选不上云
    expect(phase1.changed).toBe(false)
    const phase2 = mergeTrips(local, remote, [{ localId: 'l2', remoteId: 'r1', action: 'duplicate' }], NOW)
    expect(phase2.duplicates).toEqual([])
    expect(phase2.merged.expenses.map((e) => e.id)).toEqual(['r1'])
  })
  it('T-D02: remote-new duplicates local-existing → decision duplicate tombstones remote copy', () => {
    const L1 = mk('l1')
    const R3 = mk('r3')
    const local = baseTrip([{ ...L1 }])
    const remote = baseTrip([{ ...L1 }, { ...R3 }])
    const phase1 = mergeTrips(local, remote, [], NOW)
    expect(phase1.duplicates).toEqual([{ local: L1, remote: R3 }])
    expect(phase1.merged.expenses.map((e) => e.id)).toEqual(['l1']) // 远端候选被排除出 merged
    const phase2 = mergeTrips(local, remote, [{ localId: 'l1', remoteId: 'r3', action: 'duplicate' }], NOW)
    expect(phase2.merged.expenses.map((e) => e.id)).toEqual(['l1'])
    expect(phase2.merged.deletedIds).toEqual([{ id: 'r3', deletedAt: NOW }])
  })
  it('T-D03: both-new duplicates → keeps earlier createdAt, loser local excluded / loser remote tombstoned', () => {
    const L2 = mk('l2', { createdAt: t1, updatedAt: t1 })
    const R3 = mk('r3', { createdAt: t2, updatedAt: t2 })
    const local = baseTrip([{ ...L2 }])
    const remote = baseTrip([{ ...R3 }])
    const decisions = [{ localId: 'l2', remoteId: 'r3', action: 'duplicate' }]
    const keepLocal = mergeTrips(local, remote, decisions, NOW)
    expect(keepLocal.merged.expenses.map((e) => e.id)).toEqual(['l2']) // l2 createdAt 早，保留
    expect(keepLocal.merged.deletedIds).toEqual([{ id: 'r3', deletedAt: NOW }])
    const keepRemote = mergeTrips(
      baseTrip([{ ...mk('l2', { createdAt: t2, updatedAt: t2 }) }]),
      baseTrip([{ ...mk('r3', { createdAt: t1, updatedAt: t1 }) }]),
      decisions, NOW
    )
    expect(keepRemote.merged.expenses.map((e) => e.id)).toEqual(['r3'])
    expect(keepRemote.merged.deletedIds).toEqual([])
  })
  it('T-D04: both-new createdAt tie → remote kept', () => {
    const L2 = mk('l2')
    const R3 = mk('r3')
    const { merged } = mergeTrips(baseTrip([{ ...L2 }]), baseTrip([{ ...R3 }]),
      [{ localId: 'l2', remoteId: 'r3', action: 'duplicate' }], NOW)
    expect(merged.expenses.map((e) => e.id)).toEqual(['r3'])
  })
  it('T-D05: decision keep → both records merged', () => {
    const R1 = mk('r1')
    const L2 = mk('l2')
    const { merged, duplicates } = mergeTrips(baseTrip([{ ...R1 }, { ...L2 }]), baseTrip([{ ...R1 }]),
      [{ localId: 'l2', remoteId: 'r1', action: 'keep' }], NOW)
    expect(duplicates).toEqual([])
    expect(merged.expenses.map((e) => e.id).sort()).toEqual(['l2', 'r1'])
  })
  it('T-D06: one local-new matching multiple remote records yields multiple pairs', () => {
    const local = baseTrip([mk('l1', { amount: 999 }), mk('l2')])
    const remote = baseTrip([mk('r1'), mk('r4')])
    const { duplicates } = mergeTrips(local, remote, [], NOW)
    expect(duplicates.length).toBe(2) // l2↔r1, l2↔r4
  })
  it('T-D11: records present on both sides are never candidates', () => {
    const R1 = mk('r1'); const R2 = mk('r2')
    const both = baseTrip([{ ...R1 }, { ...R2 }])
    const { duplicates } = mergeTrips(both, both, [], NOW)
    expect(duplicates).toEqual([])
  })
  it('decided pairs are not re-reported and new decisions can arrive together', () => {
    const R1 = mk('r1'); const L2 = mk('l2')
    const local = baseTrip([{ ...R1 }, { ...L2 }, mk('l3', { amount: 8000 })])
    const remote = baseTrip([{ ...R1 }])
    const p1 = mergeTrips(local, remote, [], NOW)
    expect(p1.duplicates.length).toBe(1)
    const p2 = mergeTrips(local, remote, [{ localId: 'l2', remoteId: 'r1', action: 'keep' }], NOW)
    expect(p2.duplicates).toEqual([])
  })
})

describe('mergeTrips — mixed scenario (T-M13) & changed flag', () => {
  it('T-M13: mixed adds/edits/deletes both directions converge per rules', () => {
    const local = baseTrip([
      mk('keep1', { amount: 1000 }),                  // 双端同持不动
      mk('editA', { amount: 2000, note: 'local-win', updatedAt: t3 }),  // 同 id，本地新 → 本地胜
      mk('editB', { amount: 3000, note: 'local-lose', updatedAt: t1 }), // 同 id，远端新 → 远端胜
      mk('lnew1'), mk('lnew2'), mk('lnew3'),       // 本地新增（与远端新增四要素相同 → 候选）
    ], [{ id: 'ldel1', deletedAt: t2 }])            // 本地删除
    const remote = baseTrip([
      mk('keep1', { amount: 1000 }),
      mk('editA', { amount: 2000, note: 'remote', updatedAt: t2 }),
      mk('editB', { amount: 3000, note: 'remote-win', updatedAt: t2 }),
      mk('rnew1'), mk('rnew2'),                     // 远端新增（与本地新增四要素相同 → 候选）
    ], [{ id: 'rdel1', deletedAt: t2 }])            // 远端删除
    const { merged, duplicates, changed } = mergeTrips(local, remote, [], NOW)
    expect(duplicates.length).toBe(6) // lnew1-3 × rnew1-2 全部互为候选
    expect(changed).toBe(true)
    // 候选被排除出 merged，只保留无争议部分
    const ids = merged.expenses.map((e) => e.id)
    expect(ids).toEqual(['keep1', 'editA', 'editB'])
    const editA = merged.expenses.find((e) => e.id === 'editA')
    const editB = merged.expenses.find((e) => e.id === 'editB')
    expect(editA.note).toBe('local-win')
    expect(editB.note).toBe('remote-win')
    expect(merged.deletedIds.map((d) => d.id).sort()).toEqual(['ldel1', 'rdel1'])
  })
})

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run cloudfunctions/trip-sync/__tests__/merge.test.js
```

预期：FAIL，`migrateTripToV2 is not a function`（导出不存在）。

- [ ] **Step 3: 实现**

在 `cloudfunctions/trip-sync/core.js` 末尾（`module.exports` 之前）追加，并更新导出行：

```js
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k])
    return out
  }
  return value
}

function migrateTripToV2(trip) {
  const t = { ...trip }
  if (!Array.isArray(t.deletedIds)) t.deletedIds = []
  if (typeof t.metaUpdatedAt !== 'string') t.metaUpdatedAt = t.createdAt || '1970-01-01T00:00:00.000Z'
  if (!Array.isArray(t.expenses)) t.expenses = []
  t.expenses = t.expenses.map((e) => ({
    ...e,
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : (e.createdAt || '1970-01-01T00:00:00.000Z')
  }))
  return t
}

function matchDuplicate(a, b) {
  if (!a || !b) return false
  if (a.payerId !== b.payerId || a.amount !== b.amount || a.purpose !== b.purpose) return false
  if (!Array.isArray(a.beneficiaryIds) || !Array.isArray(b.beneficiaryIds)) return false
  if (a.beneficiaryIds.length !== b.beneficiaryIds.length) return false
  const setB = new Set(b.beneficiaryIds)
  return a.beneficiaryIds.every((id) => setB.has(id))
}

function canonicalTrip(trip) {
  const t = migrateTripToV2(trip)
  return JSON.stringify({
    name: t.name,
    members: [...t.members].map((m) => JSON.stringify(sortKeysDeep(m))).sort(),
    metaUpdatedAt: t.metaUpdatedAt,
    expenses: [...t.expenses].map((e) => JSON.stringify(sortKeysDeep(e))).sort(),
    deletedIds: [...t.deletedIds].map((d) => JSON.stringify(sortKeysDeep(d))).sort()
  })
}

function mergeTrips(localTrip, remoteTrip, dedupDecisions = [], nowIso) {
  const local = migrateTripToV2(localTrip)
  const remote = migrateTripToV2(remoteTrip)

  const decisionMap = new Map()
  for (const d of dedupDecisions) {
    if (d && typeof d.localId === 'string' && typeof d.remoteId === 'string' && d.localId && d.remoteId) {
      decisionMap.set(d.localId + '||' + d.remoteId, d.action === 'keep' ? 'keep' : 'duplicate')
    }
  }

  const localById = new Map(local.expenses.map((e) => [e.id, e]))
  const remoteById = new Map(remote.expenses.map((e) => [e.id, e]))
  const localNewIds = new Set([...localById.keys()].filter((id) => !remoteById.has(id)))
  const remoteNewIds = new Set([...remoteById.keys()].filter((id) => !localById.has(id)))

  // 墓碑并集（同 id 取 deletedAt 晚者）
  const tombstones = new Map()
  for (const d of [...remote.deletedIds, ...local.deletedIds]) {
    if (!d || typeof d.id !== 'string') continue
    const prev = tombstones.get(d.id)
    if (!prev || String(d.deletedAt || '') > String(prev.deletedAt || '')) tombstones.set(d.id, d)
  }

  // 候选检测：只对新到记录，已决策的对不再报
  const duplicates = []
  const pairSeen = new Set()
  const excludedLocal = new Set()
  const excludedRemote = new Set()
  const consider = (l, r) => {
    const key = l.id + '||' + r.id
    if (pairSeen.has(key) || decisionMap.has(key) || !matchDuplicate(l, r)) return
    pairSeen.add(key)
    duplicates.push({ local: l, remote: r })
    excludedLocal.add(l.id)
    excludedRemote.add(r.id)
  }
  for (const id of localNewIds) {
    const l = localById.get(id)
    for (const r of remote.expenses) consider(l, r)
  }
  for (const id of remoteNewIds) {
    const r = remoteById.get(id)
    for (const l of local.expenses) consider(l, r)
  }

  // 应用裁决（保留非新到方）
  const extraTombstones = []
  for (const [key, action] of decisionMap) {
    if (action !== 'duplicate') continue
    const [localId, remoteId] = key.split('||')
    const l = localById.get(localId)
    const r = remoteById.get(remoteId)
    if (!l || !r) continue
    const lNew = localNewIds.has(localId)
    const rNew = remoteNewIds.has(remoteId)
    if (lNew && rNew) {
      if (String(l.createdAt || '') < String(r.createdAt || '')) {
        // 本地 createdAt 早 → 保留本地条，远端条加墓碑
        excludedRemote.add(remoteId)
        extraTombstones.push({ id: remoteId, deletedAt: nowIso })
      } else {
        // 远端较早或平局 → 保留远端条，本地条不上云
        excludedLocal.add(localId)
      }
    } else if (lNew && !rNew) {
      excludedLocal.add(localId)
    } else if (!lNew && rNew) {
      excludedRemote.add(remoteId)
      extraTombstones.push({ id: remoteId, deletedAt: nowIso })
    }
    // 双端共存的对不会成为候选，防御性忽略
  }
  for (const t of extraTombstones) {
    const prev = tombstones.get(t.id)
    if (!prev || t.deletedAt > String(prev.deletedAt || '')) tombstones.set(t.id, t)
  }

  // 元数据 LWW（平局远端胜）
  const localMetaNewer = String(local.metaUpdatedAt) > String(remote.metaUpdatedAt)
  const metaSrc = localMetaNewer ? local : remote

  // 记录合并
  const mergedExpenses = []
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    let winner
    if (l && r) winner = String(l.updatedAt) > String(r.updatedAt) ? l : r // 平局远端胜
    else winner = l || r
    if (localNewIds.has(id) && excludedLocal.has(id)) continue
    if (remoteNewIds.has(id) && excludedRemote.has(id)) continue
    const ts = tombstones.get(id)
    if (ts && !(String(winner.updatedAt) > String(ts.deletedAt))) continue
    mergedExpenses.push(winner)
  }

  const merged = {
    name: metaSrc.name,
    members: metaSrc.members,
    createdAt: remote.createdAt || local.createdAt,
    metaUpdatedAt: metaSrc.metaUpdatedAt,
    expenses: mergedExpenses,
    deletedIds: [...tombstones.values()]
  }
  const changed = canonicalTrip(merged) !== canonicalTrip(remote)
  return { merged, duplicates, changed }
}
```

导出行改为：

```js
module.exports = { CODE_RE, MAX_PAYLOAD_BYTES, SCHEMA_VERSION, validateCode, normalizeCode, validatePayload, payloadBytes, decidePush, migrateTripToV2, matchDuplicate, canonicalTrip, mergeTrips }
```

- [ ] **Step 4: 运行确认通过 + 全量回归**

```bash
npx vitest run cloudfunctions/trip-sync/__tests__/merge.test.js
npx vitest run
```

预期：merge.test.js 全部 PASS（约 25 个用例）；全量 91 + 新增全过。

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/trip-sync/
git commit -m "feat: add merge core algorithm (LWW, tombstones, dedup) with test matrix"
```

---

### Task 2: 云函数 v2 端点 + 部署 + 冒烟

**Files:**
- Modify: `cloudfunctions/trip-sync/index.js`

**Interfaces:**
- Consumes: Task 1 的 `migrateTripToV2, mergeTrips`；现有 `normalizeCode, validatePayload, payloadBytes, decidePush`（旧端点用）
- Produces: `POST /trip-sync`（body 含 `mode:'merge'`）新语义（见 Global Constraints）；旧 GET / POST 行为完全不变；部署后端点 URL 不变（`https://playground-d0goyj2w0f42a96b8-1457342933.ap-shanghai.app.tcloudbase.com/trip-sync`）

- [ ] **Step 1: 实现 merge 分支**

修改 `cloudfunctions/trip-sync/index.js`：

1. require 行追加 `migrateTripToV2, mergeTrips`（从 `./core`）
2. 新增 handler（放在 `handlePost` 之后）：

```js
function resolveMemberName(payload, memberId) {
  const m = payload && Array.isArray(payload.members)
    ? payload.members.find((x) => x.id === memberId)
    : null
  return (m && typeof m.name === 'string') ? m.name.slice(0, 20) : '未知'
}

async function handleMerge(res, req, body) {
  const code = normalizeCode(body.code)
  if (!CODE_RE.test(code)) return sendJson(res, 400, { error: 'INVALID_CODE' })
  if (!validatePayload(body.payload)) return sendJson(res, 400, { error: 'INVALID_PAYLOAD' })
  if (payloadBytes(body.payload) > MAX_PAYLOAD_BYTES) return sendJson(res, 400, { error: 'PAYLOAD_TOO_LARGE' })

  const updatedBy = resolveMemberName(body.payload, body.myMemberId)
  const now = new Date().toISOString()
  let existing
  try {
    existing = await findDoc(code)
  } catch (e) {
    console.error('db read error:', e && e.message)
    return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
  }

  // 开启同步：码不存在 → 用本地 payload 创建
  if (!existing) {
    const payload = migrateTripToV2(body.payload)
    const record = { schemaVersion: 2, payload, revision: 1, updatedAt: now, updatedBy }
    try {
      await db.collection(COLLECTION).doc(code).set(record)
    } catch (e) {
      console.error('db write error:', e && e.message)
      return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
    }
    return sendJson(res, 200, { status: 'merged', payload, revision: 1 })
  }

  const remoteTrip = migrateTripToV2(existing.payload)
  const localTrip = migrateTripToV2(body.payload)
  const decisions = Array.isArray(body.dedupDecisions) ? body.dedupDecisions : []
  let result
  try {
    result = mergeTrips(localTrip, remoteTrip, decisions, now)
  } catch (e) {
    console.error('merge error:', e && e.message)
    return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
  }

  if (result.changed) {
    const record = {
      schemaVersion: 2,
      payload: result.merged,
      revision: (existing.revision || 0) + 1,
      updatedAt: now,
      updatedBy
    }
    try {
      await db.collection(COLLECTION).doc(code).set(record)
    } catch (e) {
      console.error('db write error:', e && e.message)
      return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
    }
    if (result.duplicates.length > 0) {
      return sendJson(res, 200, {
        status: 'duplicates_found',
        payload: result.merged,
        revision: record.revision,
        duplicates: result.duplicates
      })
    }
    return sendJson(res, 200, { status: 'merged', payload: result.merged, revision: record.revision })
  }

  // 无变化：不写库，revision 原样返回
  if (result.duplicates.length > 0) {
    return sendJson(res, 200, {
      status: 'duplicates_found',
      payload: result.merged,
      revision: existing.revision || 0,
      duplicates: result.duplicates
    })
  }
  return sendJson(res, 200, { status: 'merged', payload: result.merged, revision: existing.revision || 0 })
}
```

3. 修改 `handlePost` 的入口：在 `handlePost` 开头（readJsonBody 之前不可行——body 要先解析；在 body 解析与基础校验后）加入分支。具体：`handlePost` 解析 body 后第一行插入：

```js
  if (body && body.mode === 'merge') return handleMerge(res, req, body)
```

（放在 `if (!body || typeof body !== 'object') ... INVALID_REQUEST` 检查之后。旧客户端的 body 无 `mode` 字段，继续走 v1 推送逻辑，零改动。）

- [ ] **Step 2: 部署**

MCP `manageFunctions` `updateFunctionCode`：`functionName: 'trip-sync'`，`functionRootPath: 'C:\\job\\playground\\trip\\trip-fee-calculator\\cloudfunctions'`（与 Task 2 of v1 计划相同的部署方式；如依赖安装有问题，在函数目录 `npm install --omit=dev` 后重试）。

- [ ] **Step 3: 冒烟测试（curl，UTF-8 body 文件方式避免 GBK 问题）**

记 `BASE=https://playground-d0goyj2w0f42a96b8-1457342933.ap-shanghai.app.tcloudbase.com/trip-sync`，测试码 `MERGETST`（合法字符集）。最小 payload：

```json
{"name":"合并冒烟","members":[{"id":"m1","name":"甲"},{"id":"m2","name":"乙"}],"expenses":[{"id":"e1","purpose":"正餐","amount":5000,"payerId":"m1","beneficiaryIds":["m1","m2"],"note":"","createdAt":"2026-09-10T01:00:00.000Z"}],"createdAt":"2026-09-10T00:00:00.000Z"}
```

依次验证（每条记下期望 vs 实际）：

1. **开启创建**：`POST` mode merge、码 MERGETST、payload 上面内容、`myMemberId:'m1'` → `200 {"status":"merged","revision":1,"payload":...}`，payload 已 backfill（expenses[0].updatedAt 存在、deletedIds 数组存在、metaUpdatedAt 存在）
2. **无变化幂等（T-M12）**：完全相同 body 再发 → `200` `revision` 仍为 1（不 +1）
3. **本地新增合并（T-M01）**：payload expenses 追加 `{"id":"e2",...同要素不同id...,"createdAt":"2026-09-10T02:00:00.000Z"}` → 因与 e1 四要素相同 → `200 {"status":"duplicates_found","duplicates":[{local:e2,remote:e1}],"payload":<只含e1>,"revision":1}`（候选未写入 → 无实际变更 → revision 不增）
4. **阶段 2 裁决（T-D01）**：同 body 加 `"dedupDecisions":[{"localId":"e2","remoteId":"e1","action":"duplicate"}]` → `200 {"status":"merged","revision":1}`（e2 被丢弃，merged == remote → 幂等不增），GET 确认远端只含 e1
5. **不重复裁决（T-D05）**：再来一次同 body 但 `action:"keep"` 且 e2 换成 `id:"e3"`（与 e1 同要素）→ `200 {"status":"merged","revision":2}`，GET 确认远端含 e1、e3
6. **v1 云端文档迁移（T-C01）**：用 MCP `writeNoSqlDatabaseContent` 直接写一个 v1 文档（`_id:'V1MIGTST'`，payload 无 updatedAt/deletedIds、schemaVersion 缺省），然后 mode merge 推任意合法 payload → 响应 payload 为 v2 结构
7. **旧端点兼容（T-C03）**：旧 POST（无 mode、`baseRevision:0`、合法 payload、新码 `LEGACYT9`）→ `200 {"revision":1}`（v1 行为不变）；随后 GET 正常
8. **并发收敛（T-N08）**：两个 `mode:merge` 请求（不同新增记录）背靠背发出 → 两个都 200，最终 GET 含两边的记录
9. **码校验**：mode merge + 码 `bad` → 400 INVALID_CODE

- [ ] **Step 4: 清理冒烟数据**

MCP `writeNoSqlDatabaseContent` delete：`query: {}`（trips 集合当前只含冒烟文档，全清后 GET 验证 total 0）。

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/trip-sync/index.js
git commit -m "feat: add mode:merge endpoint with legacy push/pull kept"
```

提交前核对 diff 无凭证。

---

### Task 3: 前端 sync.js v2 客户端 + 去重匹配器（TDD）

**Files:**
- Modify: `src/utils/sync.js`
- Modify: `src/utils/__tests__/sync.test.js`

**Interfaces:**
- Consumes: 无（纯 fetch 客户端）
- Produces（Task 5 引擎、Task 6 表单消费）:
  - 保留：`SYNC_URL`、`validateSyncCode`、`generateSyncCode`、`pullTrip`
  - 新增：`mergeSync({ code, payload, myMemberId, dedupDecisions }) → Promise<{ success: true, status: 'merged'|'duplicates_found', payload, revision, duplicates } | { success: false, code, message }>`
  - 新增：`matchDuplicate(a, b) → boolean`（与服务端 core.js 同规则，前端副本）
  - 新增：`findDuplicateRecords(expense, records, excludeId = null) → expense[]`
  - **删除**：`pushTrip`（v1 推送客户端，云端旧端点仅供线上 v1 H5 使用）

- [ ] **Step 1: 改写测试**

修改 `src/utils/__tests__/sync.test.js`：删除 `describe('pushTrip')` 整块，保留 validateSyncCode/generateSyncCode/pullTrip 测试，追加：

```js
import { SYNC_URL, validateSyncCode, generateSyncCode, pullTrip, mergeSync, matchDuplicate, findDuplicateRecords } from '../sync'

const okResp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('mergeSync', () => {
  const localTrip = { name: 't', members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }], expenses: [] }

  it('returns merged payload and posts correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(200, { status: 'merged', payload: localTrip, revision: 3 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await mergeSync({ code: 'k3x9qa2m', payload: localTrip, myMemberId: 'm1' })
    expect(result).toEqual({ success: true, status: 'merged', payload: localTrip, revision: 3, duplicates: [] })
    expect(fetchMock).toHaveBeenCalledWith(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'merge', code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1', dedupDecisions: undefined })
    })
  })
  it('returns duplicates list on duplicates_found', async () => {
    const dups = [{ local: { id: 'a' }, remote: { id: 'b' } }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(200, { status: 'duplicates_found', payload: localTrip, revision: 5, duplicates: dups })))
    const result = await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })
    expect(result.success).toBe(true)
    expect(result.status).toBe('duplicates_found')
    expect(result.duplicates).toEqual(dups)
  })
  it('sends dedupDecisions when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(200, { status: 'merged', payload: localTrip, revision: 6 }))
    vi.stubGlobal('fetch', fetchMock)
    const decisions = [{ localId: 'a', remoteId: 'b', action: 'duplicate' }]
    await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1', dedupDecisions: decisions })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).dedupDecisions).toEqual(decisions)
  })
  it('maps error statuses to result objects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(404, { error: 'TRIP_NOT_FOUND' })))
    expect((await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })).code).toBe('TRIP_NOT_FOUND')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(400, { error: 'PAYLOAD_TOO_LARGE' })))
    expect((await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })).code).toBe('PAYLOAD_TOO_LARGE')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    expect((await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })).code).toBe('NETWORK_ERROR')
  })
})

describe('matchDuplicate / findDuplicateRecords (frontend copy)', () => {
  const rec = (id, over = {}) => ({ id, purpose: '正餐', amount: 5000, payerId: 'm1', beneficiaryIds: ['m1', 'm2'], ...over })
  it('matches on four factors, ignores beneficiary order', () => {
    expect(matchDuplicate(rec('a'), rec('b'))).toBe(true)
    expect(matchDuplicate(rec('a'), rec('b', { beneficiaryIds: ['m2', 'm1'] }))).toBe(true)
    expect(matchDuplicate(rec('a'), rec('b', { amount: 5001 }))).toBe(false)
  })
  it('findDuplicateRecords excludes by id and returns all matches', () => {
    const records = [rec('a'), rec('b'), rec('c', { amount: 999 })]
    expect(findDuplicateRecords(rec('x'), records).map((r) => r.id)).toEqual(['a', 'b'])
    expect(findDuplicateRecords(rec('a'), records, 'a').map((r) => r.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/utils/__tests__/sync.test.js
```

预期：FAIL（mergeSync/matchDuplicate/findDuplicateRecords 未导出，pushTrip 仍存在）。

- [ ] **Step 3: 实现**

修改 `src/utils/sync.js`：删除 `pushTrip` 整个函数，追加：

```js
export function matchDuplicate(a, b) {
  if (!a || !b) return false
  if (a.payerId !== b.payerId || a.amount !== b.amount || a.purpose !== b.purpose) return false
  if (!Array.isArray(a.beneficiaryIds) || !Array.isArray(b.beneficiaryIds)) return false
  if (a.beneficiaryIds.length !== b.beneficiaryIds.length) return false
  const setB = new Set(b.beneficiaryIds)
  return a.beneficiaryIds.every((id) => setB.has(id))
}

export function findDuplicateRecords(expense, records = [], excludeId = null) {
  return (records || []).filter((r) => r && r.id !== excludeId && matchDuplicate(expense, r))
}

export async function mergeSync({ code, payload, myMemberId, dedupDecisions }) {
  const normalized = String(code == null ? '' : code).trim().toUpperCase()
  let resp, body
  try {
    resp = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'merge', code: normalized, payload, myMemberId, dedupDecisions })
    })
    body = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络' }
  }
  if (resp.status === 404) return { success: false, code: 'TRIP_NOT_FOUND', message: '同步码不存在，请核对' }
  if (resp.status === 400) {
    if (body && body.error === 'PAYLOAD_TOO_LARGE') {
      return { success: false, code: 'PAYLOAD_TOO_LARGE', message: '数据过大，无法同步' }
    }
    return { success: false, code: 'INVALID_REQUEST', message: '请求参数不正确' }
  }
  if (!resp.ok || !body) return { success: false, code: 'NETWORK_ERROR', message: '同步服务暂时不可用' }
  return {
    success: true,
    status: body.status,
    payload: body.payload,
    revision: body.revision,
    duplicates: Array.isArray(body.duplicates) ? body.duplicates : []
  }
}
```

- [ ] **Step 4: 运行确认通过 + 全量回归**

```bash
npx vitest run src/utils/__tests__/sync.test.js
npx vitest run
```

预期：sync.test.js PASS；全量通过（91 - 4 个被删 pushTrip 用例 + 7 个新用例 ≈ 94，以实际为准；**v1 pushTrip 引用方 SyncDialog 此时仍引用 pushTrip 会导致引用错误——本任务同时把 SyncDialog 中对 pushTrip 的调用临时改为不引用**：见 Step 5）。

- [ ] **Step 5: 解除 SyncDialog 对 pushTrip 的引用（过渡桩）**

`src/components/SyncDialog.vue` 中 `handleEnable` 与 `handlePush`/`handleForcePush` 调用了 `pushTrip`。本任务最小改动：删除 import 中的 `pushTrip`；`handleEnable` 改为（临时，Task 6 重写整个组件）：

```js
async function handleEnable() {
  if (!myMemberId.value) { showToast('请先选择你的身份'); return }
  if (!trip.value) return
  busy.value = true
  const result = await mergeSync({ code: generateSyncCode(), payload: trip.value, myMemberId: myMemberId.value })
  busy.value = false
  if (!result.success || result.status !== 'merged') { showToast('同步开启失败，请重试'); return }
  setSyncState({ code: ???, ... })
```

注意：开启同步的码是本地生成的，mergeSync 入参需要它——改为：

```js
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
```

`handlePush`/`handleForcePush`/`handlePullRemoteOnConflict`/`conflict` 相关整块删除（conflict 视图随 Task 6 一并移除，模板中 conflict 分支与「推 送」「拉 取」按钮的 click 改为 `emit('close')` 占位会在 Task 6 重写——**为保本任务可构建**：将 `handlePush`/`handleForcePush`/`handlePullRemoteOnConflict` 函数体替换为 `showToast('同步功能升级中')`，模板不动，import 改为 `import { validateSyncCode, generateSyncCode, pullTrip, mergeSync } from '../utils/sync'`）。`npx vite build` 必须成功。

- [ ] **Step 6: 提交**

```bash
git add src/utils/sync.js src/utils/__tests__/sync.test.js src/components/SyncDialog.vue
git commit -m "feat: v2 sync client (mergeSync + duplicate matcher), drop pushTrip"
```

---

### Task 4: store v2 数据迁移 + 记录时间戳 + 墓碑（TDD）

**Files:**
- Modify: `src/stores/trip.js`
- Create: `src/stores/__tests__/trip-v2.test.js`
- Modify: `src/stores/__tests__/sync-state.test.js`（sync 状态 v2：无 baseRevision）

**Interfaces:**
- Consumes: 无
- Produces（Task 5 引擎、Task 6 UI 消费）:
  - trip 数据恒为 v2 形态（loadFromStorage / importData 后 backfill）
  - `addExpense`：新记录 `updatedAt = createdAt`
  - `updateExpense`：更新字段时 `updatedAt = new Date().toISOString()`
  - `removeExpense`：`deletedIds.push({ id, deletedAt: now })` 且过滤 expenses
  - sync 状态结构 v2：`{ code, myMemberId, lastSyncedAt }`（loadSyncState 忽略 v1 的 baseRevision 字段）
  - `importData(json)`：接受 v1/v2，导入后 backfill v2 字段

- [ ] **Step 1: 写失败测试**

创建 `src/stores/__tests__/trip-v2.test.js`（独立文件，文件内 beforeEach 用 `vi.resetModules()` + 动态 import，模式同 sync-state.test.js）：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

const SYNC_KEY = 'trip-fee-calculator-sync'
const DATA_KEY = 'trip-fee-calculator-data'
const defaultSync = { code: null, myMemberId: null, lastSyncedAt: null }

const loadStore = async () => {
  const mod = await import('../trip')
  return mod.useTripStore()
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('v2 data migration on load', () => {
  it('backfills updatedAt/deletedIds/metaUpdatedAt for v1 local data', async () => {
    localStorage.setItem(DATA_KEY, JSON.stringify({
      name: '旧旅行', createdAt: '2026-09-01T00:00:00.000Z',
      members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }],
      expenses: [{ id: 'e1', purpose: '正餐', amount: 100, payerId: 'm1', beneficiaryIds: ['m1'], note: '', createdAt: '2026-09-01T01:00:00.000Z' }]
    }))
    const { trip } = await loadStore()
    expect(trip.value.expenses[0].updatedAt).toBe('2026-09-01T01:00:00.000Z')
    expect(trip.value.deletedIds).toEqual([])
    expect(trip.value.metaUpdatedAt).toBe('2026-09-01T00:00:00.000Z')
  })
  it('v1 sync state (with baseRevision) migrates to v2 shape', async () => {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ code: 'K3X9QA2M', baseRevision: 3, lastSyncedAt: 'x', myMemberId: 'm1' }))
    const { sync } = await loadStore()
    expect(sync.value).toEqual({ code: 'K3X9QA2M', lastSyncedAt: 'x', myMemberId: 'm1' })
  })
})

describe('mutation timestamps & tombstones', () => {
  it('addExpense sets updatedAt = createdAt', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    store.addExpense({ purpose: '正餐', amount: 5000, payerId: store.trip.value.members[0].id, beneficiaryIds: [store.trip.value.members[0].id], createdAt: '2026-09-10T01:00:00.000Z' })
    const e = store.trip.value.expenses[0]
    expect(e.updatedAt).toBe('2026-09-10T01:00:00.000Z')
  })
  it('updateExpense bumps updatedAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T05:00:00.000Z'))
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    store.addExpense({ purpose: '正餐', amount: 5000, payerId: 'm', beneficiaryIds: ['m'], createdAt: '2026-09-10T01:00:00.000Z' })
    const id = store.trip.value.expenses[0].id
    store.updateExpense(id, { amount: 6000 })
    expect(store.trip.value.expenses[0].updatedAt).toBe('2026-09-10T05:00:00.000Z')
    vi.useRealTimers()
  })
  it('removeExpense writes tombstone and filters record', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T05:00:00.000Z'))
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    store.addExpense({ purpose: '正餐', amount: 5000, payerId: 'm', beneficiaryIds: ['m'], createdAt: '2026-09-10T01:00:00.000Z' })
    const id = store.trip.value.expenses[0].id
    store.removeExpense(id)
    expect(store.trip.value.expenses).toEqual([])
    expect(store.trip.value.deletedIds).toEqual([{ id, deletedAt: '2026-09-10T05:00:00.000Z' }])
    vi.useRealTimers()
  })
  it('initTrip creates v2 trip (metaUpdatedAt, deletedIds)', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    expect(store.trip.value.deletedIds).toEqual([])
    expect(typeof store.trip.value.metaUpdatedAt).toBe('string')
  })
})

describe('importData v1/v2 tolerance', () => {
  it('imports v1 JSON and backfills v2 fields', async () => {
    const store = await loadStore()
    const v1 = { name: '导入', members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }], expenses: [{ id: 'e1', purpose: 'x', amount: 1, payerId: 'm1', beneficiaryIds: ['m1'], createdAt: '2026-09-01T01:00:00.000Z' }] }
    const r = store.importData(JSON.stringify(v1))
    expect(r.success).toBe(true)
    expect(store.trip.value.expenses[0].updatedAt).toBe('2026-09-01T01:00:00.000Z')
    expect(store.trip.value.deletedIds).toEqual([])
  })
  it('imports v2 JSON preserving updatedAt and tombstones', async () => {
    const store = await loadStore()
    const v2 = { name: '导入', createdAt: 't0', metaUpdatedAt: 't0', deletedIds: [{ id: 'e9', deletedAt: 't2' }], members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }], expenses: [{ id: 'e1', purpose: 'x', amount: 1, payerId: 'm1', beneficiaryIds: ['m1'], createdAt: 't1', updatedAt: 't2' }] }
    const r = store.importData(JSON.stringify(v2))
    expect(r.success).toBe(true)
    expect(store.trip.value.deletedIds).toEqual([{ id: 'e9', deletedAt: 't2' }])
    expect(store.trip.value.expenses[0].updatedAt).toBe('t2')
  })
  it('resetTrip clears sync state (v2 shape preserved)', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    store.resetTrip()
    expect(store.sync.value).toEqual(defaultSync)
  })
})
```

同时修改 `src/stores/__tests__/sync-state.test.js`：将所有对 `baseRevision` 的引用与断言改为 v2 结构（`{ code, myMemberId, lastSyncedAt }`）；「setSyncState merges partial」用例改为 `{ code: 'K3X9QA2M', myMemberId: 'm1' }` 合并断言；garbage 回退用例改为非法 code / 非法 lastSyncedAt。

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/stores/__tests__/trip-v2.test.js
```

预期：FAIL（trip 无 deletedIds、updateExpense 不写 updatedAt 等）。

- [ ] **Step 3: 实现**

修改 `src/stores/trip.js`：

1. 新增迁移函数（`loadFromStorage` 之前）：

```js
function migrateTripData(data) {
  const d = { ...data }
  if (!Array.isArray(d.deletedIds)) d.deletedIds = []
  if (typeof d.metaUpdatedAt !== 'string') d.metaUpdatedAt = d.createdAt || new Date(0).toISOString()
  if (Array.isArray(d.expenses)) {
    d.expenses = d.expenses.map((e) => ({
      ...e,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : (e.createdAt || new Date(0).toISOString())
    }))
  }
  return d
}
```

2. `loadFromStorage`：`return data` 改为 `return migrateTripData(data)`
3. `initTrip`：trip 对象增加 `metaUpdatedAt: new Date().toISOString()` 与 `deletedIds: []`
4. `addExpense`：记录对象增加 `updatedAt: createdAt || new Date().toISOString()`（与 createdAt 同值）
5. `updateExpense`：`Object.assign` 之前加 `roundedUpdates.updatedAt = new Date().toISOString()`
6. `removeExpense` 改为：

```js
  function removeExpense(id) {
    if (!trip.value) return
    if (!trip.value.deletedIds) trip.value.deletedIds = []
    trip.value.deletedIds.push({ id, deletedAt: new Date().toISOString() })
    trip.value.expenses = trip.value.expenses.filter((e) => e.id !== id)
  }
```

7. `importData`：`trip.value = data` 改为 `trip.value = migrateTripData(data)`
8. `loadSyncState` 改为 v2（忽略 baseRevision）：

```js
function loadSyncState() {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return defaultSyncState()
    const s = JSON.parse(raw)
    if (!s || typeof s !== 'object') return defaultSyncState()
    if (s.code !== null && !/^[2-9A-HJKMNP-Z]{8}$/.test(s.code)) return defaultSyncState()
    return {
      code: s.code,
      lastSyncedAt: typeof s.lastSyncedAt === 'string' ? s.lastSyncedAt : null,
      myMemberId: typeof s.myMemberId === 'string' ? s.myMemberId : null
    }
  } catch {
    return defaultSyncState()
  }
}
```

`defaultSyncState()` 改为 `{ code: null, myMemberId: null, lastSyncedAt: null }`。

- [ ] **Step 4: 运行确认通过 + 全量回归**

```bash
npx vitest run src/stores/__tests__/trip-v2.test.js
npx vitest run src/stores/__tests__/sync-state.test.js
npx vitest run
```

预期：全部 PASS（旧 trip.test.js 若因 deletedIds/updatedAt 字段差异断言失败，按 v2 事实修正断言）。

- [ ] **Step 5: 提交**

```bash
git add src/stores/trip.js src/stores/__tests__/
git commit -m "feat: v2 trip data with per-record timestamps, tombstones, migration"
```

---

### Task 5: 同步引擎 useSyncEngine（TDD）

**Files:**
- Create: `src/composables/useSyncEngine.js`
- Create: `src/composables/__tests__/syncEngine.test.js`

**Interfaces:**
- Consumes:
  - `useTripStore()` 的 `{ trip, sync, setSyncState, importData }`
  - `src/utils/sync.js` 的 `mergeSync`
- Produces（Task 6 UI 消费，单例模式与 store 相同）:
  - `status` ref：`'idle' | 'syncing' | 'success' | 'error' | 'pending'`
  - `errorMessage` ref：string | null
  - `pendingDuplicates` ref：`[{ local, remote }]`（内存，不持久化）
  - `triggerSync()`：串行队列入口（在途则置 queued）
  - `resolveDuplicates(decisions)`：清空待确认并发送阶段 2（decisions: `[{ localId, remoteId, action }]`）
  - `dismissDuplicates()`：清空待确认（用户关闭弹窗，下次同步重新探测）

- [ ] **Step 1: 写失败测试**

创建 `src/composables/__tests__/syncEngine.test.js`：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/sync', () => ({
  mergeSync: vi.fn()
}))

const loadEngine = async () => {
  const mod = await import('../syncEngine')
  return mod.useSyncEngine()
}

const tripV2 = () => ({
  name: '测试', createdAt: 't0', metaUpdatedAt: 't0', deletedIds: [],
  members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }], expenses: []
})

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('useSyncEngine', () => {
  it('does nothing when sync not enabled or no trip', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const engine = await loadEngine()
    engine.triggerSync()
    await new Promise((r) => setTimeout(r, 0))
    expect(mergeSync).not.toHaveBeenCalled()
    expect(engine.status.value).toBe('idle')
  })

  it('happy path: syncing → success, applies merged via importData, updates lastSyncedAt', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const storeMod = await import('../../stores/trip')
    const store = storeMod.useTripStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    const merged = tripV2()
    merged.name = '合并后'
    mergeSync.mockResolvedValue({ success: true, status: 'merged', payload: merged, revision: 2, duplicates: [] })
    const engine = await loadEngine()
    await engine.triggerSync()
    expect(engine.status.value).toBe('success')
    expect(mergeSync).toHaveBeenCalledWith({ code: 'K3X9QA2M', payload: store.trip.value, myMemberId: 'm1', dedupDecisions: undefined })
    expect(store.trip.value.name).toBe('合并后')
    expect(store.sync.value.lastSyncedAt).toBeTruthy()
  })

  it('failure path: status error, local data untouched, no throw', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const storeMod = await import('../../stores/trip')
    const store = storeMod.useTripStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    mergeSync.mockResolvedValue({ success: false, code: 'NETWORK_ERROR', message: '网络连接失败' })
    const engine = await loadEngine()
    const before = JSON.stringify(store.trip.value)
    await engine.triggerSync()
    expect(engine.status.value).toBe('error')
    expect(engine.errorMessage.value).toBe('网络连接失败')
    expect(JSON.stringify(store.trip.value)).toBe(before)
  })

  it('duplicates_found: status pending, payload NOT applied, duplicates queued', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const storeMod = await import('../../stores/trip')
    const store = storeMod.useTripStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    const dups = [{ local: { id: 'l1' }, remote: { id: 'r1' } }]
    mergeSync.mockResolvedValue({ success: true, status: 'duplicates_found', payload: { ...tripV2(), name: '不应被应用' }, revision: 3, duplicates: dups })
    const engine = await loadEngine()
    await engine.triggerSync()
    expect(engine.status.value).toBe('pending')
    expect(engine.pendingDuplicates.value).toEqual(dups)
    expect(store.trip.value.name).toBe('测试') // payload 未应用
  })

  it('resolveDuplicates sends phase-2 decisions and applies merged result', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const storeMod = await import('../../stores/trip')
    const store = storeMod.useTripStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    const dups = [{ local: { id: 'l1' }, remote: { id: 'r1' } }]
    mergeSync.mockResolvedValueOnce({ success: true, status: 'duplicates_found', payload: tripV2(), revision: 3, duplicates: dups })
    mergeSync.mockResolvedValueOnce({ success: true, status: 'merged', payload: { ...tripV2(), name: '阶段2结果' }, revision: 4, duplicates: [] })
    const engine = await loadEngine()
    await engine.triggerSync()
    await engine.resolveDuplicates([{ localId: 'l1', remoteId: 'r1', action: 'duplicate' }])
    expect(engine.status.value).toBe('success')
    expect(engine.pendingDuplicates.value).toEqual([])
    expect(store.trip.value.name).toBe('阶段2结果')
    expect(mergeSync.mock.calls[1][0].dedupDecisions).toEqual([{ localId: 'l1', remoteId: 'r1', action: 'duplicate' }])
  })

  it('serialized queue: triggers during in-flight coalesce into one follow-up run (T-A05/T-N07)', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const storeMod = await import('../../stores/trip')
    const store = storeMod.useTripStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    let resolveFirst
    mergeSync.mockImplementationOnce(() => new Promise((r) => { resolveFirst = () => r({ success: true, status: 'merged', payload: tripV2(), revision: 1, duplicates: [] }) }))
    mergeSync.mockResolvedValue({ success: true, status: 'merged', payload: tripV2(), revision: 2, duplicates: [] })
    const engine = await loadEngine()
    const p1 = engine.triggerSync() // 不 await —— 模拟在途
    engine.triggerSync() // 在途中触发 ×2
    engine.triggerSync()
    expect(mergeSync).toHaveBeenCalledTimes(1)
    resolveFirst()
    await p1
    await new Promise((r) => setTimeout(r, 0))
    expect(mergeSync).toHaveBeenCalledTimes(2) // 只补跑一次
    expect(engine.status.value).toBe('success')
  })

  it('dismissDuplicates clears pending; next sync re-detects', async () => {
    const { mergeSync } = await import('../../utils/sync')
    const storeMod = await import('../../stores/trip')
    const store = storeMod.useTripStore()
    store.initTrip('测试', ['甲', '乙'])
    store.setSyncState({ code: 'K3X9QA2M', myMemberId: 'm1' })
    const dups = [{ local: { id: 'l1' }, remote: { id: 'r1' } }]
    mergeSync.mockResolvedValue({ success: true, status: 'duplicates_found', payload: tripV2(), revision: 3, duplicates: dups })
    const engine = await loadEngine()
    await engine.triggerSync()
    engine.dismissDuplicates()
    expect(engine.pendingDuplicates.value).toEqual([])
    expect(engine.status.value).toBe('idle')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/composables/__tests__/syncEngine.test.js
```

预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `src/composables/useSyncEngine.js`：

```js
import { ref } from 'vue'
import { useTripStore } from '../stores/trip'
import { mergeSync } from '../utils/sync'

let singleton = null

export function useSyncEngine() {
  if (singleton) return singleton

  const status = ref('idle')
  const errorMessage = ref(null)
  const pendingDuplicates = ref([])

  let inFlight = false
  let queued = false

  async function runSync(decisions) {
    const store = useTripStore()
    if (!store.sync.value.code || !store.trip.value) return
    inFlight = true
    status.value = 'syncing'
    errorMessage.value = null
    try {
      const result = await mergeSync({
        code: store.sync.value.code,
        payload: store.trip.value,
        myMemberId: store.sync.value.myMemberId,
        dedupDecisions: decisions
      })
      if (!result.success) {
        status.value = 'error'
        errorMessage.value = result.message
        return
      }
      if (result.status === 'duplicates_found') {
        pendingDuplicates.value = result.duplicates
        status.value = 'pending'
        return
      }
      const applied = store.importData(JSON.stringify(result.payload))
      if (!applied.success) {
        status.value = 'error'
        errorMessage.value = '合并结果校验失败：' + applied.error
        return
      }
      pendingDuplicates.value = []
      store.setSyncState({ lastSyncedAt: new Date().toISOString() })
      status.value = 'success'
    } catch {
      status.value = 'error'
      errorMessage.value = '同步异常，请稍后重试'
    } finally {
      inFlight = false
      if (queued) {
        queued = false
        runSync()
      }
    }
  }

  function triggerSync() {
    const store = useTripStore()
    if (!store.sync.value.code || !store.trip.value) return
    if (inFlight) {
      queued = true
      return
    }
    return runSync()
  }

  async function resolveDuplicates(decisions) {
    pendingDuplicates.value = []
    await runSync(decisions)
  }

  function dismissDuplicates() {
    pendingDuplicates.value = []
    status.value = 'idle'
  }

  singleton = { status, errorMessage, pendingDuplicates, triggerSync, resolveDuplicates, dismissDuplicates }
  return singleton
}
```

- [ ] **Step 4: 运行确认通过 + 全量回归**

```bash
npx vitest run src/composables/__tests__/syncEngine.test.js
npx vitest run
```

预期：引擎 7 个用例 PASS；全量通过。

- [ ] **Step 5: 提交**

```bash
git add src/composables/
git commit -m "feat: sync engine with serialized queue, status machine, dedup flow"
```

---

### Task 6: UI — SyncDialog v2 + SyncStatus + ExpenseView 自动同步 + 表单即时去重

**Files:**
- Modify: `src/components/SyncDialog.vue`（重写）
- Create: `src/components/SyncStatus.vue`
- Modify: `src/views/ExpenseView.vue`
- Modify: `src/components/ExpenseForm.vue`

**Interfaces:**
- Consumes:
  - `useSyncEngine()` 的 `{ status, errorMessage, pendingDuplicates, triggerSync, resolveDuplicates, dismissDuplicates }`
  - `useTripStore()` 的 `{ trip, sync, toast, setSyncState, clearSyncState, importData }`
  - `src/utils/sync.js` 的 `{ validateSyncCode, generateSyncCode, pullTrip, mergeSync, findDuplicateRecords }`
  - `ConfirmDialog`（props `show/title/message`，emits `confirm/cancel`）
- Produces:
  - `SyncDialog`：props `{ show, joinOnly }`，emits `['close', 'joined']`；视图 `idle | join-summary | active | duplicates`
  - `SyncStatus`：props `{ status, error, pendingCount }`，emits `['retry', 'open']`；显示 `同步中/同步成功/同步失败·点击重试/待确认 N 条`
  - ExpenseView：onMounted 与增/改/删后 `triggerSync()`；`pendingDuplicates` 非空时自动打开 SyncDialog
  - ExpenseForm：提交前对四要素做本地查重（`findDuplicateRecords`），命中弹 ConfirmDialog，确认重复则放弃提交

说明：UI 装配层，无组件单测（项目既有模式）；由 Task 8 E2E 覆盖（T-A/T-D/T-R）。`npx vite build` 必须成功，`npx vitest run` 保持全过。

- [ ] **Step 1: 重写 SyncDialog.vue**

```vue
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
watch(() => engine.pendingDuplicates.value.length, (n) => {
  if (n > 0 && props.show) {
    dupIndex.value = 0
    dupDecisions.value = []
    mode.value = 'duplicates'
  }
})

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
```

- [ ] **Step 2: 创建 SyncStatus.vue**

```vue
<script setup>
defineProps({
  status: { type: String, default: 'idle' },
  error: { type: String, default: null },
  pendingCount: { type: Number, default: 0 }
})
const emit = defineEmits(['retry', 'open'])
</script>

<template>
  <span
    v-if="status !== 'idle'"
    :class="['sync-chip', status]"
    @click="status === 'error' ? emit('retry') : emit('open')"
  >
    <template v-if="status === 'syncing'">同步中</template>
    <template v-else-if="status === 'success'">已同步</template>
    <template v-else-if="status === 'error'">同步失败 · 点击重试</template>
    <template v-else-if="status === 'pending'">待确认 {{ pendingCount }} 条</template>
  </span>
</template>

<style scoped>
.sync-chip {
  display: inline-flex; align-items: center;
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .5px;
  padding: 3px 8px; border-radius: 10px; border: 1px solid var(--rule);
  color: var(--ink-soft); background: #fbf6e8; white-space: nowrap;
}
.sync-chip.syncing { color: var(--indigo); border-color: var(--indigo); }
.sync-chip.success { color: var(--moss); border-color: var(--moss); }
.sync-chip.error { color: var(--vermilion); border-color: var(--vermilion); cursor: pointer; }
.sync-chip.pending { color: #fff; background: var(--vermilion); border-color: var(--vermilion); cursor: pointer; }
</style>
```

- [ ] **Step 3: 改造 ExpenseView.vue**

script 部分：

```js
import { ref, watch, onMounted } from 'vue'
import SyncDialog from '../components/SyncDialog.vue'
import SyncStatus from '../components/SyncStatus.vue'
import { useSyncEngine } from '../composables/useSyncEngine'
// ……现有 imports 不变

const engine = useSyncEngine()
```

`onMounted(() => { engine.triggerSync() })`；`handleSave` 在 add/update 分支之后、`handleDelete` 在 `removeExpense` 之后各加 `engine.triggerSync()`。

template 部分：`rh-top` 的 stamp 旁（或 `rh-meta` 的 step 文本之后）挂状态 chip：

```html
<span class="rh-top-right">
  <span class="rh-stamp indigo">记账中</span>
  <SyncStatus
    :status="engine.status.value"
    :error="engine.errorMessage.value"
    :pending-count="engine.pendingDuplicates.value.length"
    @retry="engine.triggerSync()"
    @open="showSync = true"
  />
</span>
```

（将原 stamp 包进 `rh-top-right` 容器，`display:flex; gap:8px; align-items:center; flex-shrink:0;`；确保 430px 版心下不换行溢出。）

自动打开去重弹窗（script）：

```js
watch(() => engine.pendingDuplicates.value.length, (n) => {
  if (n > 0) showSync.value = true
})
```

SyncDialog 挂载改为（替换原行）：

```html
<SyncDialog :show="showSync" @close="showSync = false" />
```

- [ ] **Step 4: ExpenseForm 即时去重（T-D07/T-D08）**

修改 `src/components/ExpenseForm.vue`：

script 增加：

```js
import { useTripStore } from '../stores/trip'
import { findDuplicateRecords } from '../utils/sync'

const { trip } = useTripStore()
const dupConfirm = ref(false)
let pendingSave = null
```

`handleSubmit` 改为（提交前查重）：

```js
function handleSubmit() {
  error.value = ''
  if (!purpose.value) { error.value = '请选择用途'; return }
  const amountCents = Math.round(parseFloat(amount.value) * 100)
  if (!amountCents || amountCents <= 0) { error.value = '请输入有效金额'; return }
  if (!payerId.value) { error.value = '请选择支付人'; return }
  if (beneficiaryIds.value.length === 0) { error.value = '请选择至少一个受益人'; return }

  const record = {
    purpose: purpose.value,
    amount: amountCents,
    payerId: payerId.value,
    beneficiaryIds: [...beneficiaryIds.value]
  }
  const dups = findDuplicateRecords(record, trip.value?.expenses || [], props.editing?.id || null)
  if (dups.length > 0) {
    pendingSave = { record }
    dupConfirm.value = true
    return
  }
  doSave(record)
}

function doSave(record) {
  emit('save', {
    purpose: record.purpose,
    amount: record.amount,
    payerId: record.payerId,
    beneficiaryIds: record.beneficiaryIds,
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

function confirmDupSave() {
  dupConfirm.value = false
  if (pendingSave) doSave(pendingSave.record)
  pendingSave = null
}
```

template 末尾（ConfirmDialog 模式）加：

```html
<div v-if="dupConfirm" class="overlay" @click.self="dupConfirm = false">
  <div class="dup-dialog">
    <h3>疑 似 重 复</h3>
    <p>已存在支付人、受益人、金额、项目完全相同的记录。仍要保存吗？</p>
    <div class="dup-actions">
      <button class="btn sm ghost" @click="dupConfirm = false; pendingSave = null">放 弃</button>
      <button class="btn sm primary" @click="confirmDupSave">保 存</button>
    </div>
  </div>
</div>
```

样式（追加到 style，复用现有 token；overlay 与 ExpenseView 一致）：

```css
.overlay { position: fixed; inset: 0; background: rgba(28,25,23,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.dup-dialog { background: #fbf6e8; border: 1px solid var(--rule); border-radius: 10px; padding: 22px 20px; width: 300px; max-width: 100%; box-shadow: 0 20px 50px -10px rgba(0,0,0,.4); }
.dup-dialog h3 { font-family: var(--font-title); font-weight: 700; font-size: 17px; margin-bottom: 10px; letter-spacing: 1px; }
.dup-dialog p { color: var(--ink-soft); font-size: 13px; line-height: 1.6; margin-bottom: 14px; }
.dup-actions { display: flex; gap: 10px; justify-content: flex-end; }
.btn { display: inline-flex; align-items: center; padding: 8px 14px; font-size: 13px; border-radius: 6px; border: 1px solid var(--rule); background: #fbf6e8; cursor: pointer; font-family: var(--font-body); }
.btn.ghost { background: transparent; }
.btn.primary { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
```

- [ ] **Step 5: 构建与回归**

```bash
npx vite build
npx vitest run
```

预期：构建成功；全量测试通过。

- [ ] **Step 6: 提交**

```bash
git add src/components/ src/views/ExpenseView.vue
git commit -m "feat: merge-sync UI — unified sync button, dup confirm flow, status chip, auto triggers"
```

---

### Task 7: InitView 加入旅行入口

**Files:**
- Modify: `src/views/InitView.vue`

**Interfaces:**
- Consumes: SyncDialog 的 `joinOnly` 模式（Task 6 产出）
- Produces: InitView「加入旅行」入口 → 输码 → 摘要确认 → 选身份 → `joined` 事件 → 跳转 `/expense`

- [ ] **Step 1: 修改 InitView**

script 增加：

```js
import SyncDialog from '../components/SyncDialog.vue'

const showJoin = ref(false)

function onJoined() {
  showJoin.value = false
  router.replace('/expense')
}
```

template：「开 始 旅 行」主按钮之后加：

```html
<button class="btn ghost block" style="margin-top:12px;color:var(--ink-soft);" @click="showJoin = true">加 入 旅 行</button>
<p class="join-hint">已有同伴开启了同步？输入同步码加入</p>
```

组件末尾挂载：

```html
<SyncDialog :show="showJoin" join-only @joined="onJoined" @close="showJoin = false" />
```

样式追加：

```css
.join-hint { text-align: center; font-size: 11px; color: var(--ink-faint); margin-top: 8px; font-family: var(--font-mono); }
```

注意：SyncDialog 的 `.overlay` z-index 1000，InitView 无冲突。InitView 在 `trip.value` 存在时会 `router.replace('/expense')`——本地已有旅行时看不到此入口（设计如此：需先「重新开始」）。

- [ ] **Step 2: 构建与回归**

```bash
npx vite build
npx vitest run
```

- [ ] **Step 3: 提交**

```bash
git add src/views/InitView.vue
git commit -m "feat: join-trip entry on init page via sync code"
```

---

### Task 8: E2E 浏览器验证 + 冒烟补充 + 文档更新

**Files:**
- Modify: `docs/项目状态.md`（同步功能 v2 描述）
- Modify: `docs/测试用例-合并式同步.md`（P0/P1 用例标注执行结果勾选）

**Interfaces:**
- Consumes: 全部前序产出 + dev server（preview 工具）+ CloudBase MCP（云端断言与清理）
- Produces: T-A/T-D/T-R/T-N01-02 全流程通过的验证记录

- [ ] **Step 1: 基础流程（T-R01/02/04 + T-A01~04）**

1. dev server（preview_start `vite-dev-server`；注意 Vite 可能自动换端口，以 preview_logs 输出为准）
2. 清 localStorage → 初始化旅行（5 成员）→ 加两笔支出
3. 点「同 步」→ 选身份成员1 → 开启同步 → 记录 CODE → 状态 chip「已同步」
4. MCP `readNoSqlDatabaseContent`（trips, `{}`）断言远端 2 条记录 + revision
5. 修改一笔 → 断言 chip「同步中→已同步」，远端 updatedAt 更新
6. 删除一笔 → 远端墓碑出现（T-A03/T-M06）
7. 新增一笔 → 远端 3 条（T-A01）
8. 刷新页面 → onMounted 自动同步、数据完整（T-A04）
9. 断言全程无「用我的覆盖」冲突弹窗（T-R02）

- [ ] **Step 2: 双设备模拟 + 去重（T-D01~D08）**

1. 模拟设备 B：清两个 localStorage key → 刷新 → InitView 点「加入旅行」（T-R04）→ 输 CODE → 摘要确认 → 身份成员2 → 进入记账页自动同步
2. 设备 B 新增与远端已有记录四要素相同的一笔（受益人乱序选，验证集合比较 T-D09）→ 提交时表单即时弹「疑似重复」（T-D07：本地已有同要素记录）→ 选「保存」→ 自动同步触发 → SyncDialog 自动弹出服务端去重确认 → 选「是重复，去重」→ 断言双端一致且仅一条（T-D01）
3. 设备 B 再加一笔 → 设备 A 刷新拉取（T-A04 反向）
4. 修改一笔使其与另一条同要素 → 表单弹重复确认 → 选「放弃」→ 数据不变（T-D08）
5. 构造「保留两条」场景 → 两笔共存（T-D05）

- [ ] **Step 3: 弱网模拟（T-N01/T-N02）**

1. `preview_eval` 注入 `window.fetch = () => Promise.reject(new TypeError('offline'))` → 添加一笔 → chip「同步失败 · 点击重试」，本地数据完好
2. 恢复 `location.reload()` → 刷新触发自动同步 → 状态成功、积压变更上云（含断网期间的新增）

- [ ] **Step 4: 大数据差异冒烟（T-L01~L03，脚本）**

用 `preview_eval` 直接构造大 payload（200 条记录的 trip）经 `mergeSync` 上行；再清空本地重新加入拉取 200 条（T-L02）；构造 50+50 交错修改（T-L03，可在 eval 中调用 `window.fetch` 直发 mergeSync 或操作 localStorage 后触发同步），断言收敛。

- [ ] **Step 5: 清理云端测试数据**

MCP `writeNoSqlDatabaseContent` delete `query: {}` → GET 验证 0 文档。

- [ ] **Step 6: 文档更新 + 全量回归 + 提交**

1. `docs/项目状态.md`：同步功能描述更新为合并式（自动同步/去重/状态指示/加入旅行）
2. `docs/测试用例-合并式同步.md`：P0/P1 用例逐条标注 ✅（含未覆盖项的说明；P2 标注「合并后手动补」）
3. `npx vitest run` 全过

```bash
git add docs/
git commit -m "docs: update project status and test-case results for merge sync"
```

---

## 任务依赖关系

```
Task 1 (core 算法) ──► Task 2 (部署+冒烟)
Task 3 (sync.js v2) ─┐
Task 4 (store v2) ───┼──► Task 5 (引擎) ──► Task 6 (UI) ──► Task 7 (InitView) ──► Task 8 (E2E+文档)
```

Task 3/4 与 Task 1/2 无依赖可并行，但**实现子代理不并行派发**（工作区冲突）；串行顺序即 1→8。
