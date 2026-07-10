const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// 1. Initialize SQLite Database in the project directory
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log(`SQLite database opened at: ${dbPath}`);

// Create Tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT,
    phone TEXT,
    role TEXT,
    languages TEXT,
    FOREIGN KEY(id) REFERENCES users(id)
  );
`);

// Dynamically add new columns to profiles table if they don't exist
try { db.exec("ALTER TABLE profiles ADD COLUMN official_name TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN aadhar_number TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN education_level TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN certification_proof TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN aadhar_image_proof TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN dob TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN occupation TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN urgent_calls TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN first_time TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN location TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN emergency_phone TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE profiles ADD COLUMN verification_status TEXT DEFAULT 'unverified';"); } catch(e){}

db.exec(`
  CREATE TABLE IF NOT EXISTS exam_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT,
    student_name TEXT,
    dob TEXT,
    education_grade TEXT,
    phone TEXT,
    emergency_phone TEXT,
    exam_type TEXT,
    exam_language TEXT,
    id_proof TEXT,
    status TEXT,
    scribe_id TEXT,
    created_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS scribe_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    scribe_id TEXT,
    scribe_name TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    title TEXT,
    message TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    sender_id TEXT,
    message TEXT,
    created_at TEXT
  );
`);

try { db.exec("ALTER TABLE exam_requests ADD COLUMN subject TEXT;"); } catch(e){}

try { db.exec("ALTER TABLE exam_requests ADD COLUMN subject TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE exam_requests ADD COLUMN exam_date TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE exam_requests ADD COLUMN exam_venue TEXT;"); } catch(e){}
try { db.exec("ALTER TABLE exam_requests ADD COLUMN admit_card_proof TEXT;"); } catch(e){}

// Helper to parse JSON request body
const getRequestBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
};

// 2. Create HTTP Server with CORS enabled
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  try {
    // Auth: Sign Up
    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      const { email, password } = await getRequestBody(req);
      
      // Check if user already exists
      const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
      const existing = checkStmt.get(email);
      
      if (existing) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'User already exists' }));
        return;
      }

      const userId = Math.random().toString(36).substring(7);
      const insertStmt = db.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)');
      insertStmt.run(userId, email, password);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user: { id: userId, email } }));
      return;
    }

    // Auth: Sign In
    if (url.pathname === '/api/auth/signin' && req.method === 'POST') {
      const { email, phone, password } = await getRequestBody(req);
      
      let user = null;
      if (phone) {
        const stmt = db.prepare(`
          SELECT users.id, users.email 
          FROM users 
          JOIN profiles ON users.id = profiles.id 
          WHERE profiles.phone = ? AND users.password = ?
        `);
        user = stmt.get(phone, password);
      } else if (email) {
        const stmt = db.prepare('SELECT id, email FROM users WHERE email = ? AND password = ?');
        user = stmt.get(email, password);
      }

      if (!user) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ user }));
      return;
    }

    // Generic Database Query Endpoint (translates client query builder to SQLite)
    if (url.pathname === '/api/query' && req.method === 'POST') {
      const { table, action, filters, data, sortField, sortAscending, limit, single } = await getRequestBody(req);

      if (action === 'select') {
        let sql = `SELECT * FROM ${table}`;
        const params = [];
        
        if (filters && filters.length > 0) {
          const clauses = filters.map(f => {
            params.push(f.value);
            const op = f.operator === 'neq' ? '!=' : '=';
            return `${f.column} ${op} ?`;
          });
          sql += ` WHERE ${clauses.join(' AND ')}`;
        }

        if (sortField) {
          sql += ` ORDER BY ${sortField} ${sortAscending ? 'ASC' : 'DESC'}`;
        }

        if (limit) {
          sql += ` LIMIT ${limit}`;
        }

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);

        // Parse JSON fields (e.g. languages array)
        const formattedRows = rows.map(row => {
          if (row.languages) {
            try {
              row.languages = JSON.parse(row.languages);
            } catch (e) {
              row.languages = row.languages.split(',').map(l => l.trim());
            }
          }
          return row;
        });

        if (single) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: formattedRows[0] || null }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: formattedRows }));
        return;
      }

      if (action === 'insert') {
        // Handle special columns/auto-increment
        let rowToInsert = { ...data };
        if (table === 'exam_requests') {
          rowToInsert.created_at = new Date().toISOString();
        }

        // Stringify array fields
        if (rowToInsert.languages) {
          rowToInsert.languages = JSON.stringify(rowToInsert.languages);
        }

        const columns = Object.keys(rowToInsert);
        const placeholders = columns.map(() => '?').join(', ');
        const params = Object.values(rowToInsert);

        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        const stmt = db.prepare(sql);
        const info = stmt.run(...params);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: { id: info.lastInsertRowid, ...rowToInsert }, error: null }));
        return;
      }

      if (action === 'update') {
        let updateData = { ...data };
        if (updateData.languages) {
          updateData.languages = JSON.stringify(updateData.languages);
        }

        const setClauses = [];
        const params = [];
        
        for (const [col, val] of Object.entries(updateData)) {
          setClauses.push(`${col} = ?`);
          params.push(val);
        }

        let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;

        if (filters && filters.length > 0) {
          const whereClauses = filters.map(f => {
            params.push(f.value);
            const op = f.operator === 'neq' ? '!=' : '=';
            return `${f.column} ${op} ?`;
          });
          sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        const stmt = db.prepare(sql);
        stmt.run(...params);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: null, error: null }));
        return;
      }
    }

    // 404 handler
    res.writeHead(404);
    res.end();

  } catch (err) {
    console.error("Server Error:", err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Local SQLite API Server running at http://localhost:${PORT}`);
});
