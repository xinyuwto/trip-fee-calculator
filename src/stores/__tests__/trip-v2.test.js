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
