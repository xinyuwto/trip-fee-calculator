'use strict'

const http = require('http')
const { URL } = require('url')
const tcb = require('@cloudbase/node-sdk')
const {
  CODE_RE, MAX_PAYLOAD_BYTES, SCHEMA_VERSION,
  normalizeCode, validatePayload, payloadBytes, decidePush
} = require('./core')

const app = tcb.init({
  env: process.env.TCB_ENV,
  accessKey: process.env.CLOUDBASE_APIKEY
})
const db = app.database()
const COLLECTION = 'trips'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS })
  res.end(JSON.stringify(data))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (!raw) { resolve(null); return }
      try { resolve(JSON.parse(raw)) } catch { resolve(null) }
    })
    req.on('error', reject)
  })
}

async function findDoc(code) {
  const result = await db.collection(COLLECTION).where({ _id: code }).limit(1).get()
  return result.data && result.data[0] ? result.data[0] : null
}

async function handleGet(res, url) {
  const code = normalizeCode(url.searchParams.get('code'))
  if (!CODE_RE.test(code)) return sendJson(res, 400, { error: 'INVALID_CODE' })
  let doc
  try {
    doc = await findDoc(code)
  } catch (e) {
    console.error('db read error:', e && e.message)
    return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
  }
  if (!doc) return sendJson(res, 404, { error: 'TRIP_NOT_FOUND' })
  sendJson(res, 200, {
    schemaVersion: doc.schemaVersion || SCHEMA_VERSION,
    payload: doc.payload,
    revision: doc.revision,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy
  })
}

async function handlePost(res, req) {
  const body = await readJsonBody(req)
  if (!body || typeof body !== 'object') return sendJson(res, 400, { error: 'INVALID_REQUEST' })
  const code = normalizeCode(body.code)
  if (!CODE_RE.test(code)) return sendJson(res, 400, { error: 'INVALID_CODE' })
  if (!validatePayload(body.payload)) return sendJson(res, 400, { error: 'INVALID_PAYLOAD' })
  if (payloadBytes(body.payload) > MAX_PAYLOAD_BYTES) return sendJson(res, 400, { error: 'PAYLOAD_TOO_LARGE' })
  if (!Number.isInteger(body.baseRevision) || body.baseRevision < 0) return sendJson(res, 400, { error: 'INVALID_REVISION' })

  const updatedBy = String(body.updatedBy || '').slice(0, 20) || '未知'
  let existing
  try {
    existing = await findDoc(code)
  } catch (e) {
    console.error('db read error:', e && e.message)
    return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
  }

  const decision = decidePush(existing, { baseRevision: body.baseRevision, force: body.force === true })
  if (decision.action === 'notfound') return sendJson(res, 404, { error: 'TRIP_NOT_FOUND' })
  if (decision.action === 'conflict') {
    return sendJson(res, 409, {
      error: 'REVISION_CONFLICT',
      remoteRevision: decision.remoteRevision,
      remoteUpdatedAt: decision.remoteUpdatedAt,
      remoteUpdatedBy: decision.remoteUpdatedBy
    })
  }

  const record = {
    schemaVersion: SCHEMA_VERSION,
    payload: body.payload,
    revision: decision.newRevision,
    updatedAt: new Date().toISOString(),
    updatedBy
  }
  try {
    await db.collection(COLLECTION).doc(code).set(record)
  } catch (e) {
    console.error('db write error:', e && e.message)
    return sendJson(res, 500, { error: 'INTERNAL_ERROR' })
  }
  sendJson(res, 200, { revision: decision.newRevision })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  try {
    if (req.method === 'GET') return await handleGet(res, url)
    if (req.method === 'POST') return await handlePost(res, req)
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('unhandled error:', e && e.message)
    sendJson(res, 500, { error: 'INTERNAL_ERROR' })
  }
})

server.listen(9000)
