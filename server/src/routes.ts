import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { listRules, getRuleById, searchRules, createRule, updateRule, deleteRule } from './database.js';

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
  if (!name || !content) {
    res.status(400).json({ error: 'name and content are required' });
    return;
  }

  const rule = createRule({
    id: randomUUID(),
    name: String(name),
    content: String(content),
    author: String(author ?? ''),
    description: String(description ?? ''),
  });
  res.status(201).json({ rule });
});

// Update an existing rule
router.put('/:id', (req: Request<{ id: string }>, res: Response) => {
  const rule = updateRule(req.params.id, req.body ?? {});
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
