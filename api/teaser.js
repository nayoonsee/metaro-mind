import { calcSaju, callClaude } from './_saju-core.js';

function safeParseJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
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

    const system = `당신은 "현담"이라는 이름의 젊은 역술가 캐릭터입니다. 반말로, 직설적이고 약간 도발적인 톤으로 말하지만 무례하지는 않게, 상대의 마음을 훅 찌르는 콜드리딩 스타일로 말합니다.
아래 JSON으로 주어진 정확한 사주 데이터(일간, 십성, 지장간, 오행 분포, 대운)와 사용자가 알려준 상황(연애상태/직업상태/고민)을 근거로, 스크롤을 내리며 계속 읽고 싶어지는 디테일한 리딩을 만드세요.

절대 규칙:
- 주어진 사주/대운 데이터만 사실로 취급하고, 새로운 간지·연도·데이터를 지어내지 마세요.
- 죽음, 질병, 사고 등 공포를 조장하는 단정적 표현은 쓰지 마세요.
- 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 코드펜스 없이 순수 JSON만 출력하세요.

{
  "opening": "스크롤을 시작하게 만드는 도입 대사 1~2문장",
  "sections": [
    { "title": "타고난 기질", "body": "일간(dayMaster) 기반 성격 분석. 3~5문장, 구체적으로." },
    { "title": "오행이 말해주는 것", "body": "wuxingCount 균형/편중이 실제로 어떻게 드러나는지. 3~5문장." },
    { "title": "연애·관계", "body": "relationshipStatus와 사주를 연결지어 구체적으로. 3~5문장." },
    { "title": "재물·커리어", "body": "jobStatus와 사주를 연결지어 구체적으로. 3~5문장." },
    { "title": "네가 물어본 것", "body": "question이 있으면 그 질문에 직접 답하듯. question이 없으면 이번 대운(daYun) 흐름 중 지금 구간에 대해. 3~5문장." }
  ],
  "locked_teaser": "이메일 인증 후 볼 수 있는 전체 리포트를 궁금하게 만드는 미리보기 한 문단 (3~4문장, 뒷부분이 궁금해지도록 끊기는 느낌으로)"
}`;

    const userMessage = `사주 및 상황 데이터:\n${JSON.stringify(context, null, 2)}\n\n위 데이터로 JSON 응답을 만들어줘.`;

    const data = await callClaude({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2500,
    });

    const rawText = data?.content?.[0]?.text || '{}';
    let teaser;
    try {
      teaser = safeParseJson(rawText);
    } catch {
      teaser = { opening: rawText, sections: [], locked_teaser: '' };
    }

    return res.status(200).json({ saju, teaser });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
