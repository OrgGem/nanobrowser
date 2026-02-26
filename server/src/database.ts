import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerRule {
  id: string;
  name: string;
  content: string;
  author: string;
  description: string;
  created_at: string;
  updated_at: string;
}

let db: Database.Database;

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(__dirname, '..', 'rules.db');
  db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialised – call initDatabase() first');
  return db;
}

// ---------- CRUD helpers ----------

export function listRules(): ServerRule[] {
  return getDatabase().prepare('SELECT * FROM rules ORDER BY updated_at DESC').all() as ServerRule[];
}

export function getRuleById(id: string): ServerRule | undefined {
  return getDatabase().prepare('SELECT * FROM rules WHERE id = ?').get(id) as ServerRule | undefined;
}

export function searchRules(query: string): ServerRule[] {
  // Escape LIKE special characters to prevent pattern injection
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return getDatabase()
    .prepare(
      "SELECT * FROM rules WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY updated_at DESC",
    )
    .all(pattern, pattern) as ServerRule[];
}

export function createRule(rule: Omit<ServerRule, 'created_at' | 'updated_at'>): ServerRule {
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      'INSERT INTO rules (id, name, content, author, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(rule.id, rule.name, rule.content, rule.author ?? '', rule.description ?? '', now, now);
  return getRuleById(rule.id)!;
}

export function updateRule(
  id: string,
  updates: Partial<Pick<ServerRule, 'name' | 'content' | 'description'>>,
): ServerRule | undefined {
  const existing = getRuleById(id);
  if (!existing) return undefined;

  const name = updates.name ?? existing.name;
  const content = updates.content ?? existing.content;
  const description = updates.description ?? existing.description;
  const now = new Date().toISOString();

  getDatabase()
    .prepare('UPDATE rules SET name = ?, content = ?, description = ?, updated_at = ? WHERE id = ?')
    .run(name, content, description, now, id);

  return getRuleById(id);
}

export function deleteRule(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM rules WHERE id = ?').run(id);
  return result.changes > 0;
}
