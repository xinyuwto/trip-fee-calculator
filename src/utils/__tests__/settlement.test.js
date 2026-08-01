import { describe, it, expect } from 'vitest'
import { calculateSettlement } from '../settlement'

const members = [
  { id: '1', name: '张三' },
  { id: '2', name: '李四' },
  { id: '3', name: '王五' }
]

describe('calculateSettlement', () => {
  it('all even — no transactions', () => {
    const expenses = [
      { amount: 300, payerId: '1', beneficiaryIds: ['1', '2', '3'] },
      { amount: 300, payerId: '2', beneficiaryIds: ['1', '2', '3'] },
      { amount: 300, payerId: '3', beneficiaryIds: ['1', '2', '3'] }
    ]
    const result = calculateSettlement(members, expenses)
    result.memberBalances.forEach(b => expect(b.balance).toBe(0))
    expect(result.transactions).toHaveLength(0)
  })

  it('one person pays for all', () => {
    const expenses = [
      { amount: 300, payerId: '1', beneficiaryIds: ['1', '2', '3'] }
    ]
    const result = calculateSettlement(members, expenses)

    // 张三 paid 300, owed 100 → balance +200
    // 李四 paid 0, owed 100 → balance -100
    // 王五 paid 0, owed 100 → balance -100
    const zhangsan = result.memberBalances.find(b => b.memberId === '1')
    const lisi = result.memberBalances.find(b => b.memberId === '2')
    const wangwu = result.memberBalances.find(b => b.memberId === '3')

    expect(zhangsan.balance).toBe(200)
    expect(lisi.balance).toBe(-100)
    expect(wangwu.balance).toBe(-100)

    expect(result.transactions).toHaveLength(2)
    // Two transactions: 李四→张三 100, 王五→张三 100
    const [t1, t2] = result.transactions
    expect(t1.fromId).toBe('2')
    expect(t1.toId).toBe('1')
    expect(t1.amount).toBe(100)
    expect(t2.fromId).toBe('3')
    expect(t2.toId).toBe('1')
    expect(t2.amount).toBe(100)
  })

  it('partial beneficiaries', () => {
    const expenses = [
      { amount: 150, payerId: '1', beneficiaryIds: ['1', '2'] }
    ]
    const result = calculateSettlement(members, expenses)

    // 张三 paid 150, owed 75 → balance +75
    // 李四 paid 0, owed 75 → balance -75
    // 王五 paid 0, owed 0 → balance 0
    const zhangsan = result.memberBalances.find(b => b.memberId === '1')
    const lisi = result.memberBalances.find(b => b.memberId === '2')
    const wangwu = result.memberBalances.find(b => b.memberId === '3')

    expect(zhangsan.balance).toBe(75)
    expect(lisi.balance).toBe(-75)
    expect(wangwu.balance).toBe(0)

    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].fromId).toBe('2')
    expect(result.transactions[0].toId).toBe('1')
    expect(result.transactions[0].amount).toBe(75)
  })

  it('minimum transactions with cross payments', () => {
    // A paid 100 for A+B → A owes 50, B owes 50
    // B paid 150 for B+C → B owes 75, C owes 75
    const expenses = [
      { amount: 100, payerId: '1', beneficiaryIds: ['1', '2'] },
      { amount: 150, payerId: '2', beneficiaryIds: ['2', '3'] }
    ]
    const result = calculateSettlement(members, expenses)

    // 张三: paid 100, owed 50 → +50
    // 李四: paid 150, owed 50+75=125 → +25
    // 王五: paid 0, owed 75 → -75
    // Optimal: 王五→张三 50, 王五→李四 25
    expect(result.transactions).toHaveLength(2)
  })
})
