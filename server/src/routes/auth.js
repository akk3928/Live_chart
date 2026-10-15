import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Compared against when an email isn't found, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUser = db.prepare(
  'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password } = req.body ?? {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    const errors = [];
    if (!cleanName) errors.push('Enter your name.');
    else if (cleanName.length > 80) errors.push('Name must be 80 characters or fewer.');
    if (!EMAIL_RE.test(cleanEmail)) errors.push('Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 8) {
      errors.push('Password must be at least 8 characters.');
    } else if (password.length > 72) {
      errors.push('Password must be 72 characters or fewer.');
    }
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    if (findByEmail.get(cleanEmail)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    try {
      const info = insertUser.run(cleanName, cleanEmail, hash, new Date().toISOString());
      const user = { id: Number(info.lastInsertRowid), name: cleanName, email: cleanEmail };
      return res.status(201).json({ token: signToken(user), user });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw err;
    }
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = cleanEmail ? findByEmail.get(cleanEmail) : undefined;

    const ok = await bcrypt.compare(
      typeof password === 'string' ? password : '',
      user ? user.password_hash : DUMMY_HASH
    );
    if (!user || !ok) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    return res.json({ token: signToken(user), user: publicUser(user) });
  })
);

export default router;
