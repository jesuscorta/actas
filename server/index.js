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
} = process.env

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '5mb' }))

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
})

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TINYINT NOT NULL PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
}

const coerceState = (payload) => {
  const notes = Array.isArray(payload?.notes) ? payload.notes : []
  const clients = Array.isArray(payload?.clients) ? payload.clients : []
  return { notes, clients }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/state', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT data FROM app_state WHERE id = 1')
    if (!rows.length) {
      res.json({ notes: [], clients: [] })
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

const start = async () => {
  await ensureSchema()
  app.listen(Number(PORT), () => {
    console.log(`actas api listening on ${PORT}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
