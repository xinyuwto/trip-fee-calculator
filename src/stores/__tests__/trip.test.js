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

  it('addExpense stores optional note field', () => {
    const { trip, initTrip, addExpense } = useTripStore()
    initTrip()

    addExpense({
      purpose: '午餐',
      amount: 15000,
      payerId: trip.value.members[0].id,
      beneficiaryIds: trip.value.members.map(m => m.id),
      note: '川菜馆，味道不错'
    })

    expect(trip.value.expenses[0].note).toBe('川菜馆，味道不错')
  })

  it('addExpense defaults note to empty string when omitted', () => {
    const { trip, initTrip, addExpense } = useTripStore()
    initTrip()

    addExpense({
      purpose: '午餐',
      amount: 15000,
      payerId: trip.value.members[0].id,
      beneficiaryIds: trip.value.members.map(m => m.id)
    })

    expect(trip.value.expenses[0].note).toBe('')
  })

  it('updateExpense can modify note field', () => {
    const { trip, initTrip, addExpense, updateExpense } = useTripStore()
    initTrip()

    addExpense({ purpose: '午餐', amount: 15000, payerId: trip.value.members[0].id, beneficiaryIds: trip.value.members.map(m => m.id) })
    const id = trip.value.expenses[0].id

    updateExpense(id, { note: '更新备注' })
    expect(trip.value.expenses[0].note).toBe('更新备注')
    expect(trip.value.expenses[0].purpose).toBe('午餐') // unchanged
  })

  it('importData accepts expenses without note field', () => {
    const { importData } = useTripStore()
    const json = JSON.stringify({
      name: '测试',
      members: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }],
      expenses: [{ id: 'x', purpose: '机票', amount: 100000, payerId: '1', beneficiaryIds: ['1', '2'] }],
      createdAt: new Date().toISOString()
    })

    const result = importData(json)
    expect(result.success).toBe(true)
  })

  it('persists to localStorage', () => {
    const { trip, initTrip } = useTripStore()
    initTrip('持久化测试')

    // New store instance reads from localStorage
    const { trip: trip2 } = useTripStore()
    expect(trip2.value.name).toBe('持久化测试')
  })
})
