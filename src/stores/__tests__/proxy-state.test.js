import { describe, it, expect, beforeEach, vi } from 'vitest'

const DATA_KEY = 'trip-fee-calculator-data'
const SYNC_KEY = 'trip-fee-calculator-sync'

const loadStore = async () => {
  const mod = await import('../trip')
  return mod.useTripStore()
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('proxy state', () => {
  it('initTrip creates trip with empty proxies', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    expect(store.trip.value.proxies).toEqual({})
  })

  it('setProxy assigns a payer and persists (bumps metaUpdatedAt)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T10:00:00.000Z'))
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙', '丙'])
    const [a, b] = store.trip.value.members
    const before = store.trip.value.metaUpdatedAt
    vi.setSystemTime(new Date('2026-09-29T10:00:01.000Z'))
    const r = store.setProxy(b.id, a.id)
    expect(r.success).toBe(true)
    expect(store.trip.value.proxies).toEqual({ [b.id]: a.id })
    expect(store.trip.value.metaUpdatedAt).not.toBe(before)
    await new Promise(resolve => setTimeout(resolve, 0)) // 等 deep watcher flush
    const raw = JSON.parse(localStorage.getItem(DATA_KEY))
    expect(raw.proxies).toEqual({ [b.id]: a.id })
    vi.useRealTimers()
  })

  it('re-setting a proxied member overwrites (one payer per member only)', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙', '丙'])
    const [a, b, c] = store.trip.value.members
    store.setProxy(b.id, a.id)
    store.setProxy(b.id, c.id)
    expect(store.trip.value.proxies).toEqual({ [b.id]: c.id })
  })

  it('rejects self-proxy, chained proxy (payer already proxied), and unknown payer', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙', '丙'])
    const [a, b, c] = store.trip.value.members
    expect(store.setProxy(a.id, a.id).success).toBe(false) // 自代
    store.setProxy(b.id, a.id)
    expect(store.setProxy(c.id, b.id).success).toBe(false) // 链式：b 已被代付
    expect(store.setProxy(a.id, 'nobody').success).toBe(false) // 付款人不存在
    expect(store.trip.value.proxies).toEqual({ [b.id]: a.id }) // 状态未破坏
  })

  it('rejects proxying a member who is already paying for others (no chains)', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙', '丙'])
    const [a, b, c] = store.trip.value.members
    store.setProxy(b.id, a.id) // B → A
    // A 正在为 B 代付，A 自身再被 C 代付会形成链 → 拒绝
    const r = store.setProxy(a.id, c.id)
    expect(r.success).toBe(false)
    expect(store.trip.value.proxies).toEqual({ [b.id]: a.id }) // 状态未破坏
  })

  it('setProxy(id, null) clears the proxy', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    const [a, b] = store.trip.value.members
    store.setProxy(b.id, a.id)
    const r = store.setProxy(b.id, null)
    expect(r.success).toBe(true)
    expect(store.trip.value.proxies).toEqual({})
  })

  it('migrateTripData backfills missing proxies and sanitizes dirty data', async () => {
    // v2 数据但缺 proxies → backfill
    const v2NoProxies = {
      name: '旧', createdAt: 't0', metaUpdatedAt: 't0', deletedIds: [],
      members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }, { id: 'm3', name: '丙' }],
      expenses: []
    }
    localStorage.setItem(DATA_KEY, JSON.stringify(v2NoProxies))
    const s1 = await loadStore()
    expect(s1.trip.value.proxies).toEqual({})

    // 脏数据：自代 + 链式 → 净化后仅保留合法条目
    localStorage.clear()
    vi.resetModules()
    const dirty = {
      ...v2NoProxies,
      proxies: { m1: 'm1', m2: 'm1', m3: 'm2' } // m1→m1 自代；m3→m2 链式（m2 已被代付）；m2→m1 合法
    }
    localStorage.setItem(DATA_KEY, JSON.stringify(dirty))
    const s2 = await loadStore()
    expect(s2.trip.value.proxies).toEqual({ m2: 'm1' })
  })

  it('importData keeps valid proxies (survives import round-trip)', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    const [a, b] = store.trip.value.members
    store.setProxy(b.id, a.id)
    const json = JSON.stringify(store.trip.value)
    localStorage.clear()
    vi.resetModules()
    const s2 = await loadStore()
    s2.importData(json)
    expect(s2.trip.value.proxies).toEqual({ [b.id]: a.id })
  })

  it('resetTrip clears proxies with the rest of the trip', async () => {
    const store = await loadStore()
    store.initTrip('测试', ['甲', '乙'])
    const [a, b] = store.trip.value.members
    store.setProxy(b.id, a.id)
    store.resetTrip()
    const s2 = await loadStore()
    expect(s2.trip.value).toBeNull()
    expect(s2.trip.value?.proxies).toBeUndefined()
  })
})
