// 샘플 결과지(public/sample/hyeondam-sample.json)를 만든다.
// - 가상의 인물(달빛, 1996-03-21, 출생 시간 모름) — 실제 사람의 정보가 아니다.
// - 사주 계산은 실제 calcSaju로, 해석 문장은 사람이 쓴 샘플 문구(유료 API 호출 없음).
// - 실제 응답과 똑같이 splitTeaser를 거쳐 무료/미리보기만 남긴다.
// 실행: node scripts/build-sample.mjs
import { writeFile } from 'node:fs/promises';
import { calcSaju } from '../api/_saju-core.js';
import { splitTeaser } from '../api/_teaser-split.js';

const saju = await calcSaju({ year: 1996, month: 3, day: 21, gender: '여성', calendar: 'solar', name: '달빛' });

const teaser = {
  opening: '일 얘기부터 하자. 너는 지금 일이 싫은 게 아니야. 이 일이 너를 얼마나 쓰고 있는지가 헷갈리는 거지.',
  sections: [
    {
      title: '타고난 기질',
      body: '너는 한 군데를 오래 비추는 사람이야. 넓게 퍼지기보다 마음 둔 일에 깊게 파고들어. 그래서 시작은 느려도, 붙잡은 건 끝까지 붙잡아.',
      evidence: '일간이 정화(丁火)라 촛불처럼 한 점에 집중하는 기운이야. 일지 사화(巳火)가 그 불을 받쳐 줘.',
    },
    {
      title: '오행이 말해주는 것',
      body: '불의 기운이 세. 열정이 먼저 나가고, 정리는 나중에 와. 그래서 일을 벌이는 속도에 비해 마무리하는 힘이 늘 모자라다고 느껴. 이건 의지가 약해서가 아니라 순서의 문제야.',
      evidence: '년·월·일주 세 기둥 기준 화(火) 3, 목·금·수 각 1이야. 시간을 몰라 시주는 빠져 있어서 토(土)가 0이라고 단정하진 않아.',
    },
    {
      title: '연애·관계',
      body: '관계에서도 한 사람에게 깊게 들어가. 대신 내 열기를 상대가 못 따라오면 혼자 지쳐. 그 피로가 쌓이면 말없이 거리를 둬.',
      evidence: '정화 일간에 겁재가 있어 내 방식대로 끌고 가려는 힘이 강해.',
    },
    {
      title: '재물·커리어',
      body: '돈은 꾸준한 월급보다 기회를 잡을 때 크게 움직여. 문제는 기회가 보이면 조건을 덜 따진다는 거야. 그래서 바쁜데 남는 게 없다는 느낌이 자주 와. 일의 양보다 일의 단가를 먼저 봐야 해.',
      evidence: '월간 신금(辛金)이 편재라, 고정 수입보다 유동적인 재물 흐름에 반응하는 구조야.',
    },
    {
      title: '네가 물어본 것',
      body: '계속해도 돼. 다만 지금 방식 그대로는 아니야. 너는 이 일에서 불은 다 쓰고 있는데, 그 불이 어디로 새는지는 안 보고 있어. 올해 남은 기간에는 일을 더 늘리기 전에, 지금 하는 일 중 너를 가장 덜 쓰는 하나부터 정리해 봐.',
      evidence: '편재와 겁재가 함께 있어 벌이는 힘은 크고, 지키는 힘은 상대적으로 약한 배치야.',
    },
  ],
};

const { free, previews } = splitTeaser(teaser);
const out = {
  sample: true,
  note: '가상의 인물로 만든 샘플 결과지입니다. 실제 사람의 정보나 실제 AI 풀이가 아닙니다.',
  saju,
  // 샘플 날짜는 고정 — 볼 때마다 문구가 바뀌지 않게.
  dateInfo: { currentDate: '2026-10-11', currentYear: 2026, currentMonth: 10, remainingMonthsInYear: 3, remainingMonthNames: ['10월', '11월', '12월'] },
  free,
  previews,
};
await writeFile(new URL('../public/sample/hyeondam-sample.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote public/sample/hyeondam-sample.json');
