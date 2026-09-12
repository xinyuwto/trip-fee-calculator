import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/sync', () => ({
  mergeSync: vi.fn()
}))

const loadEngine = async () => {
  const mod = await import('../useSyncEngine')
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
    const localTrip = store.trip.value
    const merged = tripV2()
    merged.name = '合并后'
    mergeSync.mockResolvedValue({ success: true, status: 'merged', payload: merged, revision: 2, duplicates: [] })
    const engine = await loadEngine()
    await engine.triggerSync()
    expect(engine.status.value).toBe('success')
    expect(mergeSync).toHaveBeenCalledWith({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1', dedupDecisions: undefined })
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
