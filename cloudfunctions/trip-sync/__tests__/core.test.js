import { describe, it, expect } from 'vitest'
import {
  CODE_RE, MAX_PAYLOAD_BYTES, SCHEMA_VERSION,
  validateCode, normalizeCode, validatePayload, payloadBytes, decidePush
} from '../core'

const validPayload = {
  name: '测试旅行',
  members: [
    { id: 'm1', name: '甲' },
    { id: 'm2', name: '乙' }
  ],
  expenses: [
    { id: 'e1', purpose: '正餐', amount: 5000, payerId: 'm1', beneficiaryIds: ['m1', 'm2'], note: '', createdAt: '2026-09-09T00:00:00.000Z' }
  ]
}

describe('validateCode / normalizeCode', () => {
  it('accepts 8-char code from the allowed charset', () => {
    expect(validateCode('K3X9QA2M')).toBe(true)
  })
  it('accepts lowercase input (case-insensitive)', () => {
    expect(validateCode('k3x9qa2m')).toBe(true)
  })
  it('rejects excluded characters O and L', () => {
    expect(validateCode('K3X9QA2O')).toBe(false)
    expect(validateCode('K3X9QA2L')).toBe(false)
  })
  it('rejects wrong length', () => {
    expect(validateCode('K3X9QA2')).toBe(false)
    expect(validateCode('K3X9QA2MX')).toBe(false)
  })
  it('rejects non-string input', () => {
    expect(validateCode(null)).toBe(false)
    expect(validateCode(12345678)).toBe(false)
  })
  it('normalizeCode trims and uppercases', () => {
    expect(normalizeCode(' k3x9qa2m ')).toBe('K3X9QA2M')
  })
  it('normalizeCode returns empty string for null', () => {
    expect(normalizeCode(null)).toBe('')
  })
  it('exports constants', () => {
    expect(CODE_RE.source).toBe('^[2-9A-HJKMNP-Z]{8}$')
    expect(MAX_PAYLOAD_BYTES).toBe(512 * 1024)
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('validatePayload', () => {
  it('accepts a valid trip payload', () => {
    expect(validatePayload(validPayload)).toBe(true)
  })
  it('accepts payload with empty expenses', () => {
    expect(validatePayload({ ...validPayload, expenses: [] })).toBe(true)
  })
  it('rejects non-object payload', () => {
    expect(validatePayload(null)).toBe(false)
    expect(validatePayload('x')).toBe(false)
  })
  it('rejects empty or non-string name', () => {
    expect(validatePayload({ ...validPayload, name: '' })).toBe(false)
    expect(validatePayload({ ...validPayload, name: 42 })).toBe(false)
  })
  it('rejects members outside 2~20', () => {
    expect(validatePayload({ ...validPayload, members: [validPayload.members[0]] })).toBe(false)
    expect(validatePayload({ ...validPayload, members: Array.from({ length: 21 }, (_, i) => ({ id: `m${i}`, name: `m${i}` })) })).toBe(false)
  })
  it('rejects member missing id or name', () => {
    expect(validatePayload({ ...validPayload, members: [{ id: 'm1' }, { id: 'm2', name: '乙' }] })).toBe(false)
  })
  it('rejects expense with missing fields', () => {
    expect(validatePayload({ ...validPayload, expenses: [{ id: 'e1' }] })).toBe(false)
    expect(validatePayload({ ...validPayload, expenses: [{ id: 'e1', purpose: 'x', amount: 0, payerId: 'm1', beneficiaryIds: [] }] })).toBe(false)
    expect(validatePayload({ ...validPayload, expenses: [{ id: 'e1', purpose: 'x', amount: 100, payerId: 'm1', beneficiaryIds: 'm1' }] })).toBe(false)
  })
})

describe('payloadBytes', () => {
  it('returns UTF-8 byte length of serialized payload', () => {
    // {"a":"中"} → 8 个 ASCII 字符 + "中" 3 字节 = 11
    expect(payloadBytes({ a: '中' })).toBe(11)
  })
})

describe('decidePush', () => {
  const doc = { revision: 3, updatedAt: '2026-09-09T00:00:00.000Z', updatedBy: '甲' }

  it('creates revision 1 when doc missing, baseRevision 0, not force', () => {
    expect(decidePush(null, { baseRevision: 0, force: false })).toEqual({ action: 'create', newRevision: 1 })
  })
  it('returns notfound when doc missing and baseRevision > 0', () => {
    expect(decidePush(null, { baseRevision: 3, force: false })).toEqual({ action: 'notfound' })
  })
  it('returns notfound when doc missing and force (typo protection)', () => {
    expect(decidePush(null, { baseRevision: 0, force: true })).toEqual({ action: 'notfound' })
  })
  it('updates when revision matches baseRevision', () => {
    expect(decidePush(doc, { baseRevision: 3, force: false })).toEqual({ action: 'update', newRevision: 4 })
  })
  it('conflicts when remote revision is ahead', () => {
    expect(decidePush(doc, { baseRevision: 1, force: false })).toEqual({
      action: 'conflict',
      remoteRevision: 3,
      remoteUpdatedAt: '2026-09-09T00:00:00.000Z',
      remoteUpdatedBy: '甲'
    })
  })
  it('force overwrites regardless of baseRevision', () => {
    expect(decidePush(doc, { baseRevision: 1, force: true })).toEqual({ action: 'update', newRevision: 4 })
  })
})
