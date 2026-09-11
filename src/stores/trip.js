import { ref, watch } from 'vue'

const TRIP_KEY = 'trip-fee-calculator-data'
const SYNC_KEY = 'trip-fee-calculator-sync'
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

function defaultSyncState() {
  return { code: null, myMemberId: null, lastSyncedAt: null }
}

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

function saveSyncState(state) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('同步状态保存失败', error)
  }
}

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

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(TRIP_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data.name !== 'string' || !Array.isArray(data.members) || !Array.isArray(data.expenses)) return null
    if (data.members.length < 2 || data.members.length > 20) return null
    for (const m of data.members) {
      if (!m.id || !m.name) return null
    }
    for (const e of data.expenses) {
      if (!e.id || !e.purpose || !e.amount || !e.payerId || !Array.isArray(e.beneficiaryIds)) return null
    }
    return migrateTripData(data)
  } catch {
    return null
  }
}

function saveToStorage(trip) {
  try {
    if (trip === null) {
      localStorage.removeItem(TRIP_KEY)
    } else {
      localStorage.setItem(TRIP_KEY, JSON.stringify(trip))
    }
  } catch (error) {
    console.warn('保存失败', error)
  }
}

export function useTripStore() {
  if (singleton) return singleton

  const trip = ref(loadFromStorage())
  const toast = ref({ message: '', id: 0 })
  const sync = ref(loadSyncState())

  watch(trip, (val) => saveToStorage(val), { deep: true })

  function initTrip(name = '我的旅行', memberNames = null) {
    const members = memberNames
      ? memberNames.map(n => ({ id: uuid(), name: n }))
      : createDefaultMembers(DEFAULT_MEMBER_COUNT)

    trip.value = {
      name,
      members,
      expenses: [],
      deletedIds: [],
      createdAt: new Date().toISOString(),
      metaUpdatedAt: new Date().toISOString()
    }
  }

  function addExpense({ purpose, amount, payerId, beneficiaryIds, createdAt, note }) {
    if (!trip.value) return
    const ts = createdAt || new Date().toISOString()
    trip.value.expenses.push({
      id: uuid(),
      purpose,
      amount: Math.round(amount),
      payerId,
      beneficiaryIds,
      note: note || '',
      createdAt: ts,
      updatedAt: ts
    })
    toast.value = { message: '添加成功', id: Date.now() }
  }

  function updateExpense(id, updates) {
    if (!trip.value) return
    const idx = trip.value.expenses.findIndex(e => e.id === id)
    if (idx === -1) return
    const roundedUpdates = { ...updates }
    if (roundedUpdates.amount !== undefined) roundedUpdates.amount = Math.round(roundedUpdates.amount)
    roundedUpdates.updatedAt = new Date().toISOString()
    Object.assign(trip.value.expenses[idx], roundedUpdates)
    toast.value = { message: '修改成功', id: Date.now() }
  }

  function removeExpense(id) {
    if (!trip.value) return
    if (!trip.value.deletedIds) trip.value.deletedIds = []
    trip.value.deletedIds.push({ id, deletedAt: new Date().toISOString() })
    trip.value.expenses = trip.value.expenses.filter((e) => e.id !== id)
  }

  function resetTrip() {
    trip.value = null
    clearSyncState()
  }

  function setSyncState(partial) {
    sync.value = { ...sync.value, ...partial }
    saveSyncState(sync.value)
  }

  function clearSyncState() {
    sync.value = defaultSyncState()
    saveSyncState(sync.value)
  }

  function exportData() {
    if (!trip.value) return null
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
      trip.value = migrateTripData(data)
      return { success: true }
    } catch {
      return { success: false, error: 'JSON 解析失败' }
    }
  }

  singleton = { trip, toast, sync, initTrip, addExpense, updateExpense, removeExpense, resetTrip, setSyncState, clearSyncState, exportData, importData }
  return singleton
}
