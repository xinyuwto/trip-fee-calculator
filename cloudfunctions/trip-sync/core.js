'use strict'

const CODE_RE = /^[2-9A-HJKMNP-Z]{8}$/
const MAX_PAYLOAD_BYTES = 512 * 1024
const SCHEMA_VERSION = 1

function validateCode(code) {
  return typeof code === 'string' && CODE_RE.test(code.trim().toUpperCase())
}

function normalizeCode(code) {
  return String(code == null ? '' : code).trim().toUpperCase()
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return false
  if (typeof payload.name !== 'string' || payload.name.trim() === '') return false
  if (!Array.isArray(payload.members) || payload.members.length < 2 || payload.members.length > 20) return false
  for (const m of payload.members) {
    if (!m || typeof m.id !== 'string' || typeof m.name !== 'string') return false
  }
  if (!Array.isArray(payload.expenses)) return false
  for (const e of payload.expenses) {
    if (!e || !e.id || !e.purpose || !e.amount || !e.payerId || !Array.isArray(e.beneficiaryIds)) return false
  }
  return true
}

function payloadBytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload == null ? null : payload))
}

function decidePush(existingDoc, { baseRevision, force }) {
  if (!existingDoc) {
    if (baseRevision === 0 && force !== true) {
      return { action: 'create', newRevision: 1 }
    }
    return { action: 'notfound' }
  }
  if (force || existingDoc.revision === baseRevision) {
    return { action: 'update', newRevision: existingDoc.revision + 1 }
  }
  return {
    action: 'conflict',
    remoteRevision: existingDoc.revision,
    remoteUpdatedAt: existingDoc.updatedAt,
    remoteUpdatedBy: existingDoc.updatedBy
  }
}

module.exports = { CODE_RE, MAX_PAYLOAD_BYTES, SCHEMA_VERSION, validateCode, normalizeCode, validatePayload, payloadBytes, decidePush }
