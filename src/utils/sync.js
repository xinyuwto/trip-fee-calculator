export const SYNC_URL = 'https://playground-d0goyj2w0f42a96b8-1457342933.ap-shanghai.app.tcloudbase.com/trip-sync'

const CODE_RE = /^[2-9A-HJKMNP-Z]{8}$/
const CODE_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function validateSyncCode(code) {
  return CODE_RE.test(String(code == null ? '' : code).trim().toUpperCase())
}

export function generateSyncCode() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < 8; i++) code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length]
  return code
}

async function fetchJson(url, options) {
  let resp
  try {
    resp = options !== undefined ? await fetch(url, options) : await fetch(url)
  } catch {
    return { resp: null, body: null }
  }
  let body = null
  try { body = await resp.json() } catch { /* 非 JSON 响应 */ }
  return { resp, body }
}

export async function pullTrip(code) {
  const normalized = String(code == null ? '' : code).trim().toUpperCase()
  const { resp, body } = await fetchJson(`${SYNC_URL}?code=${encodeURIComponent(normalized)}`)
  if (!resp) return { success: false, code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络' }
  if (resp.status === 404) return { success: false, code: 'TRIP_NOT_FOUND', message: '同步码不存在，请核对' }
  if (resp.status === 400) return { success: false, code: 'INVALID_CODE', message: '同步码格式不正确' }
  if (!resp.ok || !body) return { success: false, code: 'NETWORK_ERROR', message: '同步服务暂时不可用' }
  return {
    success: true,
    payload: body.payload,
    revision: body.revision,
    updatedAt: body.updatedAt,
    updatedBy: body.updatedBy
  }
}

export function matchDuplicate(a, b) {
  if (!a || !b) return false
  if (a.payerId !== b.payerId || a.amount !== b.amount || a.purpose !== b.purpose) return false
  if (!Array.isArray(a.beneficiaryIds) || !Array.isArray(b.beneficiaryIds)) return false
  if (a.beneficiaryIds.length !== b.beneficiaryIds.length) return false
  const setB = new Set(b.beneficiaryIds)
  return a.beneficiaryIds.every((id) => setB.has(id))
}

export function findDuplicateRecords(expense, records = [], excludeId = null) {
  return (records || []).filter((r) => r && r.id !== excludeId && matchDuplicate(expense, r))
}

export async function mergeSync({ code, payload, myMemberId, dedupDecisions }) {
  const normalized = String(code == null ? '' : code).trim().toUpperCase()
  let resp, body
  try {
    resp = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'merge', code: normalized, payload, myMemberId, dedupDecisions })
    })
    body = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'NETWORK_ERROR', message: '网络连接失败，请检查网络' }
  }
  if (resp.status === 404) return { success: false, code: 'TRIP_NOT_FOUND', message: '同步码不存在，请核对' }
  if (resp.status === 400) {
    if (body && body.error === 'PAYLOAD_TOO_LARGE') {
      return { success: false, code: 'PAYLOAD_TOO_LARGE', message: '数据过大，无法同步' }
    }
    return { success: false, code: 'INVALID_REQUEST', message: '请求参数不正确' }
  }
  if (!resp.ok || !body) return { success: false, code: 'NETWORK_ERROR', message: '同步服务暂时不可用' }
  return {
    success: true,
    status: body.status,
    payload: body.payload,
    revision: body.revision,
    duplicates: Array.isArray(body.duplicates) ? body.duplicates : []
  }
}
