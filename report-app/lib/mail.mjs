// 메일 전달: 검토 완료 → 수신자·제목·첨부 확인 → 발송 대기열.
// 이번 버전의 전송기는 "테스트용 전송기"뿐이다. 실제로 메일을 보내지 않고, 로컬 폴더에 발송 대기 기록만 남긴다.
// 실제 발송(구매자 본인 메일 계정 연결)은 아직 구현하지 않았다. 필요한 설정은 README 참조.
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateMail({ to, subject, reviewed, hasPdf }) {
  const errors = [];
  if (!reviewed) errors.push('리포트 검토 완료를 먼저 체크해 주세요.');
  if (!EMAIL_RE.test(String(to || '').trim())) errors.push('받는 사람 이메일 주소를 확인해 주세요.');
  if (!String(subject || '').trim()) errors.push('메일 제목을 입력해 주세요.');
  if (!hasPdf) errors.push('첨부할 PDF를 먼저 만들어 주세요.');
  return errors;
}

export function createTestTransport(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    kind: 'test',
    label: '테스트용 전송기 (실제 발송 안 함)',
    async enqueue({ to, subject, body, pdf, fileName }) {
      const id = randomUUID();
      // 개인정보 최소화: 첨부 본문은 저장하지 않고 크기만 기록한다.
      writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, status: 'queued-test', realSent: false, to, subject, bodyLength: (body || '').length, attachment: { fileName, bytes: pdf.length }, queuedAt: new Date().toISOString() }, null, 2));
      return { id, status: 'queued-test', realSent: false };
    },
    list() { return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))); },
  };
}
