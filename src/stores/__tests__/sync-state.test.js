import { describe, it, expect, beforeEach, vi } from 'vitest'

const SYNC_KEY = 'trip-fee-calculator-sync'
const DATA_KEY = 'trip-fee-calculator-data'

const validSync = { code: 'K3X9QA2M', baseRevision: 3, lastSyncedAt: '2026-09-09T10:00:00.000Z', myMemberId: 'm1' }
const validTrip = {
  name: '测试旅行',
  members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }],
  expenses: []
}

let useTripStore

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  useTripStore = (await import('../trip')).useTripStore
})

describe('sync state persistence', () => {
  it('loads synced state from localStorage on first store access', () => {
    localStorage.setItem(SYNC_KEY, JSON.stringify(validSync))
    const { sync } = useTripStore()
    expect(sync.value).toEqual(validSync)
  })

  it('returns defaults when no sync state stored', () => {
    const { sync } = useTripStore()
    expect(sync.value).toEqual({ code: null, baseRevision: 0, lastSyncedAt: null, myMemberId: null })
  })

  it('rejects garbage sync state and falls back to defaults', () => {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ code: 'BAD!', baseRevision: -1 }))
    const { sync } = useTripStore()
    expect(sync.value).toEqual({ code: null, baseRevision: 0, lastSyncedAt: null, myMemberId: null })
  })

  it('setSyncState merges partial and persists', () => {
    const { sync, setSyncState } = useTripStore()
    setSyncState({ code: 'K3X9QA2M', baseRevision: 1 })
    expect(sync.value.code).toBe('K3X9QA2M')
    expect(sync.value.myMemberId).toBeNull()
    const raw = JSON.parse(localStorage.getItem(SYNC_KEY))
    expect(raw).toEqual({ code: 'K3X9QA2M', baseRevision: 1, lastSyncedAt: null, myMemberId: null })
  })

  it('clearSyncState resets to defaults and persists', () => {
    const { sync, setSyncState, clearSyncState } = useTripStore()
    setSyncState({ code: 'K3X9QA2M', baseRevision: 2, myMemberId: 'm1' })
    clearSyncState()
    expect(sync.value).toEqual({ code: null, baseRevision: 0, lastSyncedAt: null, myMemberId: null })
    expect(JSON.parse(localStorage.getItem(SYNC_KEY))).toEqual(sync.value)
  })

  it('resetTrip clears both trip and sync state', () => {
    const { trip, sync, initTrip, setSyncState, resetTrip } = useTripStore()
    initTrip('测试', ['甲', '乙'])
    setSyncState({ code: 'K3X9QA2M', baseRevision: 2, myMemberId: 'm1' })
    resetTrip()
    expect(trip.value).toBeNull()
    expect(sync.value).toEqual({ code: null, baseRevision: 0, lastSyncedAt: null, myMemberId: null })
    expect(JSON.parse(localStorage.getItem(SYNC_KEY))).toEqual(sync.value)
  })

  it('importData replaces trip but keeps sync state', () => {
    const { trip, sync, initTrip, setSyncState, importData } = useTripStore()
    initTrip('旧旅行', ['甲', '乙'])
    setSyncState({ code: 'K3X9QA2M', baseRevision: 2, myMemberId: 'm1' })
    const result = importData(JSON.stringify(validTrip))
    expect(result.success).toBe(true)
    expect(trip.value.name).toBe('测试旅行')
    expect(sync.value.code).toBe('K3X9QA2M')
    expect(sync.value.baseRevision).toBe(2)
  })
})
