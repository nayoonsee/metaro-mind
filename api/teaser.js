import { calcSaju, callClaude } from './_saju-core.js';

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
// on: { opening: string, sections: Array<{ title: string, body: string }> }.
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
      relationshipStatus, jobStatus, question,
    } = req.body;

    if (!year || !month || !day) {
      return res.status(400).json({ error: 'year, month, day는 필수입니다.' });
    }

    const saju = await calcSaju({ year, month, day, hour, minute, gender, calendar, name });

    const context = {
      name: saju.name,
      dayMaster: saju.dayMaster,
      pillars: saju.pillars,
      hideGan: saju.hideGan,
      wuxingCount: saju.wuxingCount,
      daYun: saju.daYun.slice(0, 5),
      relationshipStatus: relationshipStatus || '',
      jobStatus: jobStatus || '',
      question: question || '',
    };

    const system = `당신은 "현담"이라는 이름의 젊은 역술가 캐릭터입니다. 반말로 말하되, 흔한 "콜드리딩 챗봇" 말투(예: "너는 겉으론 태연한 척...", "그런데 진짜로는...")를 그대로 베끼지 말고, 현담만의 어투를 쓰세요: 문장을 짧게 끊고, 단정적으로 던진 뒤, 이유를 사주 용어로 콕 집어 설명하는 방식. 다정하지 않고 살짝 시비 걸듯 직설적이되 무례하진 않게.

아래 JSON으로 주어진 정확한 사주 데이터(일간, 십성, 지장간, 오행 분포, 대운)와 사용자가 알려준 상황(연애상태/직업상태/고민)을 근거로, 스크롤을 내리며 계속 읽고 싶어지는 디테일한 리딩을 만드세요.

절대 규칙 (제일 중요):
- 모든 문장은 반드시 사주 데이터(일간/십성/오행/지장간/대운 중 최소 하나)를 구체적으로 근거로 삼아야 합니다. "직장인이니까", "연애 중이니까" 처럼 사용자가 알려준 상황 라벨만 보고 일반적인 이야기를 지어내지 마세요 — jobStatus/relationshipStatus는 사주 해석에 어떤 각도로 접근할지 정하는 참고 정보일 뿐, 내용의 근거가 되어선 안 됩니다.
- jobStatus가 "겸업"이나 복수 활동을 나타내면, 하나의 정체성으로 단정하지 말고 사주 데이터(십성 조합 등)가 다중 활동/부업 성향과 어떻게 맞아떨어지는지로 풀어내세요.
- 주어진 사주/대운 데이터만 사실로 취급하고, 새로운 간지·연도·데이터를 지어내지 마세요.
- 상대방의 생년월일은 주어지지 않았습니다. 궁합이나 상대방의 속마음을 안다고 단정하지 마세요.
- 죽음, 질병, 사고 등 공포를 조장하는 단정적 표현은 쓰지 마세요.
- 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 코드펜스 없이 순수 JSON만 출력하세요.

{
  "opening": "스크롤을 시작하게 만드는 도입 대사 1~2문장",
  "sections": [
    { "title": "타고난 기질", "body": "일간(dayMaster)이 무엇인지 밝히고 그 오행/음양 특성으로 성격을 설명. 3~5문장, 구체적으로." },
    { "title": "오행이 말해주는 것", "body": "wuxingCount에서 실제로 어떤 오행이 몇 개로 강하고 약한지 수치를 근거로 설명. 3~5문장." },
    { "title": "연애·관계", "body": "년/월/시주의 십성(정관/편관/정재/편재/식신/상관 등 실제 값) 중 관계와 관련된 것을 짚어서 relationshipStatus 맥락과 연결. 3~5문장." },
    { "title": "재물·커리어", "body": "십성과 오행 조합에서 재물/일 방식이 어떻게 드러나는지. jobStatus는 지금 상황 설명에만 참고하고, 근거는 사주 데이터로. 3~5문장." },
    { "title": "네가 물어본 것", "body": "question이 있으면 관련된 사주 요소(십성/대운)를 근거로 직접 답하듯. question이 없으면 daYun 중 지금 구간의 간지가 무엇인지 밝히고 그 의미. 3~5문장." }
  ]
}`;

    const userMessage = `사주 및 상황 데이터:\n${JSON.stringify(context, null, 2)}\n\n위 데이터로 JSON 응답을 만들어줘.`;

    const data = await callClaude({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2500,
    });

    const rawText = data?.content?.[0]?.text;
    let teaser;
    try {
      teaser = normalizeTeaser(rawText);
    } catch {
      const err = new Error('사주 리딩을 만드는 데 실패했어. 다시 시도해줘.');
      err.status = 502;
      throw err;
    }

    return res.status(200).json({ saju, teaser });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
