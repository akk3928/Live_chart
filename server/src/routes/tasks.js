import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toTask = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  priority: r.priority,
  dueDate: r.due_date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
});

/** Validates a create (partial = false) or update (partial = true) body. */
function validate(body, partial) {
  const out = {};
  const errors = [];

  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) errors.push('Enter a title.');
    else if (title.length > 200) errors.push('Title must be 200 characters or fewer.');
    else out.title = title;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 2000) {
      errors.push('Description must be text of 2000 characters or fewer.');
    } else {
      out.description = body.description.trim();
    }
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      errors.push(`Status must be one of: ${STATUSES.join(', ')}.`);
    } else {
      out.status = body.status;
    }
  }

  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) {
      errors.push(`Priority must be one of: ${PRIORITIES.join(', ')}.`);
    } else {
      out.priority = body.priority;
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') {
      out.due_date = null;
    } else if (
      typeof body.dueDate === 'string' &&
      DATE_RE.test(body.dueDate) &&
      !Number.isNaN(Date.parse(body.dueDate))
    ) {
      out.due_date = body.dueDate;
    } else {
      errors.push('Due date must be formatted YYYY-MM-DD.');
    }
  }

  return { out, errors };
}

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET /api/tasks?status=todo|in_progress|done&q=search
router.get('/', (req, res) => {
  const { status, q } = req.query;
  const where = ['user_id = ?'];
  const params = [req.user.id];

  if (status !== undefined && status !== '') {
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}.` });
    }
    where.push('status = ?');
    params.push(status);
  }

  if (typeof q === 'string' && q.trim()) {
    const like = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }

  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY (status = 'done'), due_date IS NULL, due_date, id DESC`
    )
    .all(...params);

  res.json(rows.map(toTask));
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { out, errors } = validate(req.body ?? {}, false);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const now = new Date().toISOString();
  const status = out.status ?? 'todo';
  const info = db
    .prepare(
      `INSERT INTO tasks
         (user_id, title, description, status, priority, due_date, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      out.title,
      out.description ?? '',
      status,
      out.priority ?? 'medium',
      out.due_date ?? null,
      now,
      now,
      status === 'done' ? now : null
    );

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(toTask(row));
});

// PATCH /api/tasks/:id
router.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Task id must be a positive number.' });

  const existing = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Task not found.' });

  const { out, errors } = validate(req.body ?? {}, true);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  if (Object.keys(out).length === 0) {
    return res.status(400).json({ error: 'Send at least one field to update.' });
  }

  const now = new Date().toISOString();
  if (out.status === 'done' && existing.status !== 'done') out.completed_at = now;
  if (out.status && out.status !== 'done') out.completed_at = null;
  out.updated_at = now;

  // Column names come from validate() above, never from the request.
  const columns = Object.keys(out);
  db.prepare(
    `UPDATE tasks SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...columns.map((c) => out[c]), id, req.user.id);

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(toTask(row));
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Task id must be a positive number.' });

  const info = db
    .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Task not found.' });

  res.status(204).end();
});

export default router;
