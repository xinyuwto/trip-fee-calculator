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
