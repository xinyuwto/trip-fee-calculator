import { describe, it, expect } from 'vitest'
import { calculateSettlement, shareOf, analyzeSettlement } from '../settlement'

describe('shareOf', () => {
  it('returns 0 when member is not a beneficiary', () => {
    const exp = { amount: 100, beneficiaryIds: ['A', 'B'] }
    expect(shareOf(exp, 'C')).toBe(0)
  })

  it('evenly divides when amount is multiple of beneficiary count', () => {
    const exp = { amount: 300, beneficiaryIds: ['A', 'B', 'C'] }
    expect(shareOf(exp, 'A')).toBe(100)
    expect(shareOf(exp, 'B')).toBe(100)
    expect(shareOf(exp, 'C')).toBe(100)
  })

  it('distributes remainder to first N beneficiaries', () => {
    // 100 / 3 = 33 remainder 1 → first gets 34, rest 33
    const exp = { amount: 100, beneficiaryIds: ['A', 'B', 'C'] }
    expect(shareOf(exp, 'A')).toBe(34)
    expect(shareOf(exp, 'B')).toBe(33)
    expect(shareOf(exp, 'C')).toBe(33)
  })

  it('distributes remainder of 2 across first 2 beneficiaries', () => {
    // 101 / 3 = 33 remainder 2 → first two get 34, last 33
    const exp = { amount: 101, beneficiaryIds: ['A', 'B', 'C'] }
    expect(shareOf(exp, 'A')).toBe(34)
    expect(shareOf(exp, 'B')).toBe(34)
    expect(shareOf(exp, 'C')).toBe(33)
  })

  it('handles single beneficiary (no remainder)', () => {
    const exp = { amount: 500, beneficiaryIds: ['X'] }
    expect(shareOf(exp, 'X')).toBe(500)
  })
})

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

  it('transactions sorted by payer name', () => {
    const members5 = [
      { id: '1', name: '陈五' },
      { id: '2', name: '张三' },
      { id: '3', name: '李四' },
      { id: '4', name: '王二' }
    ]
    const expenses = [
      { amount: 400, payerId: '1', beneficiaryIds: ['1', '2', '3', '4'] }
    ]
    const result = calculateSettlement(members5, expenses)
    // 陈五 paid 400 owed 100 → +300, others -100 each
    // transactions: 张三→陈五, 李四→陈五, 王二→陈五
    // sorted by fromName: 李四, 王二, 张三 (pinyin order)
    expect(result.transactions).toHaveLength(3)
    const names = result.transactions.map(t => t.fromName)
    const sorted = [...names].sort((a, b) => a.localeCompare(b.toLocaleLowerCase(), 'zh-CN'))
    expect(names).toEqual(sorted)
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

  it('贪心算法给出最优转账方案：C→A、C→B、D→A、E→A', () => {
    const result = calculateSettlement(members, expenses)
    const normalized = result.transactions.map(t => `${t.fromId}->${t.toId}:${t.amount}`)
    // 期望推导（按转出人 fromName 排序，zh-CN 顺序）：
    //   债务人降序：E(22150) > D(18650) > C(18150)
    //   债权人降序：A(48600) > B(10350)
    //   1) E(22150) 对冲 A(48600) → E→A 22150, A 剩 26450
    //   2) D(18650) 对冲 A(26450) → D→A 18650, A 剩 7800
    //   3) C(18150) 对冲 A(7800)  → C→A 7800,  C 剩 10350, A 完
    //   4) C(10350) 对冲 B(10350) → C→B 10350, 双方完
    // 排序后：C→A(7800)、C→B(10350)、D→A(18650)、E→A(22150)
    expect(normalized).toEqual([
      'C->A:7800',
      'C->B:10350',
      'D->A:18650',
      'E->A:22150'
    ])
  })
})

describe('analyzeSettlement', () => {
  const members = [
    { id: 'A', name: 'Alice' },
    { id: 'B', name: 'Bob' },
    { id: 'C', name: 'Charlie' }
  ]
  const expenses = [
    { id: 'e1', purpose: '午餐', amount: 300, payerId: 'A', beneficiaryIds: ['A', 'B', 'C'], createdAt: '2026-08-01T12:00:00Z' },
    { id: 'e2', purpose: '咖啡', amount: 200, payerId: 'B', beneficiaryIds: ['B', 'C'], createdAt: '2026-08-01T15:00:00Z' }
  ]

  it('returns memberBalances and transactions from calculateSettlement', () => {
    const result = analyzeSettlement(members, expenses)
    expect(result.memberBalances).toBeDefined()
    expect(result.transactions).toBeDefined()
    expect(result.members).toHaveLength(3)
  })

  it('computes correct net amounts per member', () => {
    const result = analyzeSettlement(members, expenses)
    // A: paid 300, owed 100 (午餐/3人) = 100, balance +200
    // B: paid 200, owed (午餐 100 + 咖啡 100) = 200, balance 0
    // C: paid 0, owed (午餐 100 + 咖啡 100) = 200, balance -200
    const alice = result.members.find(m => m.memberId === 'A')
    const bob = result.members.find(m => m.memberId === 'B')
    const charlie = result.members.find(m => m.memberId === 'C')
    expect(alice.netCard.paid).toBe(300)
    expect(alice.netCard.owed).toBe(100)
    expect(alice.netCard.balance).toBe(200)
    expect(bob.netCard.paid).toBe(200)
    expect(bob.netCard.owed).toBe(200)
    expect(bob.netCard.balance).toBe(0)
    expect(charlie.netCard.paid).toBe(0)
    expect(charlie.netCard.owed).toBe(200)
    expect(charlie.netCard.balance).toBe(-200)
  })

  it('builds task list for each member', () => {
    const result = analyzeSettlement(members, expenses)
    const charlie = result.members.find(m => m.memberId === 'C')
    // C has negative balance, should have outgoing tasks
    expect(charlie.tasks.length).toBeGreaterThan(0)
    const task = charlie.tasks[0]
    expect(task.fromId).toBe('C')
    expect(task.direction).toBe('out')
    expect(task.amount).toBeGreaterThan(0)
  })

  it('builds relations with bill details', () => {
    const result = analyzeSettlement(members, expenses)
    const alice = result.members.find(m => m.memberId === 'A')
    // A paid for B (via e1: 午餐, share 100)
    const relWithBob = alice.relations.find(r => r.peerId === 'B')
    expect(relWithBob).toBeDefined()
    expect(relWithBob.iGave).toBe(100)
    expect(relWithBob.iPaidForPeer.length).toBeGreaterThan(0)
    const bill = relWithBob.iPaidForPeer[0]
    expect(bill.purpose).toBe('午餐')
    expect(bill.share).toBe(100)
    expect(bill.totalAmount).toBe(300)
  })

  it('relations sorted by total flow descending', () => {
    const members4 = [
      { id: 'A', name: 'Alice' },
      { id: 'B', name: 'Bob' },
      { id: 'C', name: 'Charlie' },
      { id: 'D', name: 'Diana' }
    ]
    const expenses4 = [
      { id: 'e1', purpose: 'A付全款', amount: 400, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D'], createdAt: '2026-08-01T12:00:00Z' },
      { id: 'e2', purpose: 'B付少', amount: 200, payerId: 'B', beneficiaryIds: ['B', 'D'], createdAt: '2026-08-01T13:00:00Z' }
    ]
    const result = analyzeSettlement(members4, expenses4)
    const alice = result.members.find(m => m.memberId === 'A')
    // A's relations: B(100 flow), C(100), D(100+100=200)
    // 200 > 100, so D should be first
    const flowAmounts = alice.relations.map(r => r.iGave + r.theyGave)
    for (let i = 1; i < flowAmounts.length; i++) {
      expect(flowAmounts[i - 1]).toBeGreaterThanOrEqual(flowAmounts[i])
    }
  })

  it('includes why data with narrativeHint', () => {
    const result = analyzeSettlement(members, expenses)
    const alice = result.members.find(m => m.memberId === 'A')
    expect(alice.why).toBeDefined()
    expect(alice.why.isNetCreditor).toBe(true)
    expect(alice.why.maxCreditorName).toBeDefined()
    expect(alice.why.narrativeHint).toBeDefined()
  })

  it('maxCreditorName and maxDebtorName return correct extremes with multiple creditors and debtors', () => {
    // 4 members: 2 creditors (A+650, B+50), 2 debtors (C-400, D-300)
    const members4 = [
      { id: 'A', name: 'Alice' },
      { id: 'B', name: 'Bob' },
      { id: 'C', name: 'Charlie' },
      { id: 'D', name: 'Diana' }
    ]
    const expenses4 = [
      { id: 'e1', purpose: '酒店', amount: 1000, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D'], createdAt: '2026-08-01T12:00:00Z' },
      { id: 'e2', purpose: '晚餐', amount: 400, payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D'], createdAt: '2026-08-01T18:00:00Z' },
      { id: 'e3', purpose: '咖啡', amount: 100, payerId: 'D', beneficiaryIds: ['C', 'D'], createdAt: '2026-08-01T15:00:00Z' }
    ]
    const result = analyzeSettlement(members4, expenses4)
    // Verify balances first
    const a = result.memberBalances.find(b => b.memberId === 'A')
    const b = result.memberBalances.find(b => b.memberId === 'B')
    const c = result.memberBalances.find(b => b.memberId === 'C')
    const d = result.memberBalances.find(b => b.memberId === 'D')
    expect(a.balance).toBe(650)
    expect(b.balance).toBe(50)
    expect(c.balance).toBe(-400)
    expect(d.balance).toBe(-300)
    // All members should have the same maxCreditorName / maxDebtorName
    const alice = result.members.find(m => m.memberId === 'A')
    const charlie = result.members.find(m => m.memberId === 'C')
    expect(alice.why.maxCreditorName).toBe('Alice')
    expect(alice.why.maxDebtorName).toBe('Charlie')
    expect(charlie.why.maxCreditorName).toBe('Alice')
    expect(charlie.why.maxDebtorName).toBe('Charlie')
  })

  it('includes time field in bill details for display', () => {
    const result = analyzeSettlement(members, expenses)
    const bob = result.members.find(m => m.memberId === 'B')
    const aliceRelation = bob.relations.find(r => r.peerId === 'A')
    const aBills = aliceRelation.peerPaidForMe
    expect(aBills.length).toBeGreaterThan(0)
    expect(aBills[0].time).toBeDefined()
    expect(aBills[0].beneficiaryCount).toBe(3)
  })

  it('member with zero balance has no tasks', () => {
    const result = analyzeSettlement(members, expenses)
    const bob = result.members.find(m => m.memberId === 'B')
    expect(bob.tasks).toEqual([])
  })
})

describe('calculateSettlement — 代付（proxies）', () => {
  // 确认场景：4 人，B 垫付 ¥200（全员受益各欠 50）+ C 垫付 ¥100（全员受益各欠 25）
  const members = [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
    { id: 'C', name: 'C' },
    { id: 'D', name: 'D' }
  ]
  const expenses = [
    { amount: 20000, payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D'] },
    { amount: 10000, payerId: 'C', beneficiaryIds: ['A', 'B', 'C', 'D'] }
  ]
  // 无代付基线：A −7500, B +12500, C +2500, D −7500
  // 贪心：A→B 7500, D→B 5000, D→C 2500

  it('无 proxies 时 adjustedBalance 等于 balance，absorbed 为空（回归保证）', () => {
    const result = calculateSettlement(members, expenses)
    result.memberBalances.forEach(b => {
      expect(b.adjustedBalance).toBe(b.balance)
      expect(b.absorbed).toEqual([])
      expect(b.proxyPayerId).toBeUndefined()
    })
    const names = result.transactions.map(t => `${t.fromId}->${t.toId}:${t.amount}`)
    expect(names).toEqual(['A->B:7500', 'D->B:5000', 'D->C:2500'])
  })

  it('A 帮 B 代付（完全承担）：B 退出转账方案，A 净额合并 B 的原净额', () => {
    const proxies = { B: 'A' }
    const result = calculateSettlement(members, expenses, proxies)

    const a = result.memberBalances.find(b => b.memberId === 'A')
    const b = result.memberBalances.find(b => b.memberId === 'B')
    const c = result.memberBalances.find(b => b.memberId === 'C')

    expect(b.adjustedBalance).toBe(0)
    expect(b.proxyPayerId).toBe('A')
    expect(b.balance).toBe(12500) // raw 明细保持分开
    expect(a.adjustedBalance).toBe(-7500 + 12500) // 5000
    expect(a.balance).toBe(-7500) // raw 不变
    expect(a.absorbed).toEqual([{ id: 'B', name: 'B', rawBalance: 12500 }])
    expect(c.adjustedBalance).toBe(2500) // 未涉及者不受影响

    // 转账方案：B 不出现；D 付 A 与 C
    expect(result.transactions.some(t => t.fromId === 'B' || t.toId === 'B')).toBe(false)
    const names = result.transactions.map(t => `${t.fromId}->${t.toId}:${t.amount}`)
    expect(names).toEqual(['D->A:5000', 'D->C:2500'])
  })

  it('被代付人是净债务人时：付款人 adjustedBalance 减少（方向双验证）', () => {
    // A 垫付 ¥200 全员受益：A +15000, B/C/D 各 −5000
    const exp2 = [{ amount: 20000, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D'] }]
    const proxies = { B: 'A' }
    const result = calculateSettlement(members, exp2, proxies)
    const a = result.memberBalances.find(b => b.memberId === 'A')
    const b = result.memberBalances.find(b => b.memberId === 'B')
    expect(b.balance).toBe(-5000)
    expect(a.balance).toBe(15000)
    expect(a.adjustedBalance).toBe(10000) // 15000 + (−5000)
    // B 退出，C、D 付 A
    expect(result.transactions.some(t => t.fromId === 'B')).toBe(false)
    const names = result.transactions.map(t => `${t.fromId}->${t.toId}:${t.amount}`)
    expect(names).toEqual(['C->A:5000', 'D->A:5000'])
  })

  it('家庭多人代付（B、C → A）：两人都退出，A absorbed 两项', () => {
    const proxies = { B: 'A', C: 'A' }
    const result = calculateSettlement(members, expenses, proxies)
    const a = result.memberBalances.find(b => b.memberId === 'A')
    expect(a.adjustedBalance).toBe(-7500 + 12500 + 2500) // 7500
    expect(a.absorbed).toEqual([
      { id: 'B', name: 'B', rawBalance: 12500 },
      { id: 'C', name: 'C', rawBalance: 2500 }
    ])
    expect(result.transactions.some(t => t.fromId === 'B' || t.fromId === 'C')).toBe(false)
    const names = result.transactions.map(t => `${t.fromId}->${t.toId}:${t.amount}`)
    expect(names).toEqual(['D->A:7500'])
  })

  it('全员平账时代付无实质影响', () => {
    const even = [
      { amount: 30000, payerId: 'A', beneficiaryIds: ['A', 'B', 'C', 'D'] },
      { amount: 30000, payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D'] },
      { amount: 30000, payerId: 'C', beneficiaryIds: ['A', 'B', 'C', 'D'] },
      { amount: 30000, payerId: 'D', beneficiaryIds: ['A', 'B', 'C', 'D'] }
    ]
    const result = calculateSettlement(members, even, { B: 'A' })
    result.memberBalances.forEach(b => expect(b.adjustedBalance).toBe(0))
    expect(result.transactions).toHaveLength(0)
  })
})

describe('analyzeSettlement — 代付', () => {
  const members = [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
    { id: 'C', name: 'C' },
    { id: 'D', name: 'D' }
  ]
  const expenses = [
    { id: 'e1', purpose: '午餐', amount: 20000, payerId: 'B', beneficiaryIds: ['A', 'B', 'C', 'D'], createdAt: '2026-09-29T12:00:00Z' },
    { id: 'e2', purpose: '咖啡', amount: 10000, payerId: 'C', beneficiaryIds: ['A', 'B', 'C', 'D'], createdAt: '2026-09-29T15:00:00Z' }
  ]
  const proxies = { B: 'A' }

  it('被代付人：narrativeHint 为 proxied，tasks 为空，why 含付款人与原明细', () => {
    const result = analyzeSettlement(members, expenses, proxies)
    const b = result.members.find(m => m.memberId === 'B')
    expect(b.why.narrativeHint).toBe('proxied')
    expect(b.why.payerName).toBe('A')
    expect(b.why.rawPaid).toBe(20000)
    expect(b.why.rawOwed).toBe(7500)
    expect(b.tasks).toEqual([])
    expect(b.netCard.adjustedBalance).toBe(0)
    expect(b.netCard.balance).toBe(12500) // raw 保留
  })

  it('付款人：why.absorbed 列出代付成员的原明细', () => {
    const result = analyzeSettlement(members, expenses, proxies)
    const a = result.members.find(m => m.memberId === 'A')
    expect(a.why.absorbed).toEqual([{ name: 'B', paid: 20000, owed: 7500 }])
    expect(a.netCard.adjustedBalance).toBe(5000)
    expect(a.tasks.length).toBeGreaterThan(0) // D→A 属于 A 的任务
  })

  it('与他人往来明细保持分开记账（不受代付影响）', () => {
    const result = analyzeSettlement(members, expenses, proxies)
    const b = result.members.find(m => m.memberId === 'B')
    const relWithA = b.relations.find(r => r.peerId === 'A')
    expect(relWithA.iGave).toBe(5000) // B 垫付午餐中 A 的份额
    expect(relWithA.iPaidForPeer.length).toBe(1)
  })
})
