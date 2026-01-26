import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const {
  DB_HOST = 'db',
  DB_PORT = '3306',
  DB_USER = 'admin',
  DB_PASSWORD = '',
  DB_NAME = 'mysql',
  CORS_ORIGIN = '*',
  PORT = '3000',
  JWT_SECRET = '',
  JWT_TTL = '7d',
  APP_USER_EMAIL = '',
  APP_USER_PASSWORD = '',
} = process.env

const authEnabled = Boolean(JWT_SECRET && APP_USER_EMAIL && APP_USER_PASSWORD)

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '8mb' }))

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
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS actas (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      title TEXT,
      client VARCHAR(255),
      date DATE,
      meeting_type VARCHAR(20),
      pre_notes_html LONGTEXT,
      content_html LONGTEXT,
      next_steps_html LONGTEXT,
      created_at DATETIME,
      updated_at DATETIME
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS acta_tasks (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      acta_id VARCHAR(64) NOT NULL,
      text TEXT,
      done TINYINT(1) NOT NULL DEFAULT 0,
      position INT,
      created_at DATETIME,
      updated_at DATETIME
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_notes (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      title TEXT,
      client VARCHAR(255),
      date DATE,
      content_html LONGTEXT,
      created_at DATETIME,
      updated_at DATETIME
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      title TEXT,
      client VARCHAR(255),
      bucket VARCHAR(20),
      position INT,
      done TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME,
      updated_at DATETIME
    )
  `)
  schemaReady = true
}

const ensureDefaultUser = async () => {
  if (!authEnabled) return
  await ensureSchema()
  const normalized = APP_USER_EMAIL.toLowerCase()
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalized])
  if (rows.length) return
  const hash = await bcrypt.hash(APP_USER_PASSWORD, 10)
  await pool.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [
    normalized,
    hash,
  ])
}

const issueToken = (email) =>
  jwt.sign({ email }, JWT_SECRET, {
    expiresIn: JWT_TTL,
  })

const authMiddleware = async (req, res, next) => {
  if (!authEnabled) return next()
  if (req.path === '/api/health' || req.path === '/api/login') return next()

  const bearer = req.get('authorization')
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    return next()
  } catch (error) {
    console.error('JWT error', error?.message || error)
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

app.use(authMiddleware)

const coerceState = (payload) => {
  const notes = Array.isArray(payload?.notes) ? payload.notes : []
  const clients = Array.isArray(payload?.clients) ? payload.clients : []
  const quickNotes = Array.isArray(payload?.quickNotes) ? payload.quickNotes : []
  const tasks = Array.isArray(payload?.tasks) ? payload.tasks : []
  return { notes, clients, quickNotes, tasks }
}

const toDate = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const toDateTime = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 19).replace('T', ' ')
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/login', async (req, res) => {
  try {
    await ensureDefaultUser()
    const { email = '', password = '' } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' })
    }
    const normalized = String(email).toLowerCase()
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE email = ? LIMIT 1', [
      normalized,
    ])
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const match = await bcrypt.compare(password, rows[0].password_hash)
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = issueToken(normalized)
    res.json({ token, user: { email: normalized } })
  } catch (error) {
    console.error('Login error', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

app.get('/api/state', async (_req, res) => {
  try {
    await ensureSchema()

    const [clientRows] = await pool.query('SELECT name FROM clients ORDER BY name ASC')
    const clients = clientRows.map((row) => row.name)

    const [actaRows] = await pool.query('SELECT * FROM actas')
    const [actaTaskRows] = await pool.query('SELECT * FROM acta_tasks')
    const tasksByActa = new Map()
    actaTaskRows.forEach((row) => {
      const list = tasksByActa.get(row.acta_id) ?? []
      list.push({
        id: row.id,
        text: row.text || '',
        done: Boolean(row.done),
      })
      tasksByActa.set(row.acta_id, list)
    })

    const notes = actaRows.map((row) => ({
      id: row.id,
      title: row.title || '',
      client: row.client || '',
      date: row.date ? row.date.toISOString().slice(0, 10) : '',
      meetingType: row.meeting_type === 'interna' ? 'interna' : 'cliente',
      preNotes: row.pre_notes_html || '',
      content: row.content_html || '',
      nextSteps: row.next_steps_html || '',
      nextTasks: tasksByActa.get(row.id) || [],
      createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
    }))

    const [quickRows] = await pool.query('SELECT * FROM quick_notes')
    const quickNotes = quickRows.map((row) => ({
      id: row.id,
      title: row.title || '',
      client: row.client || '',
      date: row.date ? row.date.toISOString().slice(0, 10) : '',
      content: row.content_html || '',
      createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
    }))

    const [taskRows] = await pool.query('SELECT * FROM tasks')
    const tasks = taskRows.map((row) => ({
      id: row.id,
      title: row.title || '',
      client: row.client || '',
      createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
      bucket: row.bucket || 'none',
      order: typeof row.position === 'number' ? row.position : undefined,
      done: Boolean(row.done),
    }))

    res.json({ notes, clients, quickNotes, tasks })
  } catch (error) {
    console.error('Failed to load state', error)
    res.status(500).json({ error: 'Failed to load state' })
  }
})

app.put('/api/state', async (req, res) => {
  try {
    await ensureSchema()
    const { notes, clients, quickNotes, tasks } = coerceState(req.body)
    const clientSet = new Set(
      [
        ...clients,
        ...notes.map((note) => note.client),
        ...quickNotes.map((note) => note.client),
        ...tasks.map((task) => task.client),
      ]
        .map((name) => String(name || '').trim())
        .filter(Boolean),
    )
    const allClients = Array.from(clientSet)

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query('DELETE FROM acta_tasks')
      await connection.query('DELETE FROM actas')
      await connection.query('DELETE FROM quick_notes')
      await connection.query('DELETE FROM tasks')
      await connection.query('DELETE FROM clients')

      for (const name of allClients) {
        if (!name || !String(name).trim()) continue
        await connection.query('INSERT INTO clients (name) VALUES (?)', [String(name).trim()])
      }

      for (const note of notes) {
        await connection.query(
          `INSERT INTO actas
            (id, title, client, date, meeting_type, pre_notes_html, content_html, next_steps_html, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            note.id,
            note.title || '',
            note.client || '',
            toDate(note.date),
            note.meetingType === 'interna' ? 'interna' : 'cliente',
            note.preNotes || '',
            note.content || '',
            note.nextSteps || '',
            toDateTime(note.createdAt),
            toDateTime(note.updatedAt),
          ],
        )

        const nextTasks = Array.isArray(note.nextTasks) ? note.nextTasks : []
        let position = 0
        for (const task of nextTasks) {
          await connection.query(
            `INSERT INTO acta_tasks
              (id, acta_id, text, done, position, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              task.id,
              note.id,
              task.text || '',
              task.done ? 1 : 0,
              position,
              toDateTime(note.updatedAt),
              toDateTime(note.updatedAt),
            ],
          )
          position += 1
        }
      }

      for (const note of quickNotes) {
        await connection.query(
          `INSERT INTO quick_notes
            (id, title, client, date, content_html, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            note.id,
            note.title || '',
            note.client || '',
            toDate(note.date),
            note.content || '',
            toDateTime(note.createdAt),
            toDateTime(note.updatedAt),
          ],
        )
      }

      for (const task of tasks) {
        await connection.query(
          `INSERT INTO tasks
            (id, title, client, bucket, position, done, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.title || '',
            task.client || '',
            task.bucket || 'none',
            typeof task.order === 'number' ? task.order : null,
            task.done ? 1 : 0,
            toDateTime(task.createdAt),
            toDateTime(task.updatedAt ?? task.createdAt),
          ],
        )
      }

      await connection.commit()
      res.json({ ok: true })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('Failed to save state', error)
    res.status(500).json({ error: 'Failed to save state' })
  }
})

const start = async () => {
  if (authEnabled) {
    await ensureDefaultUser()
  }
  app.listen(Number(PORT), () => {
    console.log(`actas api listening on ${PORT}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
