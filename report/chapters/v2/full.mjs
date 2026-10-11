// 고정본: 커밋 319c92f의 생성기(full-rule-v2)를 그대로 복사했다. 그 버전으로 만든 프로젝트를 같은 본문으로 검증·출력하기 위해서만 쓴다. 고치지 말 것.
// 종합 리포트 전체 생성 (규칙 기반, 유료 AI 호출 없음).
// 장: 읽는 법 · 1 기본 성향 · 2 강점과 반복되는 어려움 · 3 일과 적성 · 4 돈 관리 · 5 연애와 관계
//     · 6 가족과 대인관계 · 7 현재 고민 · 8 선택과 실천 · 부록 계산 기준
// 각 문단에는 재생성 후에도 편집본을 찾아 붙일 수 있도록 안정적인 id(장:규칙:종류)를 붙인다.
import { tenGod } from '../../../api/_kst-solar-term-adapter.js';
import { chartKeys, chapter1, chapter8, classifyWorkOption, STATUS_KO } from './generate.mjs';
import { DAY_MASTER, SHOWN_GROUP, MONTH_RELATION } from './library.mjs';
import { AUTH, COLLAB, ENV, ENV_LABEL, EARN_OUT, LEAK, MONEY_FOCUS } from './library5.mjs';
import { STRENGTH, POTENTIAL, WORK_COMBO } from './library2.mjs';
import { LOVE_EXPRESS, PEOPLE_SCENE, FAMILY_TALK } from './library4.mjs';
import { WORK, MONEY_SENSE, MONEY_TYPE, LOVE2, FAMILY2, PEOPLE, LOVE_EXTRA, FAMILY_EXTRA, STRENGTH_SCENE, STRENGTH_FEEDBACK, MONEY_DECISION, LOVE_BALANCE, HELP, TYPE_TIP, FRICTION_SCENE, ELDER } from './library3.mjs';

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

// 십성 묶음의 위치를 사람이 다시 확인할 수 있는 문장으로 (예: "태어난 해(년주) 癸(편관)")
const whereGroup = (saju, g) => { const l = [...stems(saju), ...hidden(saju)].filter((o) => o.group === g); return l.length ? where(l) : '천간·지장간에 없음'; };
const TRAD_COMBO = ['식상+재성', '관성+인성', '재성+관성']; // 전통적으로 이름이 붙은 흐름만 쓴다(식상생재·관인상생·재생관)

function ch3(saju, k) {
  const sh = stems(saju); const W = WORK[k.shownGroup];
  const gs = new Set(sh.map((s) => s.group));
  const combos = TRAD_COMBO.filter((c) => c.split('+').every((g) => gs.has(g)));
  const ev = `월간 ${k.monthStem} = ${TG_KO[k.shownTg]}`;
  const A = AUTH[k.status['관성']]; const C = COLLAB[k.status['비겁']]; const E = ENV[k.monthRel];
  const evA = `관성 위치: ${whereGroup(saju, '관성')}`; const evC = `비겁 위치: ${whereGroup(saju, '비겁')}`; const evE = `월지 ${k.monthZhi}와 일간 ${k.dm}의 관계`;
  const sections = [
    { q: '어떤 역할을 맡을 때 힘이 나나요?', paras: [P('meaning', W.role, `WROLE-${k.shownGroup}`, ev), P('use', W.stuck, `WSTUCK-${k.shownGroup}`, ev)] },
    { q: '권한과 규칙은 나에게 어떻게 작용하나요?', paras: [P('meaning', A.meaning, `AUTH-${k.status['관성']}`, evA), P('example', A.scene, `AUTH-${k.status['관성']}`, evA), P('caution', A.caution, `AUTH-${k.status['관성']}`, evA), P('use', A.use, `AUTH-${k.status['관성']}`, evA)] },
    { q: '혼자 하는 일과 함께 하는 일, 어느 쪽이 편한가요?', paras: [P('meaning', C.meaning, `COLLAB-${k.status['비겁']}`, evC), P('example', C.scene, `COLLAB-${k.status['비겁']}`, evC), P('caution', C.caution, `COLLAB-${k.status['비겁']}`, evC), P('use', C.use, `COLLAB-${k.status['비겁']}`, evC)] },
    { q: '어떤 환경에서 오래 버틸 수 있나요?', paras: [P('meaning', E.meaning, `ENV-${k.monthRel}`, evE), P('example', E.scene, `ENV-${k.monthRel}`, evE), P('caution', E.caution, `ENV-${k.monthRel}`, evE), P('use', E.use, `ENV-${k.monthRel}`, evE)] },
  ];
  if (combos.length) sections.push({ q: '전통적으로 이름 붙은 일의 흐름이 있나요?', paras: combos.map((c) => P('meaning', WORK_COMBO[c], `COMBO-${c}`, `천간 ${where(sh.filter((s) => c.split('+').includes(s.group)))}`)) });
  sections.push({ q: '어떤 직업이 맞나요?', paras: [
    P('meaning', '이 리포트는 사주로 특정 직업명을 정하지 않아요. 같은 직업 안에서도 역할·권한·환경은 크게 다르기 때문이에요. 지금 하는 일이나 고려하는 일을 위의 세 기준(맡는 역할, 권한과 규칙, 일하는 환경)으로 하나씩 견줘 보세요.', 'WORK-job', '한계 안내'),
  ] });
  return { id: 'ch3', title: '3장. 어떤 일을 할 때 오래, 잘할 수 있나요?', intro: '이 장은 일을 세 갈래로 나눠 봐요. 맡는 역할은 태어난 달의 겉 글자(월간)로, 권한과 규칙은 관성의 위치로, 혼자와 함께는 비겁의 위치로, 오래 버틸 환경은 태어난 달과 나의 관계로 읽어요. 각 절 끝의 근거는 다시 계산해 확인할 수 있어요.', sections };
}

function ch4(saju, k) {
  const sh = stems(saju);
  const all = [...sh, ...hidden(saju)].filter((o) => o.group === '재성');
  const status = all.some((o) => sh.some((s) => s.gan === o.gan && s.pos === o.pos)) ? 'shown' : all.length ? 'hidden' : 'none';
  const S = MONEY_SENSE[status]; const types = [...new Set(all.map((o) => TG_KO[o.tg]))];
  const typeText = types.length === 2 ? MONEY_TYPE.both : types.length ? MONEY_TYPE[types[0]] : '';
  const ev = all.length ? where(all) : '재성 없음';
  const O = EARN_OUT[k.status['식상']]; const L = LEAK[k.status['비겁']];
  const evO = `식상 위치: ${whereGroup(saju, '식상')}`; const evL = `비겁 위치: ${whereGroup(saju, '비겁')}`;
  return { id: 'ch4', title: '4장. 나는 돈을 어떻게 벌고, 쓰고, 지키나요?', intro: '이 장은 돈을 세 가지로 나눠 봐요. 일한 대가를 받는 방식은 만들어 내는 힘(식상)의 위치로, 돈을 대하는 감각은 재물 글자(재성)의 위치로, 새기 쉬운 지점은 나와 같은 기운(비겁)의 위치로 읽어요. 금액이나 재산의 많고 적음은 사주로 알 수 없어서 다루지 않아요.',
    sections: [
      { q: '일한 대가는 어떤 방식으로 받을 때 납득이 되나요?', paras: [P('meaning', O.meaning, `EARNOUT-${k.status['식상']}`, evO), P('caution', O.caution, `EARNOUT-${k.status['식상']}`, evO), P('use', O.use, `EARNOUT-${k.status['식상']}`, evO)] },
      { q: '들어온 돈을 대하는 나의 기본 감각은 어떤가요?', paras: [
        P('meaning', `${S.meaning} ${typeText}`.trim(), `MONEY-${status}`, ev),
        P('example', S.scene, `MONEY-${status}`, ev),
        P('caution', `주의할 점: ${S.caution}`, `MONEY-${status}`, ev),
      ] },
      { q: '돈이 새기 쉬운 지점은 어디일까요?', paras: [P('meaning', L.meaning, `LEAK-${k.status['비겁']}`, evL), P('example', L.scene, `LEAK-${k.status['비겁']}`, evL), P('use', L.use, `LEAK-${k.status['비겁']}`, evL)] },
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

// 핵심 요약: 장 내용을 줄여 개인별 핵심 세 가지만 보여 주고, 해당 장으로 안내한다.
const AUTH_SHORT = { shown: '기준과 책임이 분명할 때 편한 쪽', hidden: '책임이 주어지면 그때 기준을 세우는 쪽', none: '스스로 납득한 기준으로 움직이는 쪽' };
function keyChapter(saju, k, c7, concern) {
  const D = DAY_MASTER[k.dm]; const S = SHOWN_GROUP[k.shownGroup]; const M = MONTH_RELATION[k.monthRel];
  const q = (concern?.question || '').trim(); const qs = q.length > 30 ? `${q.slice(0, 30)}…` : q;
  const third = c7.status === 'generated'
    ? (c7.topic === 'work' ? `7장 · 적어 주신 고민("${qs}")을 선택지별로 나눠, 무엇이 다르고 무엇부터 확인할지 정리했어요.` : `7장 · 적어 주신 고민("${qs}")을 4장의 계산 요소에 맞춰 첫 석 달의 순서로 정리했어요.`)
    : c7.status === 'review' ? `7장 · 적어 주신 질문("${qs}")에 대한 풀이는 상담 내용을 바탕으로 직접 정리했어요.`
      : `4장 · 돈은 "${MONEY_FOCUS[k.status['비겁']]}"부터 살펴보면 좋아요. 이번에는 고민을 적지 않아 7장은 비워 두었어요.`;
  return { id: 'key', title: '한눈에 보는 핵심', intro: '', sections: [{ q: '이 리포트의 핵심 세 가지', paras: [
    P('meaning', `1장 · ${D.image}에 비유되는 ${D.name}의 사람이에요. 겉으로는 ${iga(S.label)} 먼저 보이고, 힘은 '${M.label}'에서 얻는 쪽이에요.`, 'KEY-1', `일간 ${k.dm}, 월간 ${k.monthStem}, 월지 ${k.monthZhi}`),
    P('meaning', `3장 · 일에서는 "${ENV_LABEL[k.monthRel]}"에서 오래 버티는 쪽이고, 권한과 규칙 앞에서는 ${AUTH_SHORT[k.status['관성']]}이에요.`, 'KEY-2', `월지 관계, 관성 위치(${STATUS_KO[k.status['관성']]})`),
    P('meaning', third, 'KEY-3', c7.status === 'generated' || c7.status === 'review' ? '알려 주신 고민' : `비겁 위치(${STATUS_KO[k.status['비겁']]})`),
  ] }] };
}

// 마지막 장: 실제 장·절로 돌아가는 안내 + 이번 달 해 볼 세 가지
function ch8(chapters) {
  const find = (id) => chapters.find((c) => c.id === id);
  const secQ = (id, re) => { const c = find(id); const s = c && c.sections.find((x) => re.test(x.q)); return s ? s.q : null; };
  const nav = [
    ['강점이 지나쳐 같은 일로 지칠 때', 'ch2', /반복/],
    ['일이 답답한데 이유를 모르겠을 때', 'ch3', /권한/],
    ['일을 옮길지, 어떤 곳으로 갈지 볼 때', 'ch3', /환경/],
    ['돈이 어디로 새는지 모를 때', 'ch4', /새기/],
    ['가까운 사람과 같은 문제로 자꾸 부딪힐 때', 'ch5', /갈등/],
    ['가족에게 부탁하거나 거리를 정해야 할 때', 'ch6', /거리/],
  ].map(([when, id, re]) => { const q = secQ(id, re); return q ? P('use', `${when}: ${find(id).title.split('.')[0]} "${q}"`, `NAV-${id}-${re.source}`, '이 리포트의 장 안내') : null; }).filter(Boolean);
  const c7 = find('ch7'); if (c7 && c7.status === 'generated') nav.push(P('use', `고민한 선택을 다시 정해야 할 때: 7장 "${c7.sections[c7.sections.length > 1 ? 1 : 0].q}"부터`, 'NAV-ch7', '이 리포트의 장 안내'));
  const items = [];
  const c2 = find('ch2'); const g2 = c2.sections[0].paras[0]; if (g2) items.push(P('use', `2장: 강점 "${g2.text.split(':')[0]}"이 지나칠 때 나오는 신호를 한 주 동안 기록해 보세요.`, 'ACT-ch2', '2장 근거'));
  items.push(P('use', '3장: 지금 하는 일을 "오래 버틸 수 있는 환경" 기준으로 1~5점 매겨 보세요.', 'ACT-ch3', '3장 근거'));
  if (c7 && c7.status === 'generated') items.push(P('use', '7장: 현실 점검 항목 가운데 하나를 골라 이번 주 안에 숫자로 채우세요.', 'ACT-ch7', '7장 근거'));
  else items.push(P('use', '4장: "돈이 새기 쉬운 지점"의 활용 방법을 한 달 동안 해 보세요.', 'ACT-ch4', '4장 근거'));
  return { id: 'ch8', title: '8장. 이럴 때 다시 펼쳐 보세요', intro: '이 리포트는 한 번 읽고 끝내기보다, 상황이 생겼을 때 해당하는 곳을 다시 펼쳐 보도록 만들었어요.', sections: [{ q: '이럴 때는 이곳을', paras: nav }, { q: '이번 달 해 볼 세 가지', paras: items }] };
}

// 알려 주신 상황·선택지를 실제 점검 항목으로 연결한다(사주로 알아맞힌 것처럼 쓰지 않는다).
const KEEP_RE = /계속|유지|다니|병행|남는|머무/; const CHANGE_RE = /퇴사|독립|이직|창업|그만|옮기|시작/;
function linkedChecks(concern, topic) {
  const out = []; const sit = (concern?.situation || '').trim(); const opts = (concern?.options || []).filter(Boolean);
  const qs = (s) => `"${s.length > 40 ? s.slice(0, 40) + '…' : s}"`;
  if (topic === 'work') {
    // 입력한 사실에 따른 조건부 판단(사주 해석 아님). 선택지 종류별 일반 점검은 위의 현실 점검 상자에 있다.
    const kinds = opts.map((o) => [o, classifyWorkOption(o)]);
    const has = (kd) => kinds.filter(([, x]) => x === kd).map(([o]) => o);
    const side = /부업|개인 작업|사이드|퇴근 후/.test(sit); const dur = /(\d+)\s*(년|개월)\s*째/.exec(sit);
    const solo = [...has('freelance'), ...has('startup')];
    if (side && solo.length) out.push(P('check', `알려 주신 상황에 회사 밖 작업이 있어요${dur ? `(${dur[1]}${dur[2]}째)` : ''}. 지난 3개월 그 작업으로 실제 들어온 수입이나 문의가 있었다면, 그 숫자가 ${qs(solo[0])} 쪽을 판단하는 첫 기준이에요. 아직 없다면 퇴사 전에 병행하면서 첫 의뢰를 받아 보는 순서가 위험이 작아요.`, 'LINK-side-solo', '알려 주신 상황·선택지'));
    if (side && has('stay-prep').length) out.push(P('check', `${qs(has('stay-prep')[0])} 쪽을 이어 간다면, 회사 밖 작업의 다음 단계(공개, 첫 판매, 지원 등)를 날짜로 정해 두세요. 날짜가 없으면 병행이 준비로만 길어지기 쉬워요.`, 'LINK-side-prep', '알려 주신 상황·선택지'));
    if (has('move').length) out.push(P('check', `${qs(has('move')[0])} 쪽을 본다면, 지금 회사를 떠나고 싶은 이유를 세 가지 적고, 지원할 곳에서 그 이유가 실제로 달라지는지 하나씩 표시해 보세요.`, 'LINK-move', '알려 주신 선택지'));
    if ((has('quit-seek').length || solo.length) && concern.period) out.push(P('check', `정해 주신 기간(${concern.period}) 안에 회사를 나오는 선택을 생각한다면, 그때까지 모을 수 있는 생활비가 몇 개월 치인지 먼저 계산해 보세요.`, 'LINK-period-quit', '알려 주신 기간'));
    const yr = /(\d+)\s*년\s*차/.exec(sit);
    if (yr) out.push(P('check', `알려 주신 ${yr[1]}년 차 경력 가운데, 어느 쪽을 골라도 가져갈 수 있는 것(포트폴리오, 거래처, 추천해 줄 사람)을 따로 적어 보세요.`, 'LINK-sit-years', '알려 주신 상황'));
  } else if (topic === 'money') {
    if (/고정 지출|정리/.test(sit)) out.push(P('check', '알려 주신 상황에 고정 지출 정리가 들어 있으니, 첫 주에는 자동으로 빠져나가는 돈의 목록부터 만들어 보세요.', 'LINK-sit-fixed', '알려 주신 상황'));
    if (/월급|직장/.test(sit + concern.question)) out.push(P('check', '월급날을 기준으로 저축이 먼저 빠져나가게 순서를 바꾸는 것이 첫 실행 항목이에요.', 'LINK-sit-salary', '알려 주신 상황'));
  }
  return out.length ? [{ q: '알려 주신 사실에 따라 달라지는 판단', box: true, paras: out }] : [];
}

function guide(saju) {
  return { id: 'guide', title: '이 리포트를 읽는 법', intro: '', sections: [{ q: '이 리포트가 말해 주는 것과 말하지 않는 것', paras: [
    P('meaning', '이 리포트는 태어난 날짜로 계산한 사주의 글자를, 오래 이어져 온 상징에 따라 생활 언어로 풀어 쓴 것이에요. 성격 검사나 미래 예측이 아니에요.', 'GUIDE', '고정 안내'),
    P('meaning', "'예를 들면'으로 시작하는 문단은 이렇게 나타날 수 있다는 가능성의 예시예요. 당신의 과거를 알아맞힌 것이 아니에요.", 'GUIDE', '고정 안내'),
    P('meaning', '건강, 재산, 결혼, 합격 같은 결과나 특정 시기를 확정하지 않아요.', 'GUIDE', '고정 안내'),
    P('meaning', '각 절 끝의 "근거"는 누구나 다시 계산해 확인할 수 있는 사실이에요(부록에 모아 두었어요). 본문 풀이는 그 글자에 대한 전통적인 상징 해석을 생활 언어로 옮긴 것이고, 명리 전문가의 검수를 아직 거치지 않은 초안이에요.', 'GUIDE-basis', '고정 안내'),
    P('meaning', `이번 리포트에서 다루지 않은 것: ${EXCLUDED.map(([a, b]) => `${a}(${b})`).join(' ')}`, 'GUIDE-excluded', '고정 안내'),
    ...(saju.hourKnown ? [] : [P('meaning', '태어난 시간을 몰라서 시간에 해당하는 글자(시주)는 빼고, 해·달·날의 글자만으로 읽었어요.', 'GUIDE-hour', '시간 모름')]),
  ] }] };
}

function basis(saju, k) {
  const items = [
    '한국 표준시(KST) 기준으로 계산하고 절기 경계를 보정했어요. 1948~61년·1987~88년 서머타임과 1954~61년 UTC+8:30 시기 출생은 오늘날 한국 표준시로 바꿔 계산했어요.',
    saju.hourKnown ? '출생 시간: 입력된 시각으로 시주를 계산했어요.' : '출생 시간: 모름. 시주를 만들지 않고 년·월·일주 세 기둥만 사용했어요.',
    ...((saju.notices || []).some((n) => n.type === 'jasi') ? ['밤 11시대(23:00~23:59) 출생: 현재 프로그램은 일주는 그날로, 시주의 천간은 다음날 일간 기준으로 계산해요. 이 처리는 학파마다 다르고 상품의 확정 기준은 아직 정하지 않았어요.'] : []),
    ...(saju.notices || []).filter((n) => n.type !== 'jasi').map((n) => n.text.replace(/했어\.$/, '했어요.').replace(/있어\.$/, '있어요.').replace(/넣어줘\.$/, '넣어 주세요.').replace(/확인해 줘\.$/, '확인해 주세요.').replace(/출생이야\./, '출생이에요.')),
  ];
  const dayRoot = (saju.hideGan.day || [])[0];
  const used = [
    `일간(나를 대표하는 글자): ${k.dm} · 월간: ${k.monthStem} = ${TG_KO[k.shownTg]} · 월지: ${k.monthZhi}, 일간과의 관계 = ${MONTH_RELATION[k.monthRel].label}`,
    `일지 속 중심 글자: ${dayRoot} = ${TG_KO[tenGod(saju.dayMaster, dayRoot)]}`,
    ...['비겁', '식상', '재성', '관성', '인성'].map((g) => `${g} 위치: ${whereGroup(saju, g)}`),
  ];
  return { id: 'basis', title: '부록. 명식과 계산 기준', intro: '', sections: [
    { q: '이 리포트가 쓴 계산 요소', paras: used.map((t, i) => P('meaning', t, `USED-${i}`, '계산 결과')) },
    { q: '계산 기준', paras: items.map((t, i) => P('meaning', t, `BASIS-${i}`, '계산 기준')) },
  ] };
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
  if (c7.status === 'generated') c7.sections.push(...linkedChecks(concern, c7.topic));
  if (c7.status !== 'generated') {
    // 자동 풀이를 하지 못한 경우: 판매자가 직접 쓸 수 있는 빈 칸. 비어 있으면 고객 본문에 나오지 않는다.
    c7.sections = [{ q: c7.status === 'review' ? '직접 작성한 풀이' : '추가로 적을 내용', manual: true, paras: [P('meaning', '', 'MANUAL', '판매자 직접 작성')] }];
  }
  for (const r of reviewStrings) review.push({ type: r.startsWith('검토 필요') ? 'needs-writing' : r.startsWith('고민 미입력') ? 'no-concern' : 'note', text: r });
  const chapters = [keyChapter(saju, k, c7, concern), guide(saju), c1, ch2(saju), ch3(saju, k), ch4(saju, k), ch5(saju, k), ch6(saju), c7];
  chapters.push(ch8(chapters));
  chapters.push(basis(saju, k));
  // 안정 id 부여
  for (const ch of chapters) {
    const seen = {};
    ch.sections.forEach((s) => s.paras.forEach((p) => { const base = `${ch.id}:${p.rule}:${p.kind}`; seen[base] = (seen[base] || 0) + 1; p.id = `${base}:${seen[base]}`; }));
  }
  return { generator: 'full-rule-v2', paidAiCalls: 0, keys: k, cover: { title: DAY_MASTER[k.dm].cover, subtitle: '성향 · 일 · 돈 · 관계 · 선택을 담은 종합 사주 리포트' },
    chapters, review, needsWriting: c7.status === 'review' };
}
