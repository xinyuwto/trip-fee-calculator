import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SYNC_URL, validateSyncCode, generateSyncCode, pullTrip, pushTrip } from '../sync'

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

describe('pushTrip', () => {
  it('returns revision on success and posts correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResp(200, { revision: 4 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await pushTrip({ code: 'k3x9qa2m', baseRevision: 3, payload: validTrip, updatedBy: '甲' })
    expect(result).toEqual({ success: true, revision: 4 })
    expect(fetchMock).toHaveBeenCalledWith(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'K3X9QA2M', baseRevision: 3, payload: validTrip, updatedBy: '甲', force: false })
    })
  })
  it('returns conflict details on 409', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(409, {
      error: 'REVISION_CONFLICT', remoteRevision: 5, remoteUpdatedAt: 't2', remoteUpdatedBy: '乙'
    })))
    const result = await pushTrip({ code: 'K3X9QA2M', baseRevision: 3, payload: validTrip, updatedBy: '甲' })
    expect(result.success).toBe(false)
    expect(result.code).toBe('REVISION_CONFLICT')
    expect(result.remoteRevision).toBe(5)
    expect(result.remoteUpdatedBy).toBe('乙')
  })
  it('returns PAYLOAD_TOO_LARGE on 400 PAYLOAD_TOO_LARGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResp(400, { error: 'PAYLOAD_TOO_LARGE' })))
    const result = await pushTrip({ code: 'K3X9QA2M', baseRevision: 3, payload: validTrip, updatedBy: '甲' })
    expect(result.code).toBe('PAYLOAD_TOO_LARGE')
  })
  it('returns NETWORK_ERROR when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    const result = await pushTrip({ code: 'K3X9QA2M', baseRevision: 0, payload: validTrip, updatedBy: '甲' })
    expect(result.code).toBe('NETWORK_ERROR')
  })
})
