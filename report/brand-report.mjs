// 브랜드 사주 리포트 — 규칙 기반 원고 생성기 (유료 AI 호출 없음).
//
// 원칙
// - 입력은 calcSaju() 결과(검증된 계산)만. 직업·관계·경험은 받지 않으므로 쓰지 않는다.
// - 문장은 "어떤 계산 요소가 어느 자리에 있는가"로 고른다. 일간 하나로 전체를 정하지 않는다.
// - 오행 개수·십성 등장 횟수로 "강하다/약하다", "이런 행동을 한다"를 단정하지 않는다.
//   강약(신강·신약, 왕쇠)은 월령·통근·투출을 종합하는 학파별 판단이라 이 생성기는 하지 않는다.
// - 해석은 전통 상징에 따른 설명이다. 미래·수익을 보장하지 않는다. 대운은 쓰지 않는다(미검증).
// - 고객용 본문(customer)과 상담자 검토 항목(review)을 분리해서 돌려준다.

import { tenGod } from '../api/_kst-solar-term-adapter.js';

const GAN_ELEMENT = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const GAN_YANG = { 甲: true, 丙: true, 戊: true, 庚: true, 壬: true, 乙: false, 丁: false, 己: false, 辛: false, 癸: false };
const ZHI_ELEMENT = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const ZHI_SEASON = { 寅: '봄', 卯: '봄', 辰: '봄', 巳: '여름', 午: '여름', 未: '여름', 申: '가을', 酉: '가을', 戌: '가을', 亥: '겨울', 子: '겨울', 丑: '겨울' };
const GEN = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CTRL = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const EL_KO = { 木: '목(木)', 火: '화(火)', 土: '토(土)', 金: '금(金)', 水: '수(水)' };
const GAN_KO = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const ZHI_KO = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const TG_KO = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인' };
const TG_GROUP = { 比肩: '비겁', 劫财: '비겁', 食神: '식상', 伤官: '식상', 偏财: '재성', 正财: '재성', 七杀: '관성', 正官: '관성', 偏印: '인성', 正印: '인성' };
const POS_KO = { year: '년', month: '월', day: '일', time: '시' };
// 받침 기준 조사 선택. 괄호 설명은 건너뛰고 앞 한글/숫자로 판단한다.
const DIGIT_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
function hasBatchim(word) {
  let s = String(word).trim();
  const paren = s.match(/\(([^)]*)\)\s*$/);
  if (paren) {
    const before = s.slice(0, paren.index).trim();
    // 괄호 앞이 한글·숫자면 그걸로, 한자 등이면 괄호 안(한글 독음·십성명)으로 판단
    s = /[가-힣0-9]$/.test(before) ? before : paren[1].trim();
  }
  const ch = s[s.length - 1];
  if (/[0-9]/.test(ch)) return DIGIT_BATCHIM[ch];
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 !== 0 : false;
}
const j = (word, withB, withoutB) => `${word}${hasBatchim(word) ? withB : withoutB}`;
const iyeyo = (w) => j(w, '이에요', '예요');
const iga = (w) => j(w, '이', '가');
const eunneun = (w) => j(w, '은', '는');
const reading = (gz) => `${gz}(${GAN_KO[gz[0]]}${ZHI_KO[gz[1]]})`;

// 일간 상징(전통 비유). 행동 단정 없이 "비유된다/상징한다"로만.
const GAN_IMAGE = {
  甲: '곧게 위로 자라는 큰 나무에 비유돼요. 전통적으로 방향을 세우고 뻗어 나가려는 기운을 상징해요.',
  乙: '풀과 덩굴에 비유돼요. 전통적으로 주변에 맞춰 휘어지며 자리를 넓혀 가는 유연함을 상징해요.',
  丙: '하늘의 태양에 비유돼요. 전통적으로 넓게 비추고 드러내는 기운을 상징해요.',
  丁: '등불·촛불에 비유돼요. 전통적으로 가까운 곳을 오래 비추는 집중과 온기를 상징해요.',
  戊: '큰 산·넓은 땅에 비유돼요. 전통적으로 받쳐 주고 버티는 중심을 상징해요.',
  己: '논밭의 흙에 비유돼요. 전통적으로 길러 내고 다듬어 쓰임을 만드는 기운을 상징해요.',
  庚: '다듬기 전의 쇠·바위에 비유돼요. 전통적으로 결단하고 잘라 내는 기운을 상징해요.',
  辛: '세공된 보석·칼날에 비유돼요. 전통적으로 섬세하게 가려내고 다듬는 기운을 상징해요.',
  壬: '큰 강·바다에 비유돼요. 전통적으로 넓게 흐르며 담아내는 기운을 상징해요.',
  癸: '비·이슬에 비유돼요. 전통적으로 스며들고 적시는 섬세한 기운을 상징해요.',
};

// 월지(태어난 달) 오행과 일간 오행의 관계 — 계산값. 해석은 전통 상징.
function monthRelation(dayEl, monthEl) {
  if (monthEl === dayEl) return { key: 'same', label: '일간과 같은 오행', text: '태어난 달의 기운이 일간과 같은 오행이에요. 전통적으로 자기 기준과 주체성이 바탕에 깔린 구성으로 읽어요.' };
  if (GEN[monthEl] === dayEl) return { key: 'support', label: '일간을 생하는 오행', text: '태어난 달의 기운이 일간을 생(生)해 주는 오행이에요. 전통적으로 배우고 흡수하며 힘을 얻는 바탕으로 읽어요.' };
  if (GEN[dayEl] === monthEl) return { key: 'output', label: '일간이 생하는 오행', text: '태어난 달의 기운이 일간이 생(生)해 주는 오행이에요. 전통적으로 안에 있는 것을 밖으로 내보내고 표현하는 방향으로 읽어요.' };
  if (CTRL[dayEl] === monthEl) return { key: 'wealth', label: '일간이 극하는 오행', text: '태어난 달의 기운이 일간이 다스리는(극하는) 오행이에요. 전통적으로 현실의 대상과 결과물을 다루는 방향으로 읽어요.' };
  return { key: 'pressure', label: '일간을 극하는 오행', text: '태어난 달의 기운이 일간을 다스리는(극하는) 오행이에요. 전통적으로 바깥의 기준·책임과 마주하는 환경으로 읽어요.' };
}

// 십성 그룹 상징 + 자리별 문장. 등장 "횟수"는 쓰지 않고 "어느 자리에 있는지"만 쓴다.
const GROUP_MEANING = {
  비겁: '나와 같은 오행으로, 동료·경쟁·자기 힘을 상징해요.',
  식상: '내가 생하는 오행으로, 표현·기획·만들어 내는 힘을 상징해요.',
  재성: '내가 다스리는 오행으로, 재물·결과물·현실 감각을 상징해요.',
  관성: '나를 다스리는 오행으로, 규범·책임·외부의 기준을 상징해요.',
  인성: '나를 생하는 오행으로, 배움·보호·해석하는 힘을 상징해요.',
};
const POS_MEANING = {
  year: '년주는 전통적으로 바깥 환경·첫 사회의 자리로 봐요.',
  month: '월주는 전통적으로 사회 활동·일의 자리로 봐요.',
  day: '일지는 전통적으로 가장 가까운 관계와 나의 기반 자리로 봐요.',
  time: '시주는 전통적으로 결과·지향의 자리로 봐요.',
};

export function collectFacts(saju) {
  const dm = saju.dayMaster;
  const dayEl = GAN_ELEMENT[dm];
  const pillars = saju.pillars;
  const keys = ['year', 'month', 'day', 'time'].filter((k) => pillars[k]);
  const occ = []; // { group, tg, gan, pos, layer: '천간'|'지장간' }
  for (const k of keys) {
    if (k !== 'day') { const g = pillars[k].ganzhi[0]; const t = tenGod(dm, g); occ.push({ group: TG_GROUP[t], tg: t, gan: g, pos: k, layer: '천간' }); }
    for (const g of saju.hideGan[k] || []) { const t = tenGod(dm, g); occ.push({ group: TG_GROUP[t], tg: t, gan: g, pos: k, layer: '지장간' }); }
  }
  const monthZhi = pillars.month.ganzhi[1];
  return {
    dm, dayEl, yang: GAN_YANG[dm], keys, occ,
    hourKnown: saju.hourKnown !== false && !!pillars.time,
    monthZhi, season: ZHI_SEASON[monthZhi],
    month: monthRelation(dayEl, ZHI_ELEMENT[monthZhi]),
    dayZhi: pillars.day.ganzhi[1], dayZhiEl: ZHI_ELEMENT[pillars.day.ganzhi[1]],
    wuxing: saju.wuxingCount, letters: keys.length * 2,
    notices: saju.notices || [],
  };
}

const at = (f, group) => f.occ.filter((o) => o.group === group);
const where = (list) => [...new Set(list.map((o) => `${POS_KO[o.pos]}${o.pos === 'day' ? '지' : '주'} ${o.layer}(${o.gan}, ${TG_KO[o.tg]})`))].join(', ');
const shown = (f, group) => at(f, group).filter((o) => o.layer === '천간'); // 천간에 드러난 것
const hidden = (f, group) => at(f, group).filter((o) => o.layer === '지장간');

// 근거 블록 하나 = { text, evidence: [계산 사실], rule: 규칙 id }
function para(rule, text, evidence) { return { rule, text, evidence }; }

function sectionTemperament(f, saju) {
  const out = [];
  out.push(para('T1-daymaster', `일간은 ${reading(saju.pillars.day.ganzhi)}의 ${saju.dayMaster}, ${f.yang ? '양' : '음'}의 ${iyeyo(EL_KO[f.dayEl])}. ${GAN_IMAGE[f.dm]}`,
    [`일간 ${f.dm}`]));
  out.push(para(`T2-month-${f.month.key}`, `태어난 달은 ${f.season}의 ${f.monthZhi}(${ZHI_KO[f.monthZhi]})월이에요. ${f.month.text}`,
    [`월지 ${f.monthZhi} = ${EL_KO[ZHI_ELEMENT[f.monthZhi]]}, 일간 ${EL_KO[f.dayEl]} 기준 ${f.month.label}`]));
  const dz = f.dayZhiEl === f.dayEl ? '일간과 같은 오행이라, 전통적으로 자기 기반이 스스로에게서 나오는 자리로 읽어요.'
    : GEN[f.dayZhiEl] === f.dayEl ? '일간을 생하는 오행이라, 전통적으로 가까운 곳에서 받쳐 주는 기반으로 읽어요.'
      : GEN[f.dayEl] === f.dayZhiEl ? '일간이 생하는 오행이라, 전통적으로 가까운 관계와 생활에서 내보내는 힘이 쓰이는 자리로 읽어요.'
        : CTRL[f.dayEl] === f.dayZhiEl ? '일간이 다스리는 오행이라, 전통적으로 생활 기반에서 현실적인 것을 챙기는 자리로 읽어요.'
          : '일간을 다스리는 오행이라, 전통적으로 가까운 자리에서 긴장과 기준을 함께 마주하는 구성으로 읽어요.';
  out.push(para('T3-dayzhi', `앉은 자리인 일지는 ${f.dayZhi}(${ZHI_KO[f.dayZhi]}), ${iyeyo(EL_KO[f.dayZhiEl])}. ${dz}`, [`일지 ${f.dayZhi}`]));
  // 오행 분포: 사실만. 강약 판단 안 함을 명시.
  const dist = Object.entries(f.wuxing).map(([e, n]) => `${EL_KO[e]} ${n}`).join(' · ');
  const zero = Object.entries(f.wuxing).filter(([, n]) => n === 0).map(([e]) => EL_KO[e]);
  out.push(para('T4-distribution', `겉으로 드러난 ${f.letters}글자의 오행 분포는 ${iyeyo(dist)}. 이 숫자는 글자 개수일 뿐이라, 이것만으로 어떤 기운이 "강하다·약하다"고 판단하지 않아요. 강약은 태어난 달의 기운, 뿌리(지장간), 드러남(천간)을 함께 봐야 하는 판단이고 보는 방식에 따라 결론이 달라질 수 있어요.${zero.length ? ` ${iga(zero.join('·'))} 0개로 나오지만${f.hourKnown ? '' : ' 시주가 빠진 계산이라 더더욱'} "없다"고 단정하지 않아요.` : ''}`,
    [`오행 개수(${f.letters}글자): ${dist}`]));
  return out;
}

const STRENGTH_TEXT = {
  인성: (l) => `인성(배움·해석)이 ${l}에 있어요. 전통적으로 정보를 받아들여 자기 방식으로 이해하는 힘으로 읽어요.`,
  식상: (l) => `식상(표현·기획)이 ${l}에 있어요. 전통적으로 생각을 말·글·결과물로 바꿔 내는 힘으로 읽어요.`,
  재성: (l) => `재성(재물·결과물)이 ${l}에 있어요. 전통적으로 현실의 조건을 따지고 쓸모를 만드는 감각으로 읽어요.`,
  관성: (l) => `관성(규범·책임)이 ${l}에 있어요. 전통적으로 기준을 세우고 맡은 몫을 지키는 힘으로 읽어요.`,
  비겁: (l) => `비겁(자기 힘·동료)이 ${l}에 있어요. 전통적으로 스스로 버티고 밀고 나가는 힘으로 읽어요.`,
};

function sectionStrength(f, explained) {
  const out = [];
  // 천간에 드러난 그룹 우선(드러남), 그다음 지장간에만 있는 그룹. 횟수가 아니라 "자리"로 순서를 정한다.
  const order = ['인성', '식상', '재성', '관성', '비겁'];
  const shownGroups = order.filter((g) => shown(f, g).length);
  const hiddenOnly = order.filter((g) => !shown(f, g).length && hidden(f, g).length);
  shownGroups.concat(hiddenOnly).forEach((g) => explained.add(g));
  shownGroups.forEach((g, i) => {
    const tail = i === shownGroups.length - 1 ? ` ${shownGroups.length > 1 ? '이 기운들은' : '이 기운은'} 천간에 드러나 있어서, 바깥에서 비교적 잘 보이는 쓰임으로 봐요.` : '';
    out.push(para(`S-shown-${g}`, `${STRENGTH_TEXT[g](where(shown(f, g)))}${tail}`, [where(shown(f, g))]));
  });
  if (hiddenOnly.length) {
    out.push(para('S-hidden', `${eunneun(hiddenOnly.join('·'))} 지장간에만 있어요. 전통적으로 겉으로 바로 드러나기보다 안에 지니고 있는 가능성으로 읽어요. ${hiddenOnly.map((g) => `${g}: ${GROUP_MEANING[g].replace(/상징해요\.$/, '상징')}`).join(' / ')}.`,
      hiddenOnly.map((g) => `${g}: ${where(hidden(f, g))}`)));
  }
  const absent = order.filter((g) => !at(f, g).length);
  if (absent.length) {
    out.push(para('S-absent', `계산된 ${f.hourKnown ? '네' : '세'} 기둥 안에서는 ${iga(absent.join('·'))} 보이지 않아요. 보이지 않는다고 그 능력이 없다는 뜻은 아니에요. 이 리포트는 있는 글자만 근거로 써요.`,
      [`${absent.join('·')} 등장 자리 없음`]));
  }
  return out;
}

function sectionRelation(f, explained) {
  const meaning = (g) => (explained.has(g) ? '' : `${GROUP_MEANING[g]} `);
  const out = [];
  const dz = f.occ.filter((o) => o.pos === 'day');
  out.push(para('R1-dayzhi', `${POS_MEANING.day} 이 자리의 지장간은 ${dz.map((o) => `${o.gan}(${TG_KO[o.tg]})`).join('·')}이에요. ${(() => { const gs2 = [...new Set(dz.map((o) => o.group))]; return gs2.length > 1 ? `가장 가까운 관계 안에 ${gs2.join('·')}의 상징이 함께 있다는 뜻으로 읽어요.` : `가장 가까운 관계 자리에 ${gs2[0]}의 상징이 있다는 뜻으로 읽어요.`; })()}`,
    [`일지 지장간 ${dz.map((o) => o.gan + '=' + TG_KO[o.tg]).join(', ')}`]));
    // 일지(가까운 관계 자리)는 바로 위 R1 문장에서 이미 다뤘으므로, 여기서는 천간에 드러난 것만 쓴다.
  const relSeat = (g) => at(f, g).filter((o) => o.layer === '천간');
  const bg = relSeat('비겁');
  if (bg.length) out.push(para('R2-bigeop', `비겁이 ${where(bg)}에 있어요. ${meaning('비겁')}전통적으로 함께 가는 사람과 견주게 되는 사람이 가까이 있는 구성으로 읽어요. 관계에서 각자의 속도를 먼저 맞춰 두면 이 상징을 좋은 쪽으로 쓰기 쉬워요.`, [where(bg)]));
  const gs = relSeat('관성');
  if (gs.length) out.push(para('R3-gwanseong', `관성이 ${where(gs)}에 있어요. ${meaning('관성')}관계 안에서 지켜야 할 선과 약속을 의식하게 되는 구성으로 읽어요.`, [where(gs)]));
  const ins = relSeat('인성');
  if (ins.length) out.push(para('R4-inseong', `인성이 ${where(ins)}에 있어요. ${meaning('인성')}관계에서 받는 도움과 배움이 어디서 오는지 살펴볼 만한 자리예요.`, [where(ins)]));
  return out;
}

function sectionWork(f) {
  const out = [];
  out.push(para('W1-monthpillar', `${POS_MEANING.month} 이 사례의 월주에는 ${iga(f.occ.filter((o) => o.pos === 'month').map((o) => `${o.layer} ${o.gan}(${TG_KO[o.tg]})`).join(', '))} 있어요.`,
    [`월주 십성 ${f.occ.filter((o) => o.pos === 'month').map((o) => o.gan + '=' + TG_KO[o.tg]).join(', ')}`]));
  const pairs = [
    ['재성', '식상', 'W2-sik-jae', '식상(만들어 내는 힘)과 재성(결과물)이 함께 있어요. 전통적으로 기획·표현을 실제 결과로 잇는 흐름(식상생재)으로 설명해요.'],
    ['재성', '관성', 'W3-jae-gwan', '재성과 관성이 함께 있어요. 전통적으로 성과를 정해진 틀과 책임 안에서 쌓는 흐름으로 설명해요.'],
    ['관성', '인성', 'W4-gwan-in', '관성과 인성이 함께 있어요. 전통적으로 기준을 배워 자기 것으로 만드는 흐름(관인상생)으로 설명해요.'],
  ];
  // 조합은 두 기운이 모두 천간에 드러났을 때만 쓴다. 지장간까지 넣으면 거의 모든 사주에서 성립해 변별력이 없다.
  let any = false;
  for (const [a, b, id, text] of pairs) {
    if (shown(f, a).length && shown(f, b).length) { any = true; out.push(para(id, text, [where(shown(f, a)), where(shown(f, b))])); }
  }
  if (!any) {
    const sg = [...new Set(f.occ.filter((o) => o.layer === '천간').map((o) => o.group))];
    out.push(para('W6-single', `천간에 드러난 기운은 ${sg.join('·')}${sg.length > 1 ? '이고, 이들 사이에 전통적으로 이름 붙는 조합(식상생재·관인상생 등)은 천간에서 성립하지 않아요' : '뿐이라, 천간에서 성립하는 조합은 없어요'}. 일에서의 흐름은 위 월주의 기운을 중심으로 보는 편이 맞아요.`, [`천간 십성 그룹: ${sg.join(', ')}`]));
  }
  return out;
}

// 실천 제안: 위 섹션에서 실제로 선택된 규칙에서만 파생. 규칙당 1개, 중복 없음.
const PRACTICE = {
  'T2-month-support': '새로 배우는 것을 자기 말로 한 줄 정리하는 습관을 들여 보세요. 받아들이는 바탕을 쓰임으로 바꾸는 가장 작은 방법이에요.',
  'T2-month-output': '생각을 머릿속에만 두지 말고 짧은 글이나 메모로 내보내 보세요. 표현의 방향을 실제로 써 보는 연습이에요.',
  'T2-month-wealth': '하고 싶은 일마다 시간·비용·끝나는 시점을 먼저 적어 보세요. 현실 감각의 상징을 판단 도구로 쓰는 방법이에요.',
  'T2-month-pressure': '맡은 일의 기준을 남이 정한 것과 내가 정한 것으로 나눠 적어 보세요. 바깥 기준에 휘둘리지 않게 해 줘요.',
  'T2-month-same': '중요한 결정 전에 다른 사람 의견 한 가지를 일부러 들어 보세요. 자기 기준이 바탕인 구성에 균형을 더해 줘요.',
  'R2-bigeop': '함께 일하거나 가까운 사람에게 내가 편한 속도를 먼저 말로 알려 주세요.',
  'R3-gwanseong': '관계에서 지키고 싶은 선을 한 문장으로 정해 두세요. 상대에게 기대하는 것도 같이 적어 보면 좋아요.',
  'W2-sik-jae': '만든 것을 결과로 잇는 단계 하나(공개·제안·판매 문의 등)를 정해 두세요. 무엇을 할지는 지금 하는 일에 맞춰 상담에서 정해요.',
  'W3-jae-gwan': '성과를 기록하는 방식을 하나 정해 보세요. 틀 안에서 쌓은 것이 눈에 보이게 해 줘요.',
  'W4-gwan-in': '지금 따르는 기준 하나를 골라, 왜 그런지 이해한 내용을 정리해 보세요.',
};

function sectionPractice(sections) {
  const used = sections.flat().map((p) => p.rule);
  const picked = Object.keys(PRACTICE).filter((r) => used.includes(r)).slice(0, 4);
  return picked.map((r, i) => para(`P-${r}`, `${i + 1}. ${PRACTICE[r]}`, [`근거 규칙 ${r}`]));
}

// 상담자 검토 항목 — 고객 본문에 들어가지 않는다.
function reviewItems(f) {
  const items = [
    { id: 'R-job', text: '직업·하는 일을 입력받지 않았어요. "일" 항목에 실제 업무 맥락을 넣을지 상담 후 결정하세요. 없으면 지금 문장 그대로 둡니다.' },
    { id: 'R-relation', text: '연애·가족 등 관계 상황을 입력받지 않았어요. 특정 상대나 궁합 내용은 쓰지 않았어요.' },
    { id: 'R-experience', text: '실제 경험 사례가 없어요. 각 항목에 내담자 사례 1개씩 넣으면 개인 맞춤도가 올라가요(상담자가 직접 작성).' },
    { id: 'R-strength', text: '강약(신강·신약) 판단은 하지 않았어요. 필요하면 상담자가 쓰는 관법 기준을 밝히고 직접 추가하세요.' },
  ];
  if (!f.hourKnown) items.unshift({ id: 'R-hour', text: '출생 시간 모름: 시주를 제외하고 세 기둥만으로 썼어요. 시간을 알게 되면 다시 생성하세요.' });
  for (const n of f.notices) items.push({ id: `R-notice-${n.type}`, text: `계산 안내: ${n.text}` });
  return items;
}

const DISCLAIMER = '이 리포트는 한국 표준시와 절기 경계를 기준으로 계산한 사주 원국을, 명리학의 전통적 상징에 따라 풀어 쓴 설명이에요. 성격이나 미래를 단정하지 않으며, 특정 시기·결과·수익을 보장하지 않아요. 대운 등 검증되지 않은 계산은 넣지 않았어요.';

export function generateReport(saju, { brand = '○○', clientLabel = '내담자' } = {}) {
  const f = collectFacts(saju);
  const temperament = sectionTemperament(f, saju);
  const explained = new Set(); // 이미 의미를 설명한 십성 그룹 — 뒤 섹션에서 다시 풀지 않는다
  const strength = sectionStrength(f, explained);
  const relation = sectionRelation(f, explained);
  const work = sectionWork(f);
  const practice = sectionPractice([temperament, strength, relation, work]);
  return {
    meta: { brand, clientLabel, hourKnown: f.hourKnown, generator: 'rule-template-v1', paidAiCalls: 0 },
    chart: saju.pillars,
    customer: [
      { title: '기본 성향', paras: temperament },
      { title: '강점', paras: strength },
      { title: '관계', paras: relation },
      { title: '일', paras: work },
      { title: '실천 제안', paras: practice },
    ],
    disclaimer: DISCLAIMER,
    review: reviewItems(f),
  };
}

export function toMarkdown(r, { withEvidence = true } = {}) {
  const p = r.chart;
  const cell = (k) => (p[k] ? reading(p[k].ganzhi) : '모름');
  const lines = [
    `# ${r.meta.brand} 사주 리포트 · ${r.meta.clientLabel}`,
    '',
    `| 년주 | 월주 | 일주 | 시주 |`, `|---|---|---|---|`,
    `| ${cell('year')} | ${cell('month')} | ${cell('day')} | ${cell('time')} |`, '',
  ];
  for (const s of r.customer) {
    lines.push(`## ${s.title}`, '');
    for (const x of s.paras) {
      lines.push(x.text);
      if (withEvidence) lines.push(`<sub>근거: ${x.evidence.join(' / ')}</sub>`);
      lines.push('');
    }
  }
  lines.push('---', r.disclaimer, '');
  return lines.join('\n');
}

export function reviewMarkdown(r) {
  return [`# 상담자 검토 항목 (고객에게 보내지 않음) · ${r.meta.clientLabel}`, '', ...r.review.map((i) => `- [ ] (${i.id}) ${i.text}`), ''].join('\n');
}
