// 유료 API(Claude)를 부르는 엔드포인트 공용 비용 보호.
//
// 한계(정직하게): Vercel 서버리스 인스턴스마다 메모리가 따로라서, 아래 카운터는
// "인스턴스별" 최선 노력 제한이다. 인스턴스가 여러 개 뜨거나 콜드스타트되면 초기화된다.
// 전역으로 확실히 막으려면 KV/DB 같은 공유 저장소가 필요하다(계정 연결이 필요해 이번엔 제외).
// 그래도 한 IP가 반복 호출로 비용을 키우는 가장 흔한 경로는 이걸로 막힌다.

const buckets = new Map(); // key -> { count, resetAt }
let globalDay = { day: '', count: 0 };

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// 같은 사이트에서 온 요청만 허용. Origin이 없으면(서버 간 호출, curl) 막는다.
// 허용 호스트: 요청 Host 자신 + ALLOWED_ORIGINS(쉼표 구분, 선택).
export function isAllowedOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return false;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (host === req.headers?.host) return true;
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.some((o) => { try { return new URL(o).host === host; } catch { return false; } });
}

// 고정 창(window) 방식 IP별 제한 + 인스턴스별 하루 총량 제한.
export function checkRateLimit(key, { limit, windowMs, dailyCap, now = Date.now() }) {
  const day = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 날짜
  if (globalDay.day !== day) globalDay = { day, count: 0 };
  if (dailyCap > 0 && globalDay.count >= dailyCap) return { ok: false, reason: 'daily' };

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else if (b.count >= limit) {
    return { ok: false, reason: 'ip', retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  } else {
    b.count += 1;
  }
  globalDay.count += 1;
  if (buckets.size > 5000) { // 메모리 보호: 만료된 항목 정리
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  return { ok: true };
}

export function _resetForTest() { buckets.clear(); globalDay = { day: '', count: 0 }; }

// 엔드포인트 앞단에서 한 번에 검사. 막혔으면 응답을 보내고 false를 돌려준다.
export function guardPaidCall(req, res, name) {
  if (process.env.PAID_API_DISABLED === '1') {
    res.status(503).json({ error: '지금은 잠시 쉬는 중이야. 조금 뒤에 다시 와줘.' });
    return false;
  }
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: '허용되지 않은 요청이야.' });
    return false;
  }
  const r = checkRateLimit(`${name}:${clientIp(req)}`, {
    limit: envInt('PAID_API_PER_IP_LIMIT', 5),
    windowMs: envInt('PAID_API_WINDOW_MIN', 60) * 60 * 1000,
    dailyCap: envInt('PAID_API_DAILY_CAP', 300),
  });
  if (!r.ok) {
    if (r.retryAfterSec) res.setHeader('Retry-After', String(r.retryAfterSec));
    res.status(429).json({ error: r.reason === 'daily' ? '오늘은 신당 문을 닫았어. 내일 다시 와줘.' : '너무 자주 물었어. 조금 쉬었다가 다시 와줘.' });
    return false;
  }
  return true;
}
