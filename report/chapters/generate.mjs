// 종합 리포트 1장(기본 성향) + 8장(고민 집중 풀이) 규칙 기반 생성기. 유료 AI 호출 없음.
// 입력: calcSaju() 결과 + 선택 입력(concern). 출력: 고객용 본문, 사용 규칙 목록, 상담자 검토 항목(분리).
import { tenGod } from '../../api/_kst-solar-term-adapter.js';
import { DAY_MASTER, SHOWN_GROUP, MONTH_RELATION, ROOT_GROUP, DAY_BRANCH, WORK_CHOICE, MONEY } from './library.mjs';

const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const ZHI_KO = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const GAN_KO = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const SEASON = { 寅: '봄', 卯: '봄', 辰: '봄', 巳: '여름', 午: '여름', 未: '여름', 申: '가을', 酉: '가을', 戌: '가을', 亥: '겨울', 子: '겨울', 丑: '겨울' };
const EL_KO = { 木: '나무', 火: '불', 土: '흙', 金: '쇠', 水: '물' };
const GEN = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CTRL = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const TG_GROUP = { 比肩: '비겁', 劫财: '비겁', 食神: '식상', 伤官: '식상', 偏财: '재성', 正财: '재성', 七杀: '관성', 正官: '관성', 偏印: '인성', 正印: '인성' };
const TG_KO = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인' };

function relation(dayEl, otherEl) {
  if (otherEl === dayEl) return 'same';
  if (GEN[otherEl] === dayEl) return 'support';
  if (GEN[dayEl] === otherEl) return 'output';
  if (CTRL[dayEl] === otherEl) return 'wealth';
  return 'pressure';
}

export function chartKeys(saju) {
  const dm = saju.dayMaster; const dayEl = GAN_EL[dm];
  const monthStem = saju.pillars.month.ganzhi[0]; const monthZhi = saju.pillars.month.ganzhi[1];
  const dayZhi = saju.pillars.day.ganzhi[1];
  const shownTg = tenGod(dm, monthStem);
  const rootGan = (saju.hideGan.month || [])[0];
  const rootTg = rootGan ? tenGod(dm, rootGan) : null;
  return {
    dm, dayEl, monthStem, monthZhi, dayZhi, shownTg, rootGan, rootTg,
    shownGroup: TG_GROUP[shownTg], rootGroup: rootTg ? TG_GROUP[rootTg] : null,
    monthRel: relation(dayEl, ZHI_EL[monthZhi]), dayRel: relation(dayEl, ZHI_EL[dayZhi]),
  };
}

function batchim(w) {
  let s = String(w).trim(); const m = s.match(/\(([^)]*)\)\s*$/);
  if (m) { const before = s.slice(0, m.index).trim(); s = /[가-힣]$/.test(before) ? before : m[1]; }
  const c = s.charCodeAt(s.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0;
}
const iyeyo = (w) => `${w}${batchim(w) ? '이에요' : '예요'}`;
const iga = (w) => `${w}${batchim(w) ? '이' : '가'}`;
const P = (kind, text, rule, evidence) => ({ kind, text, rule, evidence });

function chapter1(saju, k) {
  const D = DAY_MASTER[k.dm]; const S = SHOWN_GROUP[k.shownGroup]; const M = MONTH_RELATION[k.monthRel];
  const R = k.rootGroup ? ROOT_GROUP[k.rootGroup] : null; const B = DAY_BRANCH[k.dayRel];
  const sections = [];
  sections.push({ q: '사람들은 나를 어떻게 보고, 실제 나는 어떤가요?', paras: [
    P('meaning', `사주에서 '나 자신'을 대표하는 글자는 태어난 날의 첫 글자예요(일간, 日干). 당신의 글자는 ${D.image}에 비유되는 ${iyeyo(D.name)}. ${D.meaning}`, `DM-${k.dm}`, `일간 ${k.dm}`),
    P('example', `예를 들면, ${D.example}`, `DM-${k.dm}`, `일간 ${k.dm}`),
    P('meaning', `한편 태어난 달의 겉면에는 ${iga(`${k.monthStem}(${GAN_KO[k.monthStem]})`)} 드러나 있어요. 당신에게 이 글자는 ${S.label}(${TG_KO[k.shownTg]})을 뜻해요. ${S.meaning}`, `SHOWN-${k.shownGroup}`, `월간 ${k.monthStem} = ${TG_KO[k.shownTg]}`),
    P('example', `예를 들면, ${S.example}`, `SHOWN-${k.shownGroup}`, `월간 ${k.monthStem}`),
    P('caution', `주의할 점: ${D.caution} ${S.caution}`, `DM-${k.dm}+SHOWN-${k.shownGroup}`, `일간 ${k.dm}, 월간 ${k.monthStem}`),
    P('use', `활용 방법: ${D.use} ${S.use}`, `DM-${k.dm}+SHOWN-${k.shownGroup}`, `일간 ${k.dm}, 월간 ${k.monthStem}`),
  ] });
  const sec2 = [
    P('meaning', `당신이 태어난 달은 ${SEASON[k.monthZhi]}(${ZHI_KO[k.monthZhi]}월, ${k.monthZhi}月)이고, 이 달의 기운은 ${iyeyo(EL_KO[ZHI_EL[k.monthZhi]])}. 당신의 기운인 ${EL_KO[k.dayEl]}${batchim(EL_KO[k.dayEl]) ? '과' : '와'} 견주면 ${iyeyo(`${M.label}(${M.term})`)}. ${M.meaning}`, `MREL-${k.monthRel}`, `월지 ${k.monthZhi}(${ZHI_EL[k.monthZhi]}) · 일간 ${k.dm}(${k.dayEl})`),
  ];
  if (R) {
    sec2.push(P('meaning', `태어난 달 속 중심 글자 ${k.rootGan}(${GAN_KO[k.rootGan]})은 당신에게 ${TG_KO[k.rootTg]}${batchim(TG_KO[k.rootTg]) ? '이에요' : '예요'}. ${R.meaning}`, `ROOT-${k.rootGroup}`, `월지 ${k.monthZhi} 본기 ${k.rootGan} = ${TG_KO[k.rootTg]}`));
    sec2.push(P('example', `예를 들면, ${R.example}`, `ROOT-${k.rootGroup}`, `월지 본기 ${k.rootGan}`));
  }
  sec2.push(P('caution', `주의할 점: ${M.caution}`, `MREL-${k.monthRel}`, `월지 ${k.monthZhi}`));
  sec2.push(P('use', `활용 방법: ${M.use}`, `MREL-${k.monthRel}`, `월지 ${k.monthZhi}`));
  sections.push({ q: '나는 무엇에서 힘을 얻나요?', paras: sec2 });
  sections.push({ q: '내가 편하게 머무는 자리는 어떤 모습인가요?', paras: [
    P('meaning', `태어난 날의 아래 글자(일지, 日支)는 생활의 기반이나 가장 가까운 자리를 상징해요. 당신은 이 자리에 ${k.dayZhi}(${ZHI_KO[k.dayZhi]}), 즉 ${EL_KO[ZHI_EL[k.dayZhi]]}의 기운이 놓여 있어요. ${B.meaning}`, `DREL-${k.dayRel}`, `일지 ${k.dayZhi}(${ZHI_EL[k.dayZhi]}) · 일간 ${k.dm}(${k.dayEl})`),
    P('example', `예를 들면, ${B.example}`, `DREL-${k.dayRel}`, `일지 ${k.dayZhi}`),
    P('caution', `주의할 점: ${B.caution}`, `DREL-${k.dayRel}`, `일지 ${k.dayZhi}`),
    P('use', `활용 방법: ${B.use}`, `DREL-${k.dayRel}`, `일지 ${k.dayZhi}`),
  ] });
  const summary = `당신은 ${D.image}에 비유되는 사람이고, 겉으로는 ${iga(S.label)} 먼저 보일 수 있어요. 힘은 '${M.label}'에서 나오고, 생활의 기반은 '${B.label}'에 가까워요. 이 장의 활용 방법 세 가지를 하나씩 시험해 보세요.`;
  return { id: 'ch1', title: '1장. 나는 어떤 사람인가요?',
    intro: `이 장에서는 태어난 해·달·날의 글자로 성향을 읽어요. 사주의 해석은 오래 이어져 온 상징을 생활에 맞게 풀어낸 것이에요. 성격 검사처럼 측정한 결과가 아니라, 나를 비춰 보는 거울로 읽어 주세요. '예를 들면'으로 시작하는 문단은 이렇게 나타날 수 있다는 가능성의 예시예요.${saju.hourKnown ? '' : ' 태어난 시간을 몰라서, 시간에 해당하는 글자는 빼고 읽었어요.'}`,
    sections, summary };
}

// ── 8장 ─────────────────────────────────────────────
const WORK_RE = /회사|퇴사|이직|독립|창업|취업|직장|커리어|부업|프리랜서|일을|진로/;
const MONEY_RE = /돈|저축|소비|지출|재테크|빚|월급|가계|투자|모으/;
const CHANGE_RE = /퇴사|독립|이직|창업|그만|옮기|시작하|새로/;
const KEEP_RE = /계속|유지|다니|병행|남는|머무/;

export function classifyConcern(c) {
  if (!c || !c.question || !c.question.trim()) return 'none';
  // 질문 문장을 먼저 본다. 상황란의 단어(예: '직장인')가 질문 유형을 바꾸지 않게 한다.
  const q = c.question; const s = c.situation || '';
  if (WORK_RE.test(q)) return 'work';
  if (MONEY_RE.test(q)) return 'money';
  if (WORK_RE.test(s)) return 'work';
  if (MONEY_RE.test(s)) return 'money';
  return 'unsupported';
}
const classifyOption = (o) => (CHANGE_RE.test(o) ? 'change' : KEEP_RE.test(o) ? 'keep' : 'unknown');
function periodMonths(p) { const m = /(\d+)\s*개월/.exec(p || ''); if (m) return +m[1]; if (/올해|1년|일 년/.test(p || '')) return 12; return null; }

function chapter8(saju, k, concern, review) {
  const topic = classifyConcern(concern);
  const base = { id: 'ch8', title: '8장. 지금 내 고민, 어떻게 볼까요?', topic };
  if (topic === 'none') {
    review.push('고민 미입력: 8장은 비워 두었어요. 상담 후 질문을 받아 다시 생성하세요.');
    return { ...base, status: 'empty', intro: '이번 리포트에는 따로 적어 주신 고민이 없어서, 이 장은 비워 두었어요. 궁금한 질문이 생기면 상담자에게 알려 주세요. 그 질문을 중심으로 이 장을 다시 써 드려요.', sections: [] };
  }
  const quoted = `알려 주신 질문: "${concern.question.trim()}"${concern.situation ? ` / 알려 주신 상황: ${concern.situation.trim()}` : ''}`;
  if (topic === 'unsupported') {
    review.push(`검토 필요: 질문 유형을 자동 풀이가 지원하지 않아요(현재 지원: 일·진로 선택, 돈 관리). 질문: "${concern.question.trim()}" → 상담자가 직접 작성하세요.`);
    return { ...base, status: 'review', quoted, intro: '이 질문은 현재 자동 풀이 범위 밖이라, 상담자가 직접 살펴보고 이 장을 채워 드릴 예정이에요. 근거 없이 답을 만들지 않기 위해 비워 두었어요.', sections: [] };
  }
  const S = SHOWN_GROUP[k.shownGroup]; const M = MONTH_RELATION[k.monthRel];
  const intro = '먼저 분명히 해 둘게요. 사주는 선택의 결과를 알려 주지 않아요. 이 장이 도와줄 수 있는 건, 이 고민 앞에서 당신의 성향이 어떻게 작동하기 쉬운지, 그리고 무엇을 확인하면 덜 흔들리고 고를 수 있는지예요. 아래 질문과 상황은 사주로 알아낸 것이 아니라 직접 적어 주신 내용이에요.';
  const sections = [];
  if (topic === 'work') {
    sections.push({ q: '이 고민에서 나의 성향은 어떻게 작동할까요?', paras: [
      P('meaning', `1장에서 본 것처럼 당신에게는 ${iga(S.label)} 겉으로 드러나 있고, 힘의 바탕은 '${M.label}'이에요. ${WORK_CHOICE.drive[k.monthRel]}`, `W-drive-${k.monthRel}`, `월지 ${k.monthZhi}, 월간 ${k.monthStem}`),
      P('caution', `이 고민에서도 마찬가지로, ${S.caution}`, `SHOWN-${k.shownGroup}`, `월간 ${k.monthStem}`),
    ] });
    const opts = (concern.options || []).filter(Boolean);
    if (!opts.length) review.push('선택지 미입력: 선택지별 풀이를 생략했어요.');
    for (const o of opts) {
      const t = classifyOption(o);
      if (t === 'unknown') {
        review.push(`검토 필요: 선택지 "${o}"를 유지/변화로 분류하지 못해 풀이를 생략했어요.`);
        sections.push({ q: `선택지: ${o}`, paras: [P('meaning', '이 선택지는 자동 풀이로 분류하지 못했어요. 상담자가 직접 살펴볼 예정이에요.', 'W-opt-unknown', '선택지 분류 실패')] });
        continue;
      }
      const L = WORK_CHOICE[t];
      sections.push({ q: `선택지: ${o}`, paras: [
        P('meaning', `이 선택이 성향과 맞는 지점: ${L.fit[k.shownGroup]}`, `W-${t}-fit-${k.shownGroup}`, `월간 ${k.monthStem} = ${TG_KO[k.shownTg]}`),
        P('caution', `주의할 점: ${L.caution[k.shownGroup]}`, `W-${t}-caution-${k.shownGroup}`, `월간 ${k.monthStem}`),
        P('use', t === 'keep' ? `이 선택을 고른다면: ${WORK_CHOICE.keep.action[k.shownGroup]}` : `이 선택을 고른다면: 아래 현실 점검 항목을 숫자로 먼저 채우고, 결정하기 전에 믿을 만한 사람 한 명에게 그 숫자를 보여 주세요. 주의할 점이 실제로 작동하고 있는지 바깥 눈으로 확인하는 방법이에요.`, t === 'keep' ? `W-keep-action-${k.shownGroup}` : 'W-change-action', t === 'keep' ? `월간 ${k.monthStem}` : '현실 점검 연결'),
      ] });
    }
    sections.push({ q: '사주와 별개로, 현실적으로 확인할 것', box: true, paras: WORK_CHOICE.reality.map((r) => P('check', r, 'W-reality', '사주 해석 아님')) });
  } else {
    sections.push({ q: '돈을 다루는 나의 방식은 어떤가요?', paras: [
      P('meaning', `${MONEY.style[k.shownGroup]} 태어난 달의 겉면에 ${S.label}(${TG_KO[k.shownTg]})이 드러난 데서 나온 해석이에요.`, `MONEY-style-${k.shownGroup}`, `월간 ${k.monthStem}`),
      P('caution', `주의할 점: ${MONEY.caution[k.monthRel]}`, `MONEY-caution-${k.monthRel}`, `월지 ${k.monthZhi}`),
      P('use', `활용 방법: ${MONEY.action[k.shownGroup]}`, `MONEY-action-${k.shownGroup}`, `월간 ${k.monthStem}`),
    ] });
    if ((concern.options || []).length) review.push('돈 관리 유형은 선택지별 풀이를 아직 지원하지 않아요. 선택지는 상담자가 검토하세요.');
    sections.push({ q: '사주와 별개로, 현실적으로 확인할 것', box: true, paras: MONEY.reality.map((r) => P('check', r, 'MONEY-reality', '사주 해석 아님')) });
  }
  const n = periodMonths(concern.period);
  if (n) {
    const a = n >= 3 ? Math.max(1, Math.round(n / 3)) : 1; const b = n >= 3 ? Math.max(a + 1, Math.min(n - 1, Math.round((2 * n) / 3))) : 1;
    const span = (x, y) => (n === 1 ? (x === 1 && y === 1 && !span.used ? (span.used = true, '처음 2주') : '마지막 2주') : x === y ? `${x}개월 차` : `${x}~${y}개월 차`);
    const last = topic === 'work'
      ? `처음 적은 숫자와 시험해 본 결과를 나란히 놓고 다시 골라요. 이때 ${iga(SHOWN_GROUP[k.shownGroup].label)} 결정을 앞질러 가지 않는지 확인하세요.`
      : `처음 적은 숫자와 지금 숫자를 비교해 관리 방식을 조정해요. 이때 ${iga(SHOWN_GROUP[k.shownGroup].label)} 계획보다 앞서 가지 않았는지 확인하세요.`;
    const deadline = topic === 'work' ? '실제로 정해진 마감(계약 만료, 제안 기한 등)이 있다면 그 날짜에 맞춰 구간을 앞당겨 쓰세요.' : '큰 지출이 예정된 달이 있다면 그 달을 피해 구간을 조정해 쓰세요.';
    sections.push({ q: `앞으로 ${n}개월, 이렇게 점검해 보세요`, paras: [
      P('meaning', '어느 달이 좋은 시기인지 같은 시기 판단은 이 리포트에서 하지 않아요. 계산 기준이 검증된 범위가 아니기 때문이에요. 대신 정해 주신 기간을 점검 구간으로 나눴어요.', 'PERIOD', `입력 기간 ${n}개월`),
      P('use', `${span(1, a)}: 위의 현실 점검 항목을 숫자로 채워요.`, 'PERIOD', `입력 기간 ${n}개월`),
      ...(n >= 3 ? [P('use', `${span(a + 1, b)}: 작게 시험해 보는 구간이에요. 위의 활용 방법을 실제로 해 보는 기간이에요.`, `PERIOD+MREL-${k.monthRel}`, `월지 ${k.monthZhi}`)] : []),
      P('use', `${span(n >= 3 ? b + 1 : n, n)}: ${last}`, `PERIOD+SHOWN-${k.shownGroup}`, `월간 ${k.monthStem}`),
      P('caution', deadline, 'PERIOD', '마감 정보 미입력'),
    ] });
  } else if (concern.period) {
    review.push(`기간 "${concern.period}"을 개월 수로 읽지 못해 점검 계획을 생략했어요.`);
  }
  return { ...base, status: 'generated', quoted, intro, sections };
}

export function generateChapters(saju, { clientLabel, concern = null } = {}) {
  const k = chartKeys(saju);
  const review = [];
  if (!saju.hourKnown) review.push('출생 시간 모름: 시주 없이 생성했어요.');
  for (const n of saju.notices || []) review.push(`계산 안내: ${n.text}`);
  review.push('문단 라이브러리 v0은 명리 전문가 검수 전이에요. 해석 문장은 검토 후 사용하세요.');
  const ch1 = chapter1(saju, k);
  const ch8 = chapter8(saju, k, concern, review);
  const rules = [...new Set([ch1, ch8].flatMap((c) => (c.sections || []).flatMap((s) => s.paras.map((p) => p.rule))))];
  return { meta: { clientLabel, generator: 'chapters-rule-v0', paidAiCalls: 0 }, keys: k,
    cover: { title: DAY_MASTER[k.dm].cover, subtitle: '성향 · 일 · 돈 · 관계 · 선택을 담은 종합 사주 리포트' },
    chapters: [ch1, ch8], review, rules };
}
