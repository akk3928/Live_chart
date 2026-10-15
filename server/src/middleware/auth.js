import jwt from 'jsonwebtoken';
import db from '../db.js';

const findUser = db.prepare('SELECT id FROM users WHERE id = ?');

export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = findUser.get(Number(payload.sub));
    if (!user) throw new Error('Unknown user');
    req.user = { id: user.id };
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}
