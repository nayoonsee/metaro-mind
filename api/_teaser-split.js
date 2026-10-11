// 무료 응답과 (향후) 유료 리포트 내용을 서버에서 분리한다.
//
// 예전에는 모델이 쓴 5개 섹션 전문을 브라우저로 보내고, 잠긴 부분은 CSS 블러로만 가렸다
// (개발자 도구로 전부 보였다). 이제 브라우저로 나가는 건 아래 `free`와 `previews`뿐이다.
// 잠긴 부분의 실제 문장은 응답에 들어가지 않는다. 유료 리포트는 결제 확인 후 별도
// 엔드포인트에서 새로 생성해야 한다(아직 없음).

export function splitSentences(text) {
  if (!text) return [];
  const matches = String(text).match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);
  return (matches || [String(text)]).map((s) => s.trim()).filter(Boolean);
}

const lead = (sec, n) => (sec && sec.body ? splitSentences(sec.body).slice(0, n).join(' ') : '');

// 잠긴 항목 제목 옆에 보여줄 "첫 문장"만. fortune.html의 LOCKED_CONFIG가 `${sec}:${part}`로 찾는다.
function previewSentence(sec, part) {
  const s = sec && sec.body ? splitSentences(sec.body) : [];
  if (!s.length) return '';
  if (part === 'second') return s.length >= 2 ? s[1] : s[0];
  return s[0];
}

// teaser.sections 순서: 0 타고난 기질, 1 오행, 2 연애·관계, 3 재물·커리어, 4 네가 물어본 것
export function splitTeaser(teaser) {
  const sections = (teaser && teaser.sections) || [];
  const [temperament, wuxing, love, money, question] = sections;
  const pick = (sec, body) => (sec ? { title: sec.title || '', body, evidence: sec.evidence || '' } : null);

  const free = {
    opening: (teaser && teaser.opening) || '',
    temperament: pick(temperament, lead(temperament, 2)),
    // "네가 지금 이 문제 앞에서 멈춘 이유" — 원래부터 무료로 전부 공개하던 섹션
    question: pick(question, question ? question.body : ''),
    // "실제 결과 미리보기" — 앞 두 문장만
    wuxing: pick(wuxing, lead(wuxing, 2)),
  };

  const bySec = { wuxing, love, money, question };
  const previews = {};
  for (const [key, sec] of Object.entries(bySec)) {
    for (const part of ['first', 'second', 'all']) {
      const v = previewSentence(sec, part);
      if (v) previews[`${key}:${part}`] = v;
    }
  }
  return { free, previews };
}
