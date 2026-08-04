/**
 * Calculate a single beneficiary's share of an expense.
 * Uses integer division with remainder distributed to the first N beneficiaries.
 *
 * @param {{amount: number, beneficiaryIds: string[]}} expense
 * @param {string} memberId
 * @returns {number} share in cents
 */
export function shareOf(expense, memberId) {
  if (!expense.beneficiaryIds.includes(memberId)) return 0
  const base = Math.floor(expense.amount / expense.beneficiaryIds.length)
  const remainder = expense.amount % expense.beneficiaryIds.length
  const idx = expense.beneficiaryIds.indexOf(memberId)
  return Math.round(base + (idx < remainder ? 1 : 0))
}

/**
 * 计算谁欠谁多少钱。
 *
 * @param {Array<{id: string, name: string}>} members
 * @param {Array<{amount: number, payerId: string, beneficiaryIds: string[]}>} expenses
 * @returns {{ memberBalances: Array, transactions: Array }}
 */
export function calculateSettlement(members, expenses) {
  // paid[m.id] = 该成员总共支付的金额
  const paid = new Map(members.map(m => [m.id, 0]))
  // owed[m.id] = 该成员总共应承担的金额
  const owed = new Map(members.map(m => [m.id, 0]))

  for (const exp of expenses) {
    const payerId = exp.payerId
    paid.set(payerId, (paid.get(payerId) || 0) + exp.amount)

    const baseShare = Math.floor(exp.amount / exp.beneficiaryIds.length)
    const remainder = exp.amount % exp.beneficiaryIds.length
    for (let i = 0; i < exp.beneficiaryIds.length; i++) {
      const share = baseShare + (i < remainder ? 1 : 0)
      const bid = exp.beneficiaryIds[i]
      owed.set(bid, (owed.get(bid) || 0) + share)
    }
  }

  const memberBalances = members.map(m => {
    const p = paid.get(m.id) || 0
    const o = owed.get(m.id) || 0
    return {
      memberId: m.id,
      memberName: m.name,
      paid: Math.round(p),
      owed: Math.round(o),
      balance: Math.round(p - o)
    }
  })

  // 贪心算法计算最少交易笔数
  const debtors = memberBalances
    .filter(b => b.balance < 0)
    .map(b => ({ ...b, balance: -b.balance }))
    .sort((a, b) => b.balance - a.balance)

  const creditors = memberBalances
    .filter(b => b.balance > 0)
    .map(b => ({ ...b }))
    .sort((a, b) => b.balance - a.balance)

  const transactions = []
  let di = 0, ci = 0

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].balance, creditors[ci].balance)
    if (amount > 0) {
      transactions.push({
        fromId: debtors[di].memberId,
        fromName: debtors[di].memberName,
        toId: creditors[ci].memberId,
        toName: creditors[ci].memberName,
        amount
      })
    }
    debtors[di].balance -= amount
    creditors[ci].balance -= amount
    if (debtors[di].balance === 0) di++
    if (creditors[ci].balance === 0) ci++
  }

  return { memberBalances, transactions: transactions.sort((a, b) => a.fromName.localeCompare(b.fromName, 'zh-CN')) }
}

function fmtTime(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 完整结算分析：每人视角的净额、转账任务、双向往来明细、why 文案数据。
 *
 * @param {Array<{id: string, name: string}>} members
 * @param {Array<{id: string, purpose: string, amount: number, payerId: string, beneficiaryIds: string[], createdAt: string, note?: string}>} expenses
 * @returns {{
 *   memberBalances: Array,
 *   transactions: Array,
 *   members: Array<{
 *     memberId: string,
 *     memberName: string,
 *     netCard: { isPositive: boolean, paid: number, owed: number, balance: number },
 *     tasks: Array<{ fromId: string, fromName: string, toId: string, toName: string, amount: number, direction: 'in' | 'out' }>,
 *     relations: Array<{ peerId: string, peerName: string, iPaidForPeer: Array, peerPaidForMe: Array, iGave: number, theyGave: number, net: number }>,
 *     why: { isNetCreditor: boolean, isNetDebtor: boolean, isEven: boolean, totalPaidForOthers: number, totalOthersPaidForMe: number, maxCreditorName: string, maxDebtorName: string, narrativeHint: string }
 *   }>
 * }}
 */
export function analyzeSettlement(members, expenses) {
  const settlement = calculateSettlement(members, expenses)

  const membersData = members.map(me => {
    let paid = 0
    let owed = 0

    const iPaidFor = {}
    const theyPaidForMe = {}
    const iPaidForBills = {}
    const theyPaidForMeBills = {}

    for (const other of members) {
      if (other.id !== me.id) {
        iPaidFor[other.id] = 0
        theyPaidForMe[other.id] = 0
        iPaidForBills[other.id] = []
        theyPaidForMeBills[other.id] = []
      }
    }

    for (const exp of expenses) {
      const myShare = shareOf(exp, me.id)
      owed += myShare

      if (exp.payerId === me.id) {
        paid += exp.amount
        for (const other of exp.beneficiaryIds) {
          if (other !== me.id) {
            const s = shareOf(exp, other)
            iPaidFor[other] += s
            iPaidForBills[other].push({
              expenseId: exp.id,
              purpose: exp.purpose,
              totalAmount: exp.amount,
              share: s,
              beneficiaryCount: exp.beneficiaryIds.length,
              time: fmtTime(exp.createdAt)
            })
          }
        }
      } else if (exp.beneficiaryIds.includes(me.id)) {
        const payer = exp.payerId
        theyPaidForMe[payer] += myShare
        theyPaidForMeBills[payer].push({
          expenseId: exp.id,
          purpose: exp.purpose,
          totalAmount: exp.amount,
          share: myShare,
          payerName: members.find(m => m.id === payer)?.name || '',
          beneficiaryCount: exp.beneficiaryIds.length,
          time: fmtTime(exp.createdAt)
        })
      }
    }

    const balance = Math.round(paid - owed)

    // Tasks from transactions
    const tasks = settlement.transactions
      .filter(t => t.fromId === me.id || t.toId === me.id)
      .map(t => ({
        fromId: t.fromId,
        fromName: t.fromName,
        toId: t.toId,
        toName: t.toName,
        amount: t.amount,
        direction: t.fromId === me.id ? 'out' : 'in'
      }))

    // Relations
    const relations = members
      .filter(o => o.id !== me.id)
      .map(o => ({
        peerId: o.id,
        peerName: o.name,
        iPaidForPeer: iPaidForBills[o.id] || [],
        peerPaidForMe: theyPaidForMeBills[o.id] || [],
        iGave: Math.round(iPaidFor[o.id] || 0),
        theyGave: Math.round(theyPaidForMe[o.id] || 0),
        net: Math.round((iPaidFor[o.id] || 0) - (theyPaidForMe[o.id] || 0))
      }))
      .sort((a, b) => (b.iGave + b.theyGave) - (a.iGave + a.theyGave))

    // Why data
    const netCard = {
      isPositive: balance >= 0,
      paid: Math.round(paid),
      owed: Math.round(owed),
      balance: Math.round(balance)
    }

    const why = {
      isNetCreditor: balance > 0,
      isNetDebtor: balance < 0,
      isEven: balance === 0,
      totalPaidForOthers: Math.round(Object.values(iPaidFor).reduce((s, v) => s + v, 0)),
      totalOthersPaidForMe: Math.round(Object.values(theyPaidForMe).reduce((s, v) => s + v, 0)),
      maxCreditorName: settlement.memberBalances
        .filter(b => b.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .pop()?.memberName || '',
      maxDebtorName: settlement.memberBalances
        .filter(b => b.balance < 0)
        .sort((a, b) => a.balance - b.balance)
        .pop()?.memberName || ''
    }
    why.narrativeHint = why.isNetCreditor
      ? why.totalPaidForOthers > why.totalOthersPaidForMe * 2 ? 'major_creditor' : 'creditor'
      : why.isNetDebtor ? 'debtor' : 'even'

    return {
      memberId: me.id,
      memberName: me.name,
      netCard,
      tasks,
      relations,
      why
    }
  })

  return {
    memberBalances: settlement.memberBalances,
    transactions: settlement.transactions,
    members: membersData
  }
}
