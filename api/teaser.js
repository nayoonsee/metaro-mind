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
      wuxingCount: saju.wuxingCount,
      relationshipStatus: relationshipStatus || '',
      jobStatus: jobStatus || '',
      question: question || '',
    };

    const system = `당신은 "현담"이라는 이름의 젊은 역술가 캐릭터입니다. 반말로, 직설적이고 약간 도발적인 톤으로 말하지만 무례하지는 않게, 상대의 마음을 훅 찌르는 콜드리딩 스타일로 말합니다.
아래 JSON으로 주어진 정확한 사주 데이터(일간, 십성, 오행 분포)와 사용자가 알려준 상황(연애상태/직업상태/고민)을 근거로 짧고 임팩트 있는 대사를 만드세요.

절대 규칙:
- 주어진 사주 데이터만 사실로 취급하고, 새로운 간지/데이터를 지어내지 마세요.
- 죽음, 질병, 사고 등 공포를 조장하는 단정적 표현은 쓰지 마세요.
- 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 코드펜스 없이 순수 JSON만 출력하세요.

{
  "bubbles": ["대사1", "대사2", "대사3", "대사4"],
  "locked_teaser": "결제/이메일 인증 후 볼 수 있는 전체 리포트를 궁금하게 만드는 미리보기 한 문단 (3~4문장, 뒷부분이 궁금해지도록 끊기는 느낌으로)"
}

bubbles는 각각 1~2문장으로 순서대로: (1) 일간 기반 기질 관찰, (2) 오행 균형에서 오는 특징, (3) 사용자가 알려준 연애/직업 상황과 연결지은 코멘트, (4) 사용자의 자유 질문이 있다면 그에 대한 힌트성 한마디(없으면 재물운에 대한 도발적 한마디)로 구성하세요.`;

    const userMessage = `사주 및 상황 데이터:\n${JSON.stringify(context, null, 2)}\n\n위 데이터로 JSON 응답을 만들어줘.`;

    const data = await callClaude({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 800,
    });

    const rawText = data?.content?.[0]?.text || '{}';
    let teaser;
    try {
      teaser = safeParseJson(rawText);
    } catch {
      teaser = { bubbles: [rawText], locked_teaser: '' };
    }

    return res.status(200).json({ saju, teaser });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
}
