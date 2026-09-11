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

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k])
    return out
  }
  return value
}

function migrateTripToV2(trip) {
  const t = { ...trip }
  if (!Array.isArray(t.deletedIds)) t.deletedIds = []
  if (typeof t.metaUpdatedAt !== 'string') t.metaUpdatedAt = t.createdAt || '1970-01-01T00:00:00.000Z'
  if (!Array.isArray(t.expenses)) t.expenses = []
  t.expenses = t.expenses.map((e) => ({
    ...e,
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : (e.createdAt || '1970-01-01T00:00:00.000Z')
  }))
  return t
}

function matchDuplicate(a, b) {
  if (!a || !b) return false
  if (a.payerId !== b.payerId || a.amount !== b.amount || a.purpose !== b.purpose) return false
  if (!Array.isArray(a.beneficiaryIds) || !Array.isArray(b.beneficiaryIds)) return false
  if (a.beneficiaryIds.length !== b.beneficiaryIds.length) return false
  const setB = new Set(b.beneficiaryIds)
  return a.beneficiaryIds.every((id) => setB.has(id))
}

function canonicalTrip(trip) {
  const t = migrateTripToV2(trip)
  return JSON.stringify({
    name: t.name,
    members: [...t.members].map((m) => JSON.stringify(sortKeysDeep(m))).sort(),
    metaUpdatedAt: t.metaUpdatedAt,
    expenses: [...t.expenses].map((e) => JSON.stringify(sortKeysDeep(e))).sort(),
    deletedIds: [...t.deletedIds].map((d) => JSON.stringify(sortKeysDeep(d))).sort()
  })
}

function mergeTrips(localTrip, remoteTrip, dedupDecisions = [], nowIso) {
  const local = migrateTripToV2(localTrip)
  const remote = migrateTripToV2(remoteTrip)

  const decisionMap = new Map()
  for (const d of dedupDecisions) {
    if (d && typeof d.localId === 'string' && typeof d.remoteId === 'string' && d.localId && d.remoteId) {
      decisionMap.set(d.localId + '||' + d.remoteId, d.action === 'keep' ? 'keep' : 'duplicate')
    }
  }

  const localById = new Map(local.expenses.map((e) => [e.id, e]))
  const remoteById = new Map(remote.expenses.map((e) => [e.id, e]))
  const localNewIds = new Set([...localById.keys()].filter((id) => !remoteById.has(id)))
  const remoteNewIds = new Set([...remoteById.keys()].filter((id) => !localById.has(id)))

  // 墓碑并集（同 id 取 deletedAt 晚者）
  const tombstones = new Map()
  for (const d of [...remote.deletedIds, ...local.deletedIds]) {
    if (!d || typeof d.id !== 'string') continue
    const prev = tombstones.get(d.id)
    if (!prev || String(d.deletedAt || '') > String(prev.deletedAt || '')) tombstones.set(d.id, d)
  }

  // 候选检测：只对新到记录，已决策的对不再报
  const duplicates = []
  const pairSeen = new Set()
  const excludedLocal = new Set()
  const excludedRemote = new Set()
  const consider = (l, r) => {
    const key = l.id + '||' + r.id
    if (pairSeen.has(key) || decisionMap.has(key) || !matchDuplicate(l, r)) return
    pairSeen.add(key)
    duplicates.push({ local: l, remote: r })
    excludedLocal.add(l.id)
    excludedRemote.add(r.id)
  }
  for (const id of localNewIds) {
    const l = localById.get(id)
    for (const r of remote.expenses) consider(l, r)
  }
  for (const id of remoteNewIds) {
    const r = remoteById.get(id)
    for (const l of local.expenses) consider(l, r)
  }

  // 应用裁决（保留非新到方）
  const extraTombstones = []
  for (const [key, action] of decisionMap) {
    if (action !== 'duplicate') continue
    const [localId, remoteId] = key.split('||')
    const l = localById.get(localId)
    const r = remoteById.get(remoteId)
    if (!l || !r) continue
    const lNew = localNewIds.has(localId)
    const rNew = remoteNewIds.has(remoteId)
    if (lNew && rNew) {
      if (String(l.createdAt || '') < String(r.createdAt || '')) {
        // 本地 createdAt 早 → 保留本地条，远端条加墓碑
        excludedRemote.add(remoteId)
        extraTombstones.push({ id: remoteId, deletedAt: nowIso })
      } else {
        // 远端较早或平局 → 保留远端条，本地条不上云
        excludedLocal.add(localId)
      }
    } else if (lNew && !rNew) {
      excludedLocal.add(localId)
    } else if (!lNew && rNew) {
      excludedRemote.add(remoteId)
      extraTombstones.push({ id: remoteId, deletedAt: nowIso })
    }
    // 双端共存的对不会成为候选，防御性忽略
  }
  for (const t of extraTombstones) {
    const prev = tombstones.get(t.id)
    if (!prev || t.deletedAt > String(prev.deletedAt || '')) tombstones.set(t.id, t)
  }

  // 元数据 LWW（平局远端胜）
  const localMetaNewer = String(local.metaUpdatedAt) > String(remote.metaUpdatedAt)
  const metaSrc = localMetaNewer ? local : remote

  // 记录合并
  const mergedExpenses = []
  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    let winner
    if (l && r) winner = String(l.updatedAt) > String(r.updatedAt) ? l : r // 平局远端胜
    else winner = l || r
    if (localNewIds.has(id) && excludedLocal.has(id)) continue
    if (remoteNewIds.has(id) && excludedRemote.has(id)) continue
    const ts = tombstones.get(id)
    if (ts && !(String(winner.updatedAt) > String(ts.deletedAt))) continue
    mergedExpenses.push(winner)
  }

  const merged = {
    name: metaSrc.name,
    members: metaSrc.members,
    createdAt: remote.createdAt || local.createdAt,
    metaUpdatedAt: metaSrc.metaUpdatedAt,
    expenses: mergedExpenses,
    deletedIds: [...tombstones.values()]
  }
  const changed = canonicalTrip(merged) !== canonicalTrip(remote)
  return { merged, duplicates, changed }
}

module.exports = { CODE_RE, MAX_PAYLOAD_BYTES, SCHEMA_VERSION, validateCode, normalizeCode, validatePayload, payloadBytes, decidePush, migrateTripToV2, matchDuplicate, canonicalTrip, mergeTrips }
