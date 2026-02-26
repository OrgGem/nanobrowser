import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { listRules, getRuleById, searchRules, createRule, updateRule, deleteRule } from './database.js';

const MAX_NAME_LENGTH = 200;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_DESCRIPTION_LENGTH = 1000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const router = Router();

// List all rules (with optional search)
router.get('/', (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rules = query ? searchRules(query) : listRules();
  res.json({ rules });
});

// Get a single rule
router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
  const rule = getRuleById(req.params.id);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ rule });
});

// Create (push) a new rule
router.post('/', (req: Request, res: Response) => {
  const { name, content, author, description } = req.body ?? {};

  if (!isNonEmptyString(name) || !isNonEmptyString(content)) {
    res.status(400).json({ error: 'name and content must be non-empty strings' });
    return;
  }
  if (name.length > MAX_NAME_LENGTH || content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: 'name or content exceeds maximum length' });
    return;
  }
  const authorStr = typeof author === 'string' ? author.slice(0, MAX_NAME_LENGTH) : '';
  const descStr = typeof description === 'string' ? description.slice(0, MAX_DESCRIPTION_LENGTH) : '';

  const rule = createRule({
    id: randomUUID(),
    name: name.trim(),
    content: content.trim(),
    author: authorStr,
    description: descStr,
  });
  res.status(201).json({ rule });
});

// Update an existing rule
router.put('/:id', (req: Request<{ id: string }>, res: Response) => {
  const updates: Record<string, string> = {};
  if (typeof req.body?.name === 'string') updates.name = req.body.name.slice(0, MAX_NAME_LENGTH);
  if (typeof req.body?.content === 'string') updates.content = req.body.content.slice(0, MAX_CONTENT_LENGTH);
  if (typeof req.body?.description === 'string')
    updates.description = req.body.description.slice(0, MAX_DESCRIPTION_LENGTH);

  const rule = updateRule(req.params.id, updates);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ rule });
});

// Delete a rule
router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
  const deleted = deleteRule(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
