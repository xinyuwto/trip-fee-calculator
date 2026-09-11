import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SYNC_URL, validateSyncCode, generateSyncCode, pullTrip, mergeSync, matchDuplicate, findDuplicateRecords } from '../sync'

const okResp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

const validTrip = {
  name: '测试旅行',
  members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }],
  expenses: []
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('validateSyncCode', () => {
  it('accepts valid code', () => {
    expect(validateSyncCode('K3X9QA2M')).toBe(true)
  })
  it('accepts lowercase with surrounding spaces', () => {
    expect(validateSyncCode(' k3x9qa2m ')).toBe(true)
  })
  it('rejects excluded chars and wrong length', () => {
    expect(validateSyncCode('K3X9QA2O')).toBe(false)
    expect(validateSyncCode('K3X9QA2L')).toBe(false)
    expect(validateSyncCode('K3X9QA2')).toBe(false)
    expect(validateSyncCode('')).toBe(false)
    expect(validateSyncCode(null)).toBe(false)
  })
})

describe('generateSyncCode', () => {
  it('generates 8-char code from the allowed charset', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSyncCode()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/)
    }
  })
})

describe('pullTrip', () => {
  it('returns trip data on success and normalizes code to uppercase', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(200, {
      payload: validTrip, revision: 3, updatedAt: 't', updatedBy: '甲'
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await pullTrip(' k3x9qa2m ')
    expect(result).toEqual({ success: true, payload: validTrip, revision: 3, updatedAt: 't', updatedBy: '甲' })
    expect(fetchMock).toHaveBeenCalledWith(`${SYNC_URL}?code=K3X9QA2M`)
  })
  it('returns TRIP_NOT_FOUND on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(404, { error: 'TRIP_NOT_FOUND' })))
    const result = await pullTrip('K3X9QA2M')
    expect(result.success).toBe(false)
    expect(result.code).toBe('TRIP_NOT_FOUND')
    expect(result.message).toBeTruthy()
  })
  it('returns INVALID_CODE on 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(400, { error: 'INVALID_CODE' })))
    const result = await pullTrip('bad')
    expect(result.success).toBe(false)
    expect(result.code).toBe('INVALID_CODE')
  })
  it('returns NETWORK_ERROR when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    const result = await pullTrip('K3X9QA2M')
    expect(result.success).toBe(false)
    expect(result.code).toBe('NETWORK_ERROR')
  })
})

describe('mergeSync', () => {
  const localTrip = { name: 't', members: [{ id: 'm1', name: '甲' }, { id: 'm2', name: '乙' }], expenses: [] }

  it('returns merged payload and posts correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(200, { status: 'merged', payload: localTrip, revision: 3 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await mergeSync({ code: 'k3x9qa2m', payload: localTrip, myMemberId: 'm1' })
    expect(result).toEqual({ success: true, status: 'merged', payload: localTrip, revision: 3, duplicates: [] })
    expect(fetchMock).toHaveBeenCalledWith(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'merge', code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1', dedupDecisions: undefined })
    })
  })
  it('returns duplicates list on duplicates_found', async () => {
    const dups = [{ local: { id: 'a' }, remote: { id: 'b' } }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(200, { status: 'duplicates_found', payload: localTrip, revision: 5, duplicates: dups })))
    const result = await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })
    expect(result.success).toBe(true)
    expect(result.status).toBe('duplicates_found')
    expect(result.duplicates).toEqual(dups)
  })
  it('sends dedupDecisions when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(200, { status: 'merged', payload: localTrip, revision: 6 }))
    vi.stubGlobal('fetch', fetchMock)
    const decisions = [{ localId: 'a', remoteId: 'b', action: 'duplicate' }]
    await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1', dedupDecisions: decisions })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).dedupDecisions).toEqual(decisions)
  })
  it('maps error statuses to result objects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(404, { error: 'TRIP_NOT_FOUND' })))
    expect((await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })).code).toBe('TRIP_NOT_FOUND')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(400, { error: 'PAYLOAD_TOO_LARGE' })))
    expect((await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })).code).toBe('PAYLOAD_TOO_LARGE')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    expect((await mergeSync({ code: 'K3X9QA2M', payload: localTrip, myMemberId: 'm1' })).code).toBe('NETWORK_ERROR')
  })
})

describe('matchDuplicate / findDuplicateRecords (frontend copy)', () => {
  const rec = (id, over = {}) => ({ id, purpose: '正餐', amount: 5000, payerId: 'm1', beneficiaryIds: ['m1', 'm2'], ...over })
  it('matches on four factors, ignores beneficiary order', () => {
    expect(matchDuplicate(rec('a'), rec('b'))).toBe(true)
    expect(matchDuplicate(rec('a'), rec('b', { beneficiaryIds: ['m2', 'm1'] }))).toBe(true)
    expect(matchDuplicate(rec('a'), rec('b', { amount: 5001 }))).toBe(false)
  })
  it('findDuplicateRecords excludes by id and returns all matches', () => {
    const records = [rec('a'), rec('b'), rec('c', { amount: 999 })]
    expect(findDuplicateRecords(rec('x'), records).map((r) => r.id)).toEqual(['a', 'b'])
    expect(findDuplicateRecords(rec('a'), records, 'a').map((r) => r.id)).toEqual(['b'])
  })
})
