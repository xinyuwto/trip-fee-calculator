import { describe, it, expect } from 'vitest'
import { sortBeneficiaryIds } from '../ExpenseList.vue'

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
})
