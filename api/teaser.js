import { calcSaju, callClaude } from './_saju-core.js';

// Server-computed "today" in Asia/Seoul — never the browser's clock, never guessed
// by the model. Accepts an optional reference Date so this is unit-testable without
// touching the system clock; production calls it with no argument (real now).
export function getSeoulDateInfo(referenceDate) {
  const now = referenceDate || new Date();
  // en-CA formats as YYYY-MM-DD, which IS the ISO date we want for the given zone.
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
  const [yearStr, monthStr] = currentDate.split('-');
  const currentYear = Number(yearStr);
  const currentMonth = Number(monthStr);
  const remainingMonthsInYear = 12 - currentMonth + 1;
  const remainingMonthNames = [];
  for (let m = currentMonth; m <= 12; m++) remainingMonthNames.push(`${m}월`);
  return { currentDate, currentYear, currentMonth, remainingMonthsInYear, remainingMonthNames };
}

// A single, grammatically-correct Korean phrase for "the remaining period this year",
// derived purely from dateInfo (never a hardcoded month) — handed to the model so it
// copies this instead of freehanding an awkward combination like "올해 남은 9월부터".
export function remainingPeriodPhrase(dateInfo) {
  const { currentMonth, remainingMonthsInYear, remainingMonthNames } = dateInfo;
  if (currentMonth === 12) return '올해 마지막 한 달 동안';
  if (currentMonth === 1) return '올해 전체 기간 동안';
  const first = remainingMonthNames[0];
  const last = remainingMonthNames[remainingMonthNames.length - 1];
  if (remainingMonthsInYear === 2) return `올해 남은 두 달인 ${first}부터 ${last}까지`;
  return `올해 남은 기간인 ${first}부터 ${last}까지`;
}

// Pull the JSON payload out of a model response that may be a bare JSON string,
// wrapped in a ```json fence, wrapped in a plain ``` fence, or (defensively) an
// object the caller already parsed for us.
function extractJsonText(rawText) {
  if (rawText == null) return '';
  let text = String(rawText).trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  return text;
}

// Normalizes whatever the model returned into the strict shape the frontend relies
// on: { opening: string, sections: Array<{ title: string, body: string, evidence?: string }> }.
// Throws on anything that doesn't reduce to usable content — callers must treat
// that as a request failure, never surface the raw text to the user.
function normalizeTeaser(rawText) {
  const parsed = rawText && typeof rawText === 'object' ? rawText : JSON.parse(extractJsonText(rawText));
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid teaser response shape');

  const opening = typeof parsed.opening === 'string' ? parsed.opening.trim() : '';
  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = sectionsRaw
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      title: typeof s.title === 'string' ? s.title.trim() : '',
      body: typeof s.body === 'string' ? s.body.trim() : '',
      evidence: typeof s.evidence === 'string' ? s.evidence.trim() : '',
    }))
    .filter((s) => s.body);

  if (!opening && sections.length === 0) throw new Error('Empty teaser content');
  return { opening, sections };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      year, month, day, hour, minute, gender, calendar, name,
      relationshipStatus, jobStatus, topic, question,
    } = req.body;

    if (!year || !month || !day) {
      return res.status(400).json({ error: 'year, month, day는 필수입니다.' });
    }

    const saju = await calcSaju({ year, month, day, hour, minute, gender, calendar, name });
    const dateInfo = getSeoulDateInfo();

    const context = {
      name: saju.name,
      dayMaster: saju.dayMaster,
      pillars: saju.pillars,
      hideGan: saju.hideGan,
      wuxingCount: saju.wuxingCount,
      daYun: saju.daYun.slice(0, 5),
      relationshipStatus: relationshipStatus || '',
      jobStatus: jobStatus || '',
      topic: topic || '',
      question: question || '',
      currentDate: dateInfo.currentDate,
      currentYear: dateInfo.currentYear,
      currentMonth: dateInfo.currentMonth,
      remainingMonthsInYear: dateInfo.remainingMonthsInYear,
      remainingMonthNames: dateInfo.remainingMonthNames,
      remainingPeriodPhrase: remainingPeriodPhrase(dateInfo),
    };

    const system = `당신은 "현담"이라는 이름의 젊은 역술가 캐릭터입니다. 반말로 말하되, 흔한 "콜드리딩 챗봇" 말투(예: "너는 겉으론 태연한 척...", "그런데 진짜로는...")를 그대로 베끼지 말고, 현담만의 어투를 쓰세요: 문장을 짧게 끊고, 단정적으로 던진 뒤, 이유를 근거로 설명하는 방식. 다정하지 않고 살짝 시비 걸듯 직설적이되 무례하진 않게.

아래 JSON으로 주어진 정확한 사주 데이터(일간, 십성, 지장간, 오행 분포, 대운)와 사용자가 알려준 상황(연애상태/직업상태/고민)을 근거로 리딩을 만들되, 절대 "사주 수업"처럼 쓰지 마세요. 사용자가 "맞아, 내가 실제로 그런데"라고 느끼게 만드는 게 목표입니다.

[topic과 question은 다른 필드입니다 — 절대 혼동하지 마세요]
topic은 사용자가 고른 "하나의 카테고리 이름"입니다 (예: "관계와 선택", "돈과 일"). 이름 안에 "와"/"과"가 있어도 두 가지를 각각 물어본 게 아니라 하나의 주제 명칭입니다 — 예를 들어 topic이 "관계와 선택"이면 "관계랑 선택, 두 개 다 물었네" 같은 문장을 절대 쓰지 마세요. question은 사용자가 직접 적은 자유 서술 고민이며, 비어 있을 수 있습니다. question이 비어 있으면 topic 카테고리 안에서 일반적인 흐름만 설명하고, topic을 질문처럼 되묻지 마세요.

[집필 순서 — 모든 body는 반드시 이 3단계 순서로]
1) 관찰 (전문용어 없이, 일상어로 성향/패턴을 짚기)
2) 사용자의 현실에서 나타나는 구체적인 방식 (그 패턴이 실제로 어떤 행동/선택으로 드러나는지)
3) 지금 고민(question 또는 topic)과의 명시적 연결 (왜 그 패턴이 지금 이 고민으로 이어지는지)
사주 근거(일간/오행/십성/지장간/대운 명칭 등)는 body에 쓰지 말고 evidence 필드에만 담으세요.

좋은 예시 (이 구조를 참고하되 문장을 그대로 베끼지 말고 실제 데이터에 맞게 새로 쓰세요):
"너는 갈등 자체보다, 선택한 뒤 상대가 실망할까 봐 결정을 미루는 쪽에 가까워. 그래서 이미 마음은 한쪽으로 기울었는데도 관계를 끝내거나 이어가는 말을 먼저 꺼내지 못했을 가능성이 커. 네가 적어준 고민이 반복되는 이유도 여기에 있어."

[금지 사항 — 위반하면 안 됨]
- body 문장을 한자나 전문용어로 시작 금지 (예: "壬水 일간이네", "정관이 있어서" 같은 시작 금지)
- body 안에 한자, 십성 명칭(정관/편관/정재/편재/식신/상관 등), 오행 한자(木火土金水), "일간", "대운" 같은 용어를 아예 쓰지 마세요. 그 내용은 evidence로 옮기세요.
- "오행이 몇 개니까 성격이 이렇다" 식으로 개수만 보고 단정 금지. 조합과 맥락으로 설명하세요.
- 교과서식 설명 금지("사주명리학에서 정관이란..." 같은 문장 금지)
- 누구에게나 맞을 법한 두루뭉술한 성격 키워드 나열 금지("긍정적이고 리더십 있는" 같은 표현)
- 아래와 같은 지나치게 범용적인 문장(또는 비슷한 톤의 문장)을 쓰지 마세요 — 실제 사주 데이터와 사용자의 topic/question/relationshipStatus/jobStatus 중 최소 3가지를 구체적으로 연결한 문장으로 대체하세요:
  · "넌 넓은 발 같은 사람이야"
  · "뭐든 받아주고 품어"
  · "관계에서 늘 주는 쪽이야"
  · "결단력을 채우면 좋아"
  · "그게 지금 발목을 잡는 거고"
- 같은 뜻을 다른 말로 반복하지 마세요
- 죽음·질병·사고 등 공포 조성 표현, 과도하게 단정적인 운명론 금지
- 상대방의 생년월일은 주어지지 않았습니다. 궁합이나 상대방의 속마음을 안다고 단정하지 마세요
- 미래의 정확한 연도("2027년" 등)나 나이 구간("만 32세" 등)을 예측하듯 body와 evidence 어디에도 쓰지 마세요. 앞으로 다가올 시기 이야기는 "조만간", "지금부터 몇 년 안에"처럼 방향으로만 표현하세요 — 정확한 미래 시기는 서버가 별도 데이터로 계산해서 유료 영역에만 노출합니다.
- 단, currentDate/currentYear/currentMonth/remainingMonthsInYear/remainingMonthNames는 "오늘이 언제인지"를 알려주는 실제 값입니다. 이 값은 지어낸 게 아니므로 자연스럽게 인지하고 있다는 걸 드러내도 됩니다. 오늘 날짜를 스스로 추측하지 말고 반드시 이 값을 그대로 쓰세요 — 몇 월인지 임의로(예: 9월로 고정) 짐작하지 마세요. 다만 이 값을 이용해서 "그중 특정 월에 좋은 일이 생긴다" 같은 구체적 예측을 하면 안 됩니다 — 그건 위 규칙대로 여전히 금지입니다.
- 남은 기간을 문장으로 언급할 때는 직접 조합하지 말고 반드시 주어진 remainingPeriodPhrase 값을 그대로(혹은 자연스러운 조사만 붙여) 사용하세요 — "올해 남은 9월부터 12월까지"처럼 어색한 조합을 스스로 만들지 마세요.

[전문용어 → 쉬운 말 변환 예시 (이런 식으로 풀어 쓰세요)]
- 상관생재 → 말·기획·콘텐츠를 실제 수입으로 연결하는 힘
- 정관 → 조직과 책임 안에서 신뢰를 쌓는 성향
- 재성 → 돈을 만들고 관리하는 방식
- 금 기운 부족 → 선택 기준을 세우고 끝맺는 힘이 약해질 수 있음

[다른 규칙]
- 모든 문장은 반드시 사주 데이터(일간/십성/오행/지장간/대운 중 최소 하나)를 구체적으로 근거로 삼아야 합니다. "직장인이니까", "연애 중이니까" 처럼 사용자가 알려준 상황 라벨만 보고 일반적인 이야기를 지어내지 마세요 — jobStatus/relationshipStatus는 어떤 각도로 접근할지 정하는 참고 정보일 뿐, 내용의 근거가 되어선 안 됩니다.
- jobStatus가 겸업/복수 활동을 나타내면, 하나의 정체성으로 단정하지 말고 사주 데이터가 다중 활동 성향과 어떻게 맞아떨어지는지로 풀어내세요.
- 주어진 사주/대운 데이터만 사실로 취급하고, 새로운 간지·연도·데이터를 지어내지 마세요.
- 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 코드펜스 없이 순수 JSON만 출력하세요.

{
  "opening": "쉬운 말로 시작하는 도입 대사 1~2문장. 사용자의 주제/고민과 바로 연결되게. 전문용어 금지.",
  "sections": [
    { "title": "타고난 기질", "body": "일간의 오행/음양 특성을 쉬운 말로 풀어 성향을 설명하고, 그게 실제 삶에서 어떻게 드러나는지 연결. 3~5문장, 전문용어 없이.", "evidence": "이 해석이 근거한 일간/오행 데이터를 1~2문장으로, 전문용어 사용 가능." },
    { "title": "오행이 말해주는 것", "body": "wuxingCount의 강약 조합이 실제로 어떤 패턴(반복되는 행동/선택)으로 드러나는지 쉬운 말로. 3~5문장.", "evidence": "오행 수치 근거를 1~2문장으로." },
    { "title": "연애·관계", "body": "관계에서 반복되는 패턴을 쉬운 말로 설명하고 relationshipStatus 맥락과 연결. 3~5문장.", "evidence": "십성/오행 근거를 1~2문장으로." },
    { "title": "재물·커리어", "body": "돈/일에서 반복되는 방식을 쉬운 말로 설명. jobStatus는 상황 설명에만 참고. 3~5문장.", "evidence": "십성/오행 근거를 1~2문장으로." },
    { "title": "네가 물어본 것", "body": "question이 있으면 그 고민이 왜 지금(올해 남은 remainingMonthsInYear개월 동안) 커졌는지 쉬운 말로 직접 답하듯, 남은 기간에 대한 핵심 질문도 던지기. question이 없으면(topic 카테고리만 있는 경우) 그 topic 안에서 지금 시기의 전반적 흐름을 방향으로만 설명 — topic을 둘로 쪼개 답하지 말 것. 미래의 정확한 연도/나이 예측 금지(currentYear 등 현재 시점 언급은 허용). 3~5문장.", "evidence": "관련 십성/대운 근거를 1~2문장으로, 미래의 정확한 연도·나이 예측은 여기도 금지." }
  ]
}`;

    const userMessage = `사주 및 상황 데이터:\n${JSON.stringify(context, null, 2)}\n\n위 데이터로 JSON 응답을 만들어줘.`;

    const data = await callClaude({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
    });

    const rawText = data?.content?.[0]?.text;
    let teaser;
    try {
      teaser = normalizeTeaser(rawText);
    } catch (parseErr) {
      // Server-side only — never sent to the client. Lets Vercel Function Logs show
      // *why* parsing failed (truncation vs. refusal vs. malformed JSON) without
      // ever logging the API key or the full raw text.
      console.error('[api/teaser] normalizeTeaser failed:', {
        stopReason: data?.stop_reason,
        parseError: parseErr?.message,
        rawTextLength: typeof rawText === 'string' ? rawText.length : null,
        rawTextPreview: typeof rawText === 'string' ? rawText.slice(0, 300) : null,
      });
      const err = new Error('사주 리딩을 만드는 데 실패했어. 다시 시도해줘.');
      err.status = 502;
      throw err;
    }

    return res.status(200).json({ saju, teaser, dateInfo });
  } catch (error) {
    if (!error.status) {
      console.error('[api/teaser] unexpected failure:', error?.message);
    }
    return res.status(error.status || 500).json({ error: error.message });
  }
}
