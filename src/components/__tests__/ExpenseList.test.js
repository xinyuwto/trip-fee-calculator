import { describe, it, expect } from 'vitest'
import { sortBeneficiaryIds, sortExpensesDesc } from '../ExpenseList.vue'

describe('ExpenseList', () => {
  describe('sortBeneficiaryIds', () => {
    it('sorts beneficiary IDs by member order regardless of input order', () => {
      const members = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Charlie' },
        { id: 'd', name: 'Dave' }
      ]

      // Input in reversed order — should be sorted to member order
      expect(sortBeneficiaryIds(['d', 'b', 'c', 'a'], members))
        .toEqual(['a', 'b', 'c', 'd'])
    })

    it('handles partial beneficiary list, sorted by member order', () => {
      const members = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Charlie' }
      ]

      expect(sortBeneficiaryIds(['c', 'a'], members))
        .toEqual(['a', 'c'])
    })

    it('handles single beneficiary', () => {
      const members = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' }
      ]

      expect(sortBeneficiaryIds(['b'], members)).toEqual(['b'])
    })
  })

  describe('sortExpensesDesc', () => {
    const mk = (id, createdAt) => ({ id, createdAt, purpose: 'x' })

    it('sorts by createdAt descending (newest first)', () => {
      const expenses = [mk('old', '2026-09-12T10:00:00.000Z'), mk('new', '2026-09-12T12:00:00.000Z'), mk('mid', '2026-09-12T11:00:00.000Z')]
      expect(sortExpensesDesc(expenses).map((e) => e.id)).toEqual(['new', 'mid', 'old'])
    })

    it('breaks same-minute ties by later insertion first (most recently added on top)', () => {
      const t = '2026-09-12T10:30:00.000Z'
      const expenses = [mk('first', t), mk('second', t), mk('third', t)]
      expect(sortExpensesDesc(expenses).map((e) => e.id)).toEqual(['third', 'second', 'first'])
    })

    it('tie-break does not affect distinct timestamps', () => {
      const expenses = [mk('newer', '2026-09-12T10:31:00.000Z'), mk('older', '2026-09-12T10:30:00.000Z')]
      expect(sortExpensesDesc(expenses).map((e) => e.id)).toEqual(['newer', 'older'])
    })

    it('handles mixed: distinct first, ties within groups reversed by insertion', () => {
      const t1 = '2026-09-12T09:00:00.000Z'
      const t2 = '2026-09-12T10:00:00.000Z'
      const expenses = [mk('a1', t1), mk('b1', t2), mk('a2', t1), mk('b2', t2), mk('a3', t1)]
      expect(sortExpensesDesc(expenses).map((e) => e.id)).toEqual(['b2', 'b1', 'a3', 'a2', 'a1'])
    })

    it('does not mutate the input array', () => {
      const expenses = [mk('a', '2026-09-12T10:00:00.000Z'), mk('b', '2026-09-12T11:00:00.000Z')]
      const snapshot = expenses.map((e) => e.id)
      sortExpensesDesc(expenses)
      expect(expenses.map((e) => e.id)).toEqual(snapshot)
    })
  })
})
