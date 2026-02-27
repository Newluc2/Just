/**
 * Just - Module de base de données SQLite (via sql.js)
 * 
 * Utilise sql.js (SQLite compilé en WebAssembly) pour une base de données locale.
 * Les données sont persistées dans un fichier sur disque.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'just.db');

let db = null;

/**
 * Initialiser la base de données et créer les tables
 */
async function initialize() {
  const SQL = await initSqlJs();

  // Créer le dossier data s'il n'existe pas
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Charger la base existante ou en créer une nouvelle
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Activer les clés étrangères
  db.run('PRAGMA foreign_keys = ON');

  // Table des utilisateurs
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      status TEXT DEFAULT 'online',
      about TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration : ajouter la colonne about si elle n'existe pas
  try {
    db.run('ALTER TABLE users ADD COLUMN about TEXT DEFAULT \'\'');
  } catch (e) {
    // La colonne existe déjà, on ignore
  }

  // Table des serveurs
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT DEFAULT NULL,
      owner_id TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Table des membres de serveurs
  db.run(`
    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      role_id TEXT DEFAULT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration : ajouter role_id si la colonne n'existe pas
  try {
    db.run('ALTER TABLE server_members ADD COLUMN role_id TEXT DEFAULT NULL');
  } catch (e) {
    // La colonne existe déjà, on ignore
  }

  // Table des rôles par serveur
  db.run(`
    CREATE TABLE IF NOT EXISTS server_roles (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#99AAB5',
      position INTEGER DEFAULT 0,
      permissions TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Table des invitations temporaires
  db.run(`
    CREATE TABLE IF NOT EXISTS server_invites (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      max_uses INTEGER DEFAULT NULL,
      uses_count INTEGER DEFAULT 0,
      expires_at DATETIME DEFAULT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Table des salons (channels)
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      server_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Table des messages
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edited_at DATETIME DEFAULT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    )
  `);

  // Table des messages privés (DM)
  db.run(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Table des conversations privées (pour lister les DMs ouverts)
  db.run(`
    CREATE TABLE IF NOT EXISTS dm_conversations (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user1_id, user2_id),
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Sauvegarder sur disque
  save();

  console.log('✅ Database initialized successfully');
}

/**
 * Obtenir l'instance de la base de données
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  return db;
}

/**
 * Sauvegarder la base de données sur disque
 */
function save() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Helper : exécuter une requête SELECT et retourner tous les résultats sous forme d'objets
 */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper : exécuter une requête SELECT et retourner le premier résultat
 */
function get(sql, params = []) {
  const results = all(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Helper : exécuter une requête INSERT/UPDATE/DELETE
 */
function run(sql, params = []) {
  db.run(sql, params);
  save(); // Persister après chaque modification
}

module.exports = { initialize, getDb, save, all, get, run };
