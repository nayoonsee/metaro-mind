// Prototype-only server-side endpoint for real AI-narrative verification. NOT wired into
// vercel.json's builds/routes — deploying it is a separate, explicit step, so this file
// cannot accidentally affect production payment/report/email routes. Structured as a
// standard Vercel Node function (`export default async function handler(req, res)`) so
// it can be added to vercel.json later with a single new build+route entry, without
// changing this file.
//
// Contract:
//   - Reads process.env.ANTHROPIC_API_KEY server-side only (via api/_saju-core.js's
//     callClaude(), unmodified). The key never appears in the request body, the
//     response body, or any log line below.
//   - Request body must NOT contain birthdate/email/birthplace/payer name — this
//     endpoint only accepts what ai-narrative.js's buildAiInputPayload() already
//     restricts itself to (chart facts, categorical reality inputs, nickname, question
//     text). It does not compute a chart itself and does not accept raw birth input.
//   - Response is the raw parsed chapter JSON from Claude, plus which model was called
//     and how many attempts it took — never the API key, never request headers.
import { callClaudeForChapter } from '../ai-narrative.js';

const PII_KEYS = ['email', 'birthdate', 'birthCountry', 'birthplace', 'payerName', 'year', 'month', 'day', 'hour', 'minute'];

function rejectIfPayloadCarriesPii(payload) {
  const found = [];
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (PII_KEYS.includes(k)) found.push(k);
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(payload);
  return found;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 허용됩니다.' });
    return;
  }

  const payload = req.body;
  const piiHit = rejectIfPayloadCarriesPii(payload);
  if (piiHit.length > 0) {
    // Fails loudly rather than silently stripping — a caller sending PII here is a bug
    // to fix at the call site, not something this endpoint should paper over.
    res.status(400).json({ error: `이 엔드포인트는 개인정보 필드를 받지 않습니다: ${piiHit.join(', ')}` });
    return;
  }

  const MAX_ATTEMPTS = 2; // one retry on a schema/parse failure, never more
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const chapter = await callClaudeForChapter(payload);
      res.status(200).json({ chapter, attempts: attempt, model: 'claude-opus-4-8' });
      return;
    } catch (e) {
      lastError = e;
      console.error('[prototype/generate-chapter] attempt failed:', { attempt, message: e.message });
    }
  }
  // Never echoes e.data (may embed request-adjacent detail from the Anthropic response) —
  // only a safe message and status.
  res.status(lastError?.status || 500).json({ error: lastError?.message || 'AI 호출 실패', attempts: MAX_ATTEMPTS });
}
