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

describe('calculateSettlement — 5人复杂净额结算场景', () => {
  // 5 名成员：A、B、C、D、E
  // 场景约束：
  //   - 大头由 A 和 B 支付
  //   - E 不支付任何费用（没有任何 expense 的 payerId 是 E）
  //   - C 替 E 付过费用（C 是 payer，E 在 beneficiaryIds 中）
  //   - 但 C 整体欠 A 更多 → C 是净债务人，结算时 E 不需要付给 C
  //   - 最终 E 只需付给 A
  const members = [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
    { id: 'C', name: 'C' },
    { id: 'D', name: 'D' },
    { id: 'E', name: 'E' }
  ]

  // 共 16 笔费用（金额单位：分）
  const expenses = [
    { amount: 40000, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 1  酒店
    { amount: 10000, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 2  晚餐
    { amount: 5000,  payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 3  午餐
    { amount: 5000,  payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 4  门票
    { amount: 3000,  payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 5  打车
    { amount: 2000,  payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 6  早餐
    { amount: 20000, payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 7  酒店
    { amount: 5000,  payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 8  晚餐
    { amount: 3000,  payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 9  午餐
    { amount: 2000,  payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 10 打车
    { amount: 3000,  payerId: 'C', beneficiaryIds: ['C', 'E'] },                // 11 咖啡（C 替 E 付）
    { amount: 1500,  payerId: 'C', beneficiaryIds: ['C', 'D', 'E'] },           // 12 零食（C 替 D、E 付）
    { amount: 2000,  payerId: 'D', beneficiaryIds: ['A', 'B', 'C', 'D', 'E'] }, // 13 饮品
    { amount: 1000,  payerId: 'D', beneficiaryIds: ['D', 'E'] },                // 14 矿泉水（D 替 E 付）
    { amount: 4000,  payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D'] },      // 15 伴手礼（E 未参与）
    { amount: 1000,  payerId: 'B', beneficiaryIds: ['B', 'C', 'D', 'E'] }       // 16 零食（A 未参与）
  ]

  // 复用结算算法的分摊口径（向下取整 + 余数按受益人顺序前若干位各加 1 分）
  // 计算某受益人应付某支付人的总额，用于量化“谁欠谁多少”
  function shareOwed(list, payerId, beneficiaryId) {
    return list
      .filter(e => e.payerId === payerId && e.beneficiaryIds.includes(beneficiaryId))
      .reduce((sum, e) => {
        const base = Math.floor(e.amount / e.beneficiaryIds.length)
        const remainder = e.amount % e.beneficiaryIds.length
        const idx = e.beneficiaryIds.indexOf(beneficiaryId)
        return sum + base + (idx < remainder ? 1 : 0)
      }, 0)
  }

  it('费用笔数在 15~50 之间', () => {
    expect(expenses.length).toBeGreaterThanOrEqual(15)
    expect(expenses.length).toBeLessThanOrEqual(50)
  })

  it('E 没有支付任何费用', () => {
    expect(expenses.some(e => e.payerId === 'E')).toBe(false)
  })

  it('C 替 E 付过至少一笔费用', () => {
    expect(expenses.some(e => e.payerId === 'C' && e.beneficiaryIds.includes('E'))).toBe(true)
  })

  it('C 欠 A 的金额大于 E 欠 C 的金额（净额抵消的前提）', () => {
    const cOwesA = shareOwed(expenses, 'A', 'C') // C 在 A 支付的账单中应承担的部分
    const eOwesC = shareOwed(expenses, 'C', 'E') // E 在 C 支付的账单中应承担的部分
    expect(cOwesA).toBe(14000)
    expect(eOwesC).toBe(2000)
    expect(cOwesA).toBeGreaterThan(eOwesC)
  })

  it('正确计算每人净收支', () => {
    const result = calculateSettlement(members, expenses)
    const bal = id => result.memberBalances.find(b => b.memberId === id).balance
    // 手工验算：paid - owed
    // A: 69000 - 20400 = +48600
    // B: 31000 - 20650 = +10350
    // C:  4500 - 22650 = -18150
    // D:  3000 - 21650 = -18650
    // E:     0 - 22150 = -22150
    expect(bal('A')).toBe(48600)
    expect(bal('B')).toBe(10350)
    expect(bal('C')).toBe(-18150)
    expect(bal('D')).toBe(-18650)
    expect(bal('E')).toBe(-22150)
  })

  it('E 与 C 都是净债务人（因此 E 不可能向 C 付款）', () => {
    const result = calculateSettlement(members, expenses)
    const bal = id => result.memberBalances.find(b => b.memberId === id).balance
    expect(bal('E')).toBeLessThan(0)
    expect(bal('C')).toBeLessThan(0)
  })

  it('E 的所有转账都付给 A，且不存在 E→C 的转账', () => {
    const result = calculateSettlement(members, expenses)
    const eTx = result.transactions.filter(t => t.fromId === 'E')
    expect(eTx.length).toBeGreaterThan(0)
    eTx.forEach(t => expect(t.toId).toBe('A'))
    expect(result.transactions.some(t => t.fromId === 'E' && t.toId === 'C')).toBe(false)
  })

  it('转账总额等于所有债务人欠款总额', () => {
    const result = calculateSettlement(members, expenses)
    const totalDebt = result.memberBalances
      .filter(b => b.balance < 0)
      .reduce((s, b) => s + Math.abs(b.balance), 0)
    const totalTransferred = result.transactions.reduce((s, t) => s + t.amount, 0)
    expect(totalTransferred).toBe(totalDebt)
  })

  it('贪心算法给出最优转账方案：E→A、D→A、C→A、C→B', () => {
    const result = calculateSettlement(members, expenses)
    const normalized = result.transactions.map(t => `${t.fromId}->${t.toId}:${t.amount}`)
    // 期望推导：
    //   债务人降序：E(22150) > D(18650) > C(18150)
    //   债权人降序：A(48600) > B(10350)
    //   1) E(22150) 对冲 A(48600) → E→A 22150, A 剩 26450
    //   2) D(18650) 对冲 A(26450) → D→A 18650, A 剩 7800
    //   3) C(18150) 对冲 A(7800)  → C→A 7800,  C 剩 10350, A 完
    //   4) C(10350) 对冲 B(10350) → C→B 10350, 双方完
    expect(normalized).toEqual([
      'E->A:22150',
      'D->A:18650',
      'C->A:7800',
      'C->B:10350'
    ])
  })
})
