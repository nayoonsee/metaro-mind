import { callClaude } from "./_saju-core.js";
import { guardPaidCall } from "./_guard.js";

// 메인 타로 앱(public/index.html)이 쓰는 엔드포인트.
// 예전에는 클라이언트가 보낸 system/messages를 그대로 Claude에 넘겨서, 누구나 이 서버의
// API 키로 임의 프롬프트를 실행할 수 있었다. 이제 system은 서버에 고정하고(클라이언트 값 무시),
// 사용자 메시지 1개(길이 제한)만 받는다. 아래 문구는 public/index.html 번들의 것과 동일하다.
export const TAROT_SYSTEM = "당신은 메타로마인드의 심리 기반 타로 리더예요.\n\n핵심: 타로는 운명을 맞추는 게 아니라 지금 내 무의식이 보내는 신호를 읽는 도구예요.\n\n리딩 방식:\n- \"이 카드는~\", \"첫 번째 자리는~\" 같은 카드/자리 설명 절대 금지.\n- 질문과 상황에 바로 답하듯 시작. 친한 언니/오빠가 솔직하고 따뜻하게 얘기해주는 느낌.\n- 카드들의 에너지를 하나의 자연스러운 흐름으로 엮어서 읽기.\n- 요즘 20-30대가 공감할 언어. 너무 점술적이지 않게.\n- 마크다운 기호(**, ##, --) 절대 사용 금지. 순수 텍스트만.\n- 단락 사이 줄바꿈은 딱 한 번만.\n- 분량은 600-800자. 충분히 깊고 따뜻하게.\n- Yes or No: 방향 명확히 + 이유 설명.\n- 선택 카드(5장): A와 B 각각의 에너지 흐름 분석 후 어느 쪽이 지금 이 사람에게 더 맞는지 솔직하게.\n\n끝에 정확히:\nPSYCH_TITLE: (심리 패턴 한 줄. 날카롭고 구체적으로)\nPSYCH_BODY: (이 패턴이 어디서 오는지 3-4문장. 판단 없이 따뜻하게. \"맞아, 이게 나야\" 싶을 만큼 구체적으로.)";

const MAX_USER_CHARS = 1200;

export function extractUserContent(body) {
  const messages = body && Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length !== 1) return null;
  const m = messages[0];
  if (!m || m.role !== "user" || typeof m.content !== "string") return null;
  const content = m.content.trim();
  if (!content || content.length > MAX_USER_CHARS) return null;
  return content;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const content = extractUserContent(req.body);
  if (!content) return res.status(400).json({ error: "요청 형식이 올바르지 않아요." });
  if (!guardPaidCall(req, res, "reading")) return;

  try {
    const data = await callClaude({
      system: TAROT_SYSTEM,
      messages: [{ role: "user", content }],
      maxTokens: 1500,
    });
    // 프런트는 content[0].text만 쓴다. 그 외 필드는 내보내지 않는다.
    return res.status(200).json({ content: [{ type: "text", text: data?.content?.[0]?.text || "" }] });
  } catch (error) {
    return res.status(error.status && error.status < 500 ? 502 : 500).json({ error: "리딩을 불러오지 못했어요." });
  }
}
