// 검증용 가상 사례 (실제 사람 아님)
export const WORK = { question: '지금 회사를 계속 다녀야 할까, 내 작업으로 독립해야 할까?', situation: '디자인 회사 5년 차, 퇴근 후 개인 일러스트 작업 1년째', options: ['회사에 다니면서 개인 작업 병행', '6개월 안에 퇴사하고 독립', ''], period: '앞으로 6개월' };
const A = { calendar: 'solar', year: 1996, month: 3, day: 21, hourUnknown: true };
const B = { calendar: 'solar', year: 1987, month: 7, day: 1, hour: 10, minute: 30 };
export const CASES = [
  { id: 'case-a', name: '가상 사례 A', birth: A, concern: WORK },
  { id: 'case-b', name: '가상 사례 B', birth: B, concern: WORK },
  { id: 'case-c', name: '가상 사례 C', birth: A, concern: { question: '월급이 들어와도 모이는 돈이 없어요. 어떻게 관리해야 할까요?', situation: '직장인, 고정 지출이 정리되어 있지 않음', options: [], period: '앞으로 3개월' } },
  { id: 'edge-no-concern', name: '가상 사례 D', birth: A, concern: { question: '', situation: '', options: [], period: '' } },
  { id: 'edge-unsupported', name: '가상 사례 E', birth: B, concern: { question: '헤어진 사람과 다시 만날 수 있을까요?', situation: '', options: [], period: '' } },
  { id: 'edge-jasi', name: '가상 사례 F', birth: { calendar: 'solar', year: 1996, month: 4, day: 18, hour: 23, minute: 40 }, concern: WORK },
];
