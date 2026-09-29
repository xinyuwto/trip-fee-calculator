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
 * proxies：{ [被代付人id]: 付款人id } —— 完全承担：被代付人的垫付与应承担均归付款人，
 * 被代付人退出转账方案；明细（paid/owed/balance）保持原样分开记账。
 *
 * @param {Array<{id: string, name: string}>} members
 * @param {Array<{amount: number, payerId: string, beneficiaryIds: string[]}>} expenses
 * @param {Object} [proxies]
 * @returns {{ memberBalances: Array, transactions: Array }}
 */
export function calculateSettlement(members, expenses, proxies = {}) {
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

  // 代付：付款人吸收被代付人的原净额，被代付人调整净额归零
  const balanceById = new Map(memberBalances.map(b => [b.memberId, b.balance]))
  const nameById = new Map(members.map(m => [m.id, m.name]))
  const absorbedBy = new Map() // payerId -> [{ id, name, rawBalance }]
  for (const b of memberBalances) {
    b.adjustedBalance = b.balance
    b.absorbed = []
    if (proxies[b.memberId]) b.proxyPayerId = proxies[b.memberId]
  }
  for (const b of memberBalances) {
    const payerId = proxies[b.memberId]
    if (!payerId || !balanceById.has(payerId)) continue
    const payer = memberBalances.find(x => x.memberId === payerId)
    payer.adjustedBalance += b.balance
    b.adjustedBalance = 0
    if (!absorbedBy.has(payerId)) absorbedBy.set(payerId, [])
    absorbedBy.get(payerId).push({ id: b.memberId, name: b.memberName, rawBalance: b.balance })
  }
  for (const b of memberBalances) {
    if (absorbedBy.has(b.memberId)) b.absorbed = absorbedBy.get(b.memberId)
  }

  // 贪心算法计算最少交易笔数（基于调整后净额）
  const debtors = memberBalances
    .filter(b => b.adjustedBalance < 0)
    .map(b => ({ ...b, adjustedBalance: -b.adjustedBalance }))
    .sort((a, b) => b.adjustedBalance - a.adjustedBalance)

  const creditors = memberBalances
    .filter(b => b.adjustedBalance > 0)
    .map(b => ({ ...b }))
    .sort((a, b) => b.adjustedBalance - a.adjustedBalance)

  const transactions = []
  let di = 0, ci = 0

  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].adjustedBalance, creditors[ci].adjustedBalance)
    if (amount > 0) {
      transactions.push({
        fromId: debtors[di].memberId,
        fromName: debtors[di].memberName,
        toId: creditors[ci].memberId,
        toName: creditors[ci].memberName,
        amount
      })
    }
    debtors[di].adjustedBalance -= amount
    creditors[ci].adjustedBalance -= amount
    if (debtors[di].adjustedBalance === 0) di++
    if (creditors[ci].adjustedBalance === 0) ci++
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
export function analyzeSettlement(members, expenses, proxies = {}) {
  const settlement = calculateSettlement(members, expenses, proxies)

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
      balance: Math.round(balance),
      adjustedBalance: settlement.memberBalances.find(b => b.memberId === me.id)?.adjustedBalance ?? Math.round(balance)
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
        [0]?.memberName || '',
      maxDebtorName: settlement.memberBalances
        .filter(b => b.balance < 0)
        .sort((a, b) => a.balance - b.balance)
        [0]?.memberName || ''
    }

    // 代付：被代付人 narrativeHint 覆写为 proxied 并附付款人原明细；付款人附 absorbed 清单
    const myPayerId = proxies[me.id]
    if (myPayerId && members.some(m => m.id === myPayerId)) {
      why.narrativeHint = 'proxied'
      why.payerName = members.find(m => m.id === myPayerId)?.name || ''
      why.rawPaid = netCard.paid
      why.rawOwed = netCard.owed
    } else {
      const absorbedBalances = settlement.memberBalances.find(b => b.memberId === me.id)?.absorbed || []
      if (absorbedBalances.length > 0) {
        why.absorbed = absorbedBalances.map(a => ({
          name: a.name,
          paid: settlement.memberBalances.find(b => b.memberId === a.id)?.paid || 0,
          owed: settlement.memberBalances.find(b => b.memberId === a.id)?.owed || 0
        }))
      }
      why.narrativeHint = why.isNetCreditor
        ? why.totalPaidForOthers > why.totalOthersPaidForMe * 2 ? 'major_creditor' : 'creditor'
        : why.isNetDebtor ? 'debtor' : 'even'
    }

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
