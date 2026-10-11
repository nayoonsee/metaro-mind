// 종합 리포트 전체 생성 (규칙 기반, 유료 AI 호출 없음).
// 장: 읽는 법 · 1 기본 성향 · 2 강점과 반복되는 어려움 · 3 일과 적성 · 4 돈 관리 · 5 연애와 관계
//     · 6 가족과 대인관계 · 7 현재 고민 · 8 선택과 실천 · 부록 계산 기준
// 각 문단에는 재생성 후에도 편집본을 찾아 붙일 수 있도록 안정적인 id(장:규칙:종류)를 붙인다.
import { tenGod } from '../../api/_kst-solar-term-adapter.js';
import { chartKeys, chapter1, chapter8 } from './generate.mjs';
import { DAY_MASTER } from './library.mjs';
import { STRENGTH, POTENTIAL, WORK_COMBO } from './library2.mjs';
import { WORK_GROWTH, MONEY_SCENE, LOVE_EXPRESS, PEOPLE_SCENE, FAMILY_TALK, MONEY_PLAN } from './library4.mjs';
import { WORK, MONEY_SENSE, MONEY_TYPE, SPEND, LOVE2, FAMILY2, PEOPLE, WORK_EXTRA, EARN, LOVE_EXTRA, FAMILY_EXTRA, STRENGTH_SCENE, STRENGTH_FEEDBACK, MONEY_DECISION, LOVE_BALANCE, HELP, TYPE_TIP, FRICTION_SCENE, ELDER } from './library3.mjs';

const TG_GROUP = { 比肩: '비겁', 劫财: '비겁', 食神: '식상', 伤官: '식상', 偏财: '재성', 正财: '재성', 七杀: '관성', 正官: '관성', 偏印: '인성', 正印: '인성' };
const TG_KO = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인' };
const POS_KO = { year: '태어난 해(년주)', month: '태어난 달(월주)', day: '태어난 날(일주)', time: '태어난 시(시주)' };
export const SUPPORTED_TOPICS = ['일·진로 선택(회사·이직·독립·창업 등)', '돈 관리(저축·소비·지출 등)'];
export const EXCLUDED = [
  ['올해 흐름', '올해 간지와 일간의 관계를 리포트 문장으로 연결하는 규칙을 아직 검증하지 않았어요.'],
  ['대운(10년 단위 흐름)', '시작 나이 계산과 순서가 학파마다 달라 독립 자료로 검증하지 못했어요.'],
  ['특정 시기 예측', '어느 달·해에 무슨 일이 생긴다는 예측은 계산으로 확인할 수 없어요.'],
];

const P = (kind, text, rule, evidence) => ({ kind, text, rule, evidence });
const batchim = (w) => { const s = String(w).trim(); const c = s.charCodeAt(s.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
const iga = (w) => `${w}${batchim(w) ? '이' : '가'}`;

function stems(saju) {
  const dm = saju.dayMaster; const out = [];
  for (const k of ['year', 'month', 'time']) {
    const p = saju.pillars[k]; if (!p) continue;
    const g = p.ganzhi[0]; const tg = tenGod(dm, g); out.push({ pos: k, gan: g, tg, group: TG_GROUP[tg] });
  }
  return out;
}
function hidden(saju) {
  const dm = saju.dayMaster; const out = [];
  for (const k of ['year', 'month', 'day', 'time']) for (const g of saju.hideGan[k] || []) { const tg = tenGod(dm, g); out.push({ pos: k, gan: g, tg, group: TG_GROUP[tg] }); }
  return out;
}
const where = (list) => [...new Set(list.map((o) => `${POS_KO[o.pos]} ${o.gan}(${TG_KO[o.tg]})`))].join(', ');

function ch2(saju) {
  const sh = stems(saju); const hd = hidden(saju);
  const groups = [...new Set(sh.map((s) => s.group))];
  const hiddenOnly = [...new Set(hd.map((h) => h.group))].filter((g) => !groups.includes(g));
  const sections = [
    { q: '나의 강점은 어떤 상황에서 빛나나요?', paras: groups.flatMap((g) => [P('meaning', `${STRENGTH[g].name}: ${STRENGTH[g].strength}`, `STR-${g}`, `천간 ${where(sh.filter((s) => s.group === g))}`), P('example', STRENGTH_SCENE[g], `STR-${g}`, '생활 예시')]) },
    { q: '같은 어려움이 반복된다면 어디서 시작될까요?', paras: groups.flatMap((g) => [
      P('caution', STRENGTH[g].struggle, `STR-${g}`, `천간 ${where(sh.filter((s) => s.group === g))}`),
      P('example', `알아차리는 신호: ${STRENGTH[g].signal} ${STRENGTH_FEEDBACK[g].heard}`, `STR-${g}`, '생활 예시'),
      P('use', STRENGTH_FEEDBACK[g].recover, `STRREC-${g}`, `천간 ${g}`),
    ]) },
  ];
  if (hiddenOnly.length) sections.push({ q: '아직 덜 꺼낸 가능성은 무엇인가요?', paras: hiddenOnly.map((g) => P('meaning', POTENTIAL[g], `POT-${g}`, `지장간 ${where(hd.filter((h) => h.group === g))}`)) });
  sections.push({ q: '강점을 지키면서 어려움을 줄이려면', paras: groups.map((g) => P('use', STRENGTH[g].use, `STR-${g}`, `천간 ${g}`)) });
  return { id: 'ch2', title: '2장. 내가 잘하는 것과 자꾸 걸려 넘어지는 지점은?', intro: '1장에서 본 성향 가운데, 이 장에서는 겉으로 드러난 글자(천간)마다 어떤 힘이 되고, 지나칠 때 어떤 어려움으로 되풀이되는지를 살펴봐요.', sections };
}

function ch3(saju, k) {
  const sh = stems(saju); const W = WORK[k.shownGroup];
  const gs = new Set(sh.map((s) => s.group));
  const combos = Object.keys(WORK_COMBO).filter((c) => c.split('+').every((g) => gs.has(g)));
  const ev = `월간 ${k.monthStem} = ${TG_KO[k.shownTg]}`;
  const sections = [
    { q: '어떤 방식으로 일할 때 힘이 나나요?', paras: [
      P('meaning', W.how, `WORK-${k.shownGroup}`, ev),
      P('example', W.scene, `WORK-${k.shownGroup}`, ev),
      P('caution', `주의할 점: ${W.caution}`, `WORK-${k.shownGroup}`, ev),
      P('use', `활용 방법: ${W.use}`, `WORK-${k.shownGroup}`, ev),
    ] },
    { q: '어떤 역할에서 인정받기 쉽고, 일이 막힐 때는 어떻게 할까요?', paras: [
      P('meaning', W.role, `WORK-${k.shownGroup}`, ev),
      P('use', W.stuck, `WORK-${k.shownGroup}`, ev),
    ] },
    { q: '누구와, 어떤 환경에서 일할 때 지치지 않을까요?', paras: [
      P('meaning', WORK_EXTRA[k.shownGroup].team, `WORK-${k.shownGroup}`, ev),
      P('caution', WORK_EXTRA[k.shownGroup].tired, `WORK-${k.shownGroup}`, ev),
    ] },
    { q: '앞으로 일에서 무엇을 키워 가면 좋을까요?', paras: [
      P('meaning', WORK_GROWTH[k.shownGroup].meaning, `WGROW-${k.shownGroup}`, ev),
      P('use', WORK_GROWTH[k.shownGroup].use, `WGROW-${k.shownGroup}`, ev),
    ] },
    { q: '내 안의 힘들은 일에서 어떻게 이어지나요?', paras: combos.length
      ? combos.map((c) => P('meaning', WORK_COMBO[c], `COMBO-${c}`, `천간 ${where(sh.filter((s) => c.split('+').includes(s.group)))}`))
      : [P('meaning', '겉으로 드러난 글자(천간)끼리는 전통적으로 이름 붙는 일의 흐름(식상생재·관인상생 등)이 바로 보이지 않아요. 이 리포트는 천간의 조합만 살폈고, 안쪽 글자(지장간)까지 포함한 원국 전체의 조합은 판단하지 않았어요. 그래서 일의 방향은 위의 일하는 방식을 중심으로 보는 편이 안전해요.', 'COMBO-none', `천간 그룹 ${[...gs].join(', ')}`)] },
    { q: '어떤 직업이 맞나요?', paras: [
      P('meaning', '이 리포트는 사주로 특정 직업명을 정하지 않아요. 같은 직업 안에서도 일하는 방식은 다양하기 때문이에요. 대신 위에서 본 "힘이 나는 방식"과 "인정받기 쉬운 역할"을 기준으로 지금 하는 일이나 고려하는 일을 비교해 보세요.', 'WORK-job', '한계 안내'),
    ] },
  ];
  return { id: 'ch3', title: '3장. 어떤 일을 할 때 오래, 잘할 수 있나요?', intro: '이 장에서는 성격이 아니라 "일하는 방식", "인정받기 쉬운 역할", "막힐 때의 대처"를 일과 사회 활동을 상징하는 자리(월주)의 겉 글자로 봐요.', sections };
}

function ch4(saju, k) {
  const sh = stems(saju);
  const all = [...sh, ...hidden(saju)].filter((o) => o.group === '재성');
  const status = all.some((o) => sh.some((s) => s.gan === o.gan && s.pos === o.pos)) ? 'shown' : all.length ? 'hidden' : 'none';
  const S = MONEY_SENSE[status]; const types = [...new Set(all.map((o) => TG_KO[o.tg]))];
  const typeText = types.length === 2 ? MONEY_TYPE.both : types.length ? MONEY_TYPE[types[0]] : '';
  const ev = all.length ? where(all) : '재성 없음'; const sp = SPEND[k.shownGroup];
  return { id: 'ch4', title: '4장. 나는 돈을 어떻게 벌고, 쓰고, 지키나요?', intro: '이 장은 재물을 뜻하는 글자(재성)가 어디에 놓였는지, 그리고 사회 활동 자리의 겉 글자로 돈을 다루는 방식을 봐요. 금액이나 수익, 재산의 많고 적음은 사주로 알 수 없어서 다루지 않아요.',
    sections: [
      { q: '돈을 대하는 나의 기본 감각은 어떤가요?', paras: [
        P('meaning', `${S.meaning} ${typeText}`.trim(), `MONEY-${status}`, ev),
        P('example', S.scene, `MONEY-${status}`, ev),
        P('caution', `주의할 점: ${S.caution}`, `MONEY-${status}`, ev),
      ] },
      { q: '어떤 방식으로 돈을 벌 때 나에게 잘 맞을까요?', paras: [P('meaning', EARN[k.shownGroup], `EARN-${k.shownGroup}`, `월간 ${k.monthStem}`)] },
      { q: '돈이 새기 쉬운 지점은 어디일까요?', paras: [
        P('meaning', sp.leak, `SPEND-${k.shownGroup}`, `월간 ${k.monthStem}`),
        P('example', MONEY_SCENE[k.shownGroup], `MSCENE-${k.shownGroup}`, `월간 ${k.monthStem}`),
        P('use', `활용 방법: ${sp.fix}`, `SPEND-${k.shownGroup}`, `월간 ${k.monthStem}`),
      ] },
      { q: '큰돈을 결정할 때는 무엇을 확인할까요?', paras: [P('use', MONEY_DECISION[k.monthRel], `MDEC-${k.monthRel}`, `월지 ${k.monthZhi}와 일간의 관계`)] },
      { q: '관리 습관은 어떻게 만들면 좋을까요?', paras: [
        P('use', status === 'shown' ? '수입이 들어오는 날 고정 지출과 저축이 먼저 빠져나가게 순서를 정해 두세요. 움직이고 싶은 돈은 그다음에 남은 금액 안에서만 쓰면 돼요.'
          : status === 'hidden' ? '한 달에 한 번, 머릿속 계산을 종이나 표로 꺼내 실제 숫자와 맞춰 보세요. 속으로 하던 계산을 눈으로 확인하는 것만으로도 새는 곳이 보여요.'
          : '돈 관리는 성향에 맡기지 말고 자동이체 같은 장치에 맡기세요. 신경 쓰지 않아도 저축이 쌓이는 구조를 먼저 만들어 두는 것이 이 구성에 맞는 방법이에요.', `MONEY-${status}`, ev),
        P('use', TYPE_TIP[types.length === 2 ? 'both' : types.length ? types[0] : 'none'], `MTYPE-${types.length === 2 ? 'both' : types[0] || 'none'}`, ev),
      ] },
      { q: '사주와 별개로, 현실적으로 확인할 것', box: true, paras: ['한 달 수입과 고정 지출', '최근 석 달 동안 계획에 없던 지출의 합', '자동으로 빠져나가게 만들 수 있는 저축 금액'].map((r) => P('check', r, 'CH4-reality', '사주 해석 아님')) },
    ] };
}

function ch5(saju, k) {
  const root = (saju.hideGan.day || [])[0]; const tg = tenGod(saju.dayMaster, root); const g = TG_GROUP[tg]; const L = LOVE2[g];
  const ev = `일지 ${k.dayZhi} 속 중심 글자 ${root} = ${TG_KO[tg]}`;
  return { id: 'ch5', title: '5장. 나는 어떤 사랑을 하고, 어떤 관계를 원하나요?', intro: `가장 가까운 관계를 상징하는 자리(일지) 속 중심 글자 ${root}(${TG_KO[tg]})로 관계의 모습을 봐요. 상대방의 정보가 없어서 궁합, 상대의 마음, 결혼 시기는 다루지 않아요.`,
    sections: [
      { q: '가까운 관계에서 나는 어떤 모습인가요?', paras: [P('meaning', L.pattern, `LOVE-${g}`, ev), P('example', L.scene, `LOVE-${g}`, ev), P('meaning', L.want, `LOVE-${g}`, ev)] },
      { q: '관계를 시작할 때 나는 어떤가요?', paras: [P('meaning', LOVE_EXTRA[g].start, `LOVE-${g}`, ev)] },
      { q: '갈등은 어디서 생기고, 흔들릴 때 어떻게 회복할까요?', paras: [P('caution', L.friction, `LOVE-${g}`, ev), P('example', FRICTION_SCENE[g], `LOVE-${g}`, ev), P('use', LOVE_EXTRA[g].repair, `LOVE-${g}`, ev)] },
      { q: '마음은 어떻게 표현하고, 어디서 오해가 생길까요?', paras: [P('meaning', LOVE_EXPRESS[g].meaning, `LEXP-${g}`, ev), P('use', LOVE_EXPRESS[g].use, `LEXP-${g}`, ev)] },
      { q: '혼자 있는 시간과 함께하는 시간은 어떻게 나눌까요?', paras: [P('meaning', LOVE_BALANCE[k.dayRel], `LBAL-${k.dayRel}`, `일지 ${k.dayZhi}와 일간의 관계`)] },
      { q: '오래가는 관계를 위해 무엇을 할 수 있을까요?', paras: [P('use', L.check, `LOVE-${g}`, ev)] },
    ] };
}

function ch6(saju) {
  const y = stems(saju).find((s) => s.pos === 'year'); const F = FAMILY2[y.group];
  const yRoot = (saju.hideGan.year || [])[0]; const yTg = tenGod(saju.dayMaster, yRoot); const pg = TG_GROUP[yTg]; const PP = PEOPLE[pg];
  return { id: 'ch6', title: '6장. 가족과 사람들 사이에서 나는 어떤 자리에 있나요?', intro: '바깥 환경과 윗세대를 상징하는 자리(년주)로 가족과 대인관계의 배경을 봐요. 실제 가족 관계나 자라 온 경험은 알려 주신 정보가 아니라서, 아래 내용은 경험과 맞춰 보는 조건부 해석이에요.',
    sections: [
      { q: '가족과 자라 온 환경은 나에게 어떤 배경일까요?', paras: [P('meaning', F.symbol, `FAM-${y.group}`, `년간 ${y.gan} = ${TG_KO[y.tg]}`), P('example', F.ifThen, `FAM-${y.group}`, `년간 ${y.gan}`), P('use', `활용 방법: ${F.use}`, `FAM-${y.group}`, `년간 ${y.gan}`)] },
      { q: '가족과의 거리는 어떻게 조절하면 좋을까요?', paras: [P('example', FAMILY_TALK[y.group], `FTALK-${y.group}`, `년간 ${y.gan}`), P('use', FAMILY_EXTRA[y.group], `FAM-${y.group}`, `년간 ${y.gan}`)] },
      { q: '윗사람이나 어른과는 어떻게 지내면 좋을까요?', paras: [P('meaning', ELDER[y.group], `ELDER-${y.group}`, `년간 ${y.gan}`)] },
      { q: '사람들 사이에서 나는 어떤 역할을 맡기 쉬운가요?', paras: [P('meaning', `${PP.role} (년지 속 중심 글자 ${yRoot}, ${TG_KO[yTg]})`, `PEOPLE-${pg}`, `년지 본기 ${yRoot} = ${TG_KO[yTg]}`), P('example', PEOPLE_SCENE[pg].example, `PSCENE-${pg}`, `년지 본기 ${yRoot}`), P('caution', `주의할 점: ${PP.care}`, `PEOPLE-${pg}`, `년지 본기 ${yRoot}`), P('use', PEOPLE_SCENE[pg].use, `PSCENE-${pg}`, `년지 본기 ${yRoot}`)] },
      { q: '도움을 주고받는 방식은 어떤가요?', paras: [P('meaning', HELP[pg], `HELP-${pg}`, `년지 본기 ${yRoot}`)] },
    ] };
}

function ch8(chapters) {
  const find = (id) => chapters.find((c) => c.id === id);
  const items = [];
  const c2 = find('ch2'); const g2 = c2.sections[0].paras[0]; if (g2) items.push(P('use', `2장 — 강점 "${g2.text.split(':')[0]}"이 지나칠 때 나오는 신호를 한 주 동안 기록해 보세요.`, 'ACT-ch2', '2장 근거'));
  items.push(P('use', '3장 — 지금 하는 일을 "힘이 나는 환경"과 "빨리 지치는 환경" 기준으로 점수 매겨 보세요(각 1~5점).', 'ACT-ch3', '3장 근거'));
  items.push(P('use', '4장 — 현실 점검 세 항목을 이번 달 안에 숫자로 채우세요.', 'ACT-ch4', '4장 근거'));
  items.push(P('use', '5·6장 — 가까운 사람 한 명에게 이 리포트에서 공감한 문장 하나를 보여 주고 이야기를 나눠 보세요.', 'ACT-ch56', '5·6장 근거'));
  const c7 = find('ch7'); if (c7 && c7.status === 'generated') items.push(P('use', '7장 — 고민 집중 풀이의 점검 계획 첫 구간을 달력에 적어 두세요.', 'ACT-ch7', '7장 근거'));
  return { id: 'ch8', title: '8장. 지금부터 무엇을 할까요?', intro: '앞의 장에서 나온 활용 방법을 실행 순서로 묶었어요. 한꺼번에 하기보다 하나씩 해 보세요.', sections: [{ q: '이 리포트에서 가져갈 실천 목록', paras: items }] };
}

// 알려 주신 상황·선택지를 실제 점검 항목으로 연결한다(사주로 알아맞힌 것처럼 쓰지 않는다).
const KEEP_RE = /계속|유지|다니|병행|남는|머무/; const CHANGE_RE = /퇴사|독립|이직|창업|그만|옮기|시작/;
function linkedChecks(concern, topic) {
  const out = []; const sit = (concern?.situation || '').trim(); const opts = (concern?.options || []).filter(Boolean);
  const qs = (s) => `"${s.length > 40 ? s.slice(0, 40) + '…' : s}"`;
  if (topic === 'work') {
    for (const o of opts) {
      if (KEEP_RE.test(o) && !CHANGE_RE.test(o)) out.push(P('check', `${qs(o)}을(를) 고른다면: 지금 자리에서 따로 쓸 수 있는 주당 시간, 그리고 정한 기간 뒤에 기대하는 결과물을 적어 보세요.`, 'LINK-opt-keep', '알려 주신 선택지'));
      else if (CHANGE_RE.test(o)) out.push(P('check', `${qs(o)}을(를) 고른다면: 첫 3개월 생활비, 첫 수입이 들어오기까지 걸릴 것 같은 기간, 지금 확보된 의뢰나 고객이 있는지를 적어 보세요.`, 'LINK-opt-change', '알려 주신 선택지'));
    }
    if (/부업|개인 작업|사이드|퇴근 후/.test(sit)) out.push(P('check', '알려 주신 상황에 회사 밖 작업이 있으니, 그 작업이 매달 만드는 시간과 수입을 가장 먼저 숫자로 적어 보세요.', 'LINK-sit-side', '알려 주신 상황'));
    const yr = /(\d+)\s*년\s*차/.exec(sit);
    if (yr) out.push(P('check', `알려 주신 ${yr[1]}년 차 경력 가운데, 선택 후에도 가져갈 수 있는 것(포트폴리오, 거래처, 추천해 줄 사람)을 따로 적어 보세요.`, 'LINK-sit-years', '알려 주신 상황'));
  } else if (topic === 'money') {
    if (/고정 지출|정리/.test(sit)) out.push(P('check', '알려 주신 상황에 고정 지출 정리가 들어 있으니, 첫 주에는 자동으로 빠져나가는 돈의 목록부터 만들어 보세요.', 'LINK-sit-fixed', '알려 주신 상황'));
    if (/월급|직장/.test(sit + concern.question)) out.push(P('check', '월급날을 기준으로 저축이 먼저 빠져나가게 순서를 바꾸는 것이 첫 실행 항목이에요.', 'LINK-sit-salary', '알려 주신 상황'));
  }
  return out.length ? [{ q: '알려 주신 상황과 선택지에 맞춘 점검', box: true, paras: out }] : [];
}

function guide(saju) {
  return { id: 'guide', title: '이 리포트를 읽는 법', intro: '', sections: [{ q: '이 리포트가 말해 주는 것과 말하지 않는 것', paras: [
    P('meaning', '이 리포트는 태어난 날짜로 계산한 사주의 글자를, 오래 이어져 온 상징에 따라 생활 언어로 풀어 쓴 것이에요. 성격 검사나 미래 예측이 아니에요.', 'GUIDE', '고정 안내'),
    P('meaning', "'예를 들면'으로 시작하는 문단은 이렇게 나타날 수 있다는 가능성의 예시예요. 당신의 과거를 알아맞힌 것이 아니에요.", 'GUIDE', '고정 안내'),
    P('meaning', '건강, 재산, 결혼, 합격 같은 결과나 특정 시기를 확정하지 않아요.', 'GUIDE', '고정 안내'),
    P('meaning', `이번 리포트에서 다루지 않은 것: ${EXCLUDED.map(([a, b]) => `${a}(${b})`).join(' ')}`, 'GUIDE-excluded', '고정 안내'),
    ...(saju.hourKnown ? [] : [P('meaning', '태어난 시간을 몰라서 시간에 해당하는 글자(시주)는 빼고, 해·달·날의 글자만으로 읽었어요.', 'GUIDE-hour', '시간 모름')]),
  ] }] };
}

function basis(saju) {
  const items = [
    '한국 표준시(KST) 기준으로 계산하고 절기 경계를 보정했어요. 1948~61년·1987~88년 서머타임과 1954~61년 UTC+8:30 시기 출생은 오늘날 한국 표준시로 바꿔 계산했어요.',
    saju.hourKnown ? '출생 시간: 입력된 시각으로 시주를 계산했어요.' : '출생 시간: 모름. 시주를 만들지 않고 년·월·일주 세 기둥만 사용했어요.',
    '밤 11시대(23:00~23:59) 출생: 현재 프로그램은 일주는 그날로, 시주의 천간은 다음날 일간 기준으로 계산해요. 이 처리는 학파마다 다르고 상품의 확정 기준은 아직 정하지 않았어요.',
    ...(saju.notices || []).filter((n) => n.type !== 'jasi').map((n) => n.text.replace(/했어\.$/, '했어요.').replace(/있어\.$/, '있어요.').replace(/넣어줘\.$/, '넣어 주세요.').replace(/확인해 줘\.$/, '확인해 주세요.').replace(/출생이야\./, '출생이에요.')),
  ];
  return { id: 'basis', title: '부록. 명식과 계산 기준', intro: '', sections: [{ q: '계산 기준', paras: items.map((t, i) => P('meaning', t, `BASIS-${i}`, '계산 기준')) }] };
}

export function generateFullReport(saju, { concern = null } = {}) {
  const k = chartKeys(saju); const review = [];
  if (!saju.hourKnown) review.push({ type: 'hour', text: '출생 시간 모름: 시주 없이 생성했어요.' });
  for (const n of saju.notices || []) review.push({ type: n.type === 'jasi' ? 'jasi' : 'notice', text: n.type === 'jasi' ? '밤 11시대 출생: 시주 천간 처리 기준이 미확정이에요. 검토 대상이에요.' : `계산 안내: ${n.text}` });
  review.push({ type: 'library', text: '문단 라이브러리 v0은 명리 전문가 검수 전이에요. 해석 문장을 검토한 뒤 사용하세요.' });
  const reviewStrings = [];
  const c1 = chapter1(saju, k);
  c1.intro = c1.intro.replace(/ '예를 들면'[^.]*\.\s?/, ' ').replace(/ ?태어난 시간을 몰라서[^.]*\./, '').trim();
  const c7 = chapter8(saju, k, concern, reviewStrings);
  c7.id = 'ch7'; c7.title = '7장. 지금 내 고민, 어떻게 볼까요?';
  if (c7.topic === 'money') c7.sections = c7.sections.filter((s) => !s.box).concat([{ q: '앞으로 석 달, 어떻게 시작할까요?', paras: [P('use', MONEY_PLAN[k.shownGroup], `MPLAN-${k.shownGroup}`, `월간 ${k.monthStem}`)] }, { q: '현실 점검', paras: [P('use', '돈 관리의 현실 점검 항목은 4장 마지막에 정리해 두었어요. 그 항목부터 숫자로 채워 보세요.', 'CH7-money-ref', '4장 참조')] }]);
  if (c7.status === 'generated') c7.sections.push(...linkedChecks(concern, c7.topic));
  if (c7.status !== 'generated') {
    // 자동 풀이를 하지 못한 경우: 판매자가 직접 쓸 수 있는 빈 칸. 비어 있으면 고객 본문에 나오지 않는다.
    c7.sections = [{ q: c7.status === 'review' ? '직접 작성한 풀이' : '추가로 적을 내용', manual: true, paras: [P('meaning', '', 'MANUAL', '판매자 직접 작성')] }];
  }
  for (const r of reviewStrings) review.push({ type: r.startsWith('검토 필요') ? 'needs-writing' : r.startsWith('고민 미입력') ? 'no-concern' : 'note', text: r });
  const chapters = [guide(saju), c1, ch2(saju), ch3(saju, k), ch4(saju, k), ch5(saju, k), ch6(saju), c7];
  chapters.push(ch8(chapters));
  chapters.push(basis(saju));
  // 안정 id 부여
  for (const ch of chapters) {
    const seen = {};
    ch.sections.forEach((s) => s.paras.forEach((p) => { const base = `${ch.id}:${p.rule}:${p.kind}`; seen[base] = (seen[base] || 0) + 1; p.id = `${base}:${seen[base]}`; }));
  }
  return { generator: 'full-rule-v0', paidAiCalls: 0, keys: k, cover: { title: DAY_MASTER[k.dm].cover, subtitle: '성향 · 일 · 돈 · 관계 · 선택을 담은 종합 사주 리포트' },
    chapters, review, needsWriting: c7.status === 'review' };
}
