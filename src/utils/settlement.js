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

    const share = exp.amount / exp.beneficiaryIds.length
    for (const bid of exp.beneficiaryIds) {
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
    if (debtors[di].balance < 1) di++
    if (creditors[ci].balance < 1) ci++
  }

  return { memberBalances, transactions }
}
