// Thin Vercel-registered wrapper for prototype/api/generate-chapter.js. All actual logic
// (PII-field rejection, callClaudeForChapter(), retry-once) stays in that prototype file,
// completely unmodified — this wrapper exists ONLY so Vercel's legacy `builds`/`routes`
// config in vercel.json can recognize and serve a real HTTP path for it, and to add one
// more gate in front: a shared-secret header check, since /api/* paths are public by
// default and this endpoint makes real (billed) Anthropic API calls.
//
// The secret (`PROTOTYPE_TEST_SECRET`) is read from the server environment only. It is
// never included in any response body, any error message, or any console.log call in
// this file or in prototype/api/generate-chapter.js. A request with a missing or wrong
// header is rejected before prototypeHandler (and therefore before any Anthropic call)
// ever runs.
import crypto from 'crypto';
import prototypeHandler from '../prototype/api/generate-chapter.js';

function secretMatches(expected, provided) {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const expected = process.env.PROTOTYPE_TEST_SECRET;
  const provided = req.headers['x-prototype-secret'];
  if (!secretMatches(expected, provided)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  return prototypeHandler(req, res);
}
