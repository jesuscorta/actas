import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import { OAuth2Client } from 'google-auth-library'

const {
  DB_HOST = 'db',
  DB_PORT = '3306',
  DB_USER = 'admin',
  DB_PASSWORD = '',
  DB_NAME = 'mysql',
  CORS_ORIGIN = '*',
  PORT = '3000',
  API_KEY = '',
  GOOGLE_CLIENT_ID = '',
  GOOGLE_ALLOWED_EMAILS = '',
  GOOGLE_ALLOWED_DOMAIN = '',
  MIGRATION_DEFAULT_OWNER = 'jesus.cortacero@sidn.es',
} = process.env

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null

const allowedEmails = GOOGLE_ALLOWED_EMAILS.split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)
const allowedDomain = GOOGLE_ALLOWED_DOMAIN.trim().toLowerCase()

const isEmailAllowed = (email) => {
  if (!email) return false
  const normalized = email.toLowerCase()
  if (allowedEmails.length && !allowedEmails.includes(normalized)) return false
  if (allowedDomain && !normalized.endsWith(`@${allowedDomain}`)) return false
  return true
}

const verifyGoogleToken = async (token) => {
  if (!googleClient) return null
  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: GOOGLE_CLIENT_ID,
  })
  const payload = ticket.getPayload()
  if (!isEmailAllowed(payload?.email || '')) {
    throw new Error('Email not allowed')
  }
  return {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
  }
}

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '5mb' }))

const authMiddleware = (req, res, next) => {
  // If neither API_KEY nor Google auth is configured, keep current behavior (useful for local dev).
  if (!API_KEY && !GOOGLE_CLIENT_ID) return next()

  // Allow health check without auth to keep probes simple.
  if (req.path === '/api/health') return next()

  const headerKey = req.get('x-api-key')
  const bearer = req.get('authorization')
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null

  // API key fallback (for compatibility)
  if (API_KEY && headerKey === API_KEY) return next()
  if (API_KEY && bearerToken === API_KEY) return next()

  const handleError = () => res.status(401).json({ error: 'Unauthorized' })

  if (!bearerToken) {
    return handleError()
  }

  verifyGoogleToken(bearerToken)
    .then((user) => {
      if (user) {
        req.user = user
        return next()
      }
      return handleError()
    })
    .catch((error) => {
      console.error('Google auth error', error.message || error)
      return handleError()
    })
}

app.use(authMiddleware)

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
})

let schemaReady = false
const ensureSchema = async () => {
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TINYINT NOT NULL PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state_users (
      email VARCHAR(255) NOT NULL PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  schemaReady = true
}

const coerceState = (payload) => {
  const notes = Array.isArray(payload?.notes) ? payload.notes : []
  const clients = Array.isArray(payload?.clients) ? payload.clients : []
  const quickNotes = Array.isArray(payload?.quickNotes) ? payload.quickNotes : []
  return { notes, clients, quickNotes }
}

const resolveUserEmail = (req) => {
  const headerEmail = req.get('x-user-email')
  const userEmail = (req.user?.email || headerEmail || '').toLowerCase()
  if (userEmail) return userEmail
  if (!API_KEY && !GOOGLE_CLIENT_ID) return 'local-dev@example.com'
  return null
}

const migrateLegacyState = async () => {
  const ownerEmail = (MIGRATION_DEFAULT_OWNER || '').toLowerCase()
  if (!ownerEmail) return

  const [existingForOwner] = await pool.query(
    'SELECT email FROM app_state_users WHERE email = ? LIMIT 1',
    [ownerEmail],
  )
  if (existingForOwner.length) return

  // Try to read legacy single-state row.
  const [legacyRows] = await pool.query('SELECT data FROM app_state WHERE id = 1')
  if (!legacyRows.length) return

  const raw = legacyRows[0].data
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  const state = coerceState(data)

  await pool.query(
    'INSERT INTO app_state_users (email, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [ownerEmail, JSON.stringify(state)],
  )
  console.log(`Migrated legacy state to user ${ownerEmail}`)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/admin/export', async (req, res) => {
  try {
    await ensureSchema()
    await migrateLegacyState()

    const [legacyRows] = await pool.query('SELECT data FROM app_state WHERE id = 1')
    const legacyRaw = legacyRows.length ? legacyRows[0].data : null
    const legacy = legacyRaw ? coerceState(typeof legacyRaw === 'string' ? JSON.parse(legacyRaw) : legacyRaw) : null

    const [userRows] = await pool.query('SELECT email, data FROM app_state_users')
    const perUser = userRows.map((row) => ({
      email: row.email,
      data: coerceState(typeof row.data === 'string' ? JSON.parse(row.data) : row.data),
    }))

    res.json({ legacy, perUser })
  } catch (error) {
    console.error('Admin export error', error)
    res.status(500).json({ error: 'Failed to export data' })
  }
})

app.get('/api/state', async (req, res) => {
  try {
    await ensureSchema()
    const userEmail = resolveUserEmail(req)
    if (!userEmail) return res.status(400).json({ error: 'User email required' })

    await migrateLegacyState()

    const [rows] = await pool.query('SELECT data FROM app_state_users WHERE email = ?', [userEmail])
    if (!rows.length) {
      res.json({ notes: [], clients: [], quickNotes: [] })
      return
    }
    const raw = rows[0].data
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    res.json(coerceState(data))
  } catch (error) {
    console.error('Failed to load state', error)
    res.status(500).json({ error: 'Failed to load state' })
  }
})

app.put('/api/state', async (req, res) => {
  try {
    await ensureSchema()
    const userEmail = resolveUserEmail(req)
    if (!userEmail) return res.status(400).json({ error: 'User email required' })
    await migrateLegacyState()

    const state = coerceState(req.body)
    await pool.query(
      'INSERT INTO app_state_users (email, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [userEmail, JSON.stringify(state)],
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('Failed to save state', error)
    res.status(500).json({ error: 'Failed to save state' })
  }
})

const start = async () => {
  app.listen(Number(PORT), () => {
    console.log(`actas api listening on ${PORT}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
