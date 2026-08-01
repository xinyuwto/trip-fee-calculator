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
  try {
    if (trip === null) {
      localStorage.removeItem(TRIP_KEY)
    } else {
      localStorage.setItem(TRIP_KEY, JSON.stringify(trip))
    }
  } catch {
    // Silently ignore storage failures (QuotaExceededError, private browsing, etc.)
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
    const roundedUpdates = { ...updates }
    if (roundedUpdates.amount !== undefined) roundedUpdates.amount = Math.round(roundedUpdates.amount)
    Object.assign(trip.value.expenses[idx], roundedUpdates)
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
