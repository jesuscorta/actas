import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'

const {
  DB_HOST = 'db',
  DB_PORT = '3306',
  DB_USER = 'admin',
  DB_PASSWORD = '',
  DB_NAME = 'mysql',
  CORS_ORIGIN = '*',
  PORT = '3000',
  API_KEY = '',
} = process.env

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '5mb' }))

const authMiddleware = (req, res, next) => {
  // If no API_KEY is set, keep current behavior (useful for local dev).
  if (!API_KEY) return next()

  // Allow health check without auth to keep probes simple.
  if (
    req.path === '/api/health' ||
    req.path.startsWith('/api/public/acta/') ||
    req.path.startsWith('/api/public/nota/')
  ) {
    return next()
  }

  const headerKey = req.get('x-api-key')
  const bearer = req.get('authorization')
  const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null

  const provided = headerKey || bearerToken
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
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
  schemaReady = true
}

const coerceState = (payload) => {
  const notes = Array.isArray(payload?.notes) ? payload.notes : []
  const clients = Array.isArray(payload?.clients) ? payload.clients : []
  const quickNotes = Array.isArray(payload?.quickNotes) ? payload.quickNotes : []
  return { notes, clients, quickNotes }
}

const loadState = async () => {
  await ensureSchema()
  const [rows] = await pool.query('SELECT data FROM app_state WHERE id = 1')
  if (!rows.length) {
    return { notes: [], clients: [], quickNotes: [] }
  }
  const raw = rows[0].data
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  return coerceState(data)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/state', async (_req, res) => {
  try {
    const state = await loadState()
    res.json(state)
  } catch (error) {
    console.error('Failed to load state', error)
    res.status(500).json({ error: 'Failed to load state' })
  }
})

app.put('/api/state', async (req, res) => {
  try {
    await ensureSchema()
    const state = coerceState(req.body)
    await pool.query(
      'INSERT INTO app_state (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [JSON.stringify(state)],
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('Failed to save state', error)
    res.status(500).json({ error: 'Failed to save state' })
  }
})

app.get('/api/public/acta/:id', async (req, res) => {
  const { id } = req.params
  const token = req.query.token
  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return
  }
  try {
    const state = await loadState()
    const note = state.notes.find((n) => n.id === id && n.shareToken === token)
    if (!note) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ note })
  } catch (error) {
    console.error('Failed to load public acta', error)
    res.status(500).json({ error: 'Failed to load acta' })
  }
})

app.get('/api/public/nota/:id', async (req, res) => {
  const { id } = req.params
  const token = req.query.token
  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return
  }
  try {
    const state = await loadState()
    const note = state.quickNotes.find((n) => n.id === id && n.shareToken === token)
    if (!note) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ note })
  } catch (error) {
    console.error('Failed to load public note', error)
    res.status(500).json({ error: 'Failed to load note' })
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
