// No-AI test for run-live-tests.js's new single-customer CLI argument. Spawns
// run-live-tests.js as a real child process (so the actual CLI argument-parsing and
// process.exit() paths are exercised, not just an internal function) against a
// deliberately UNREACHABLE endpoint (127.0.0.1:1 — nothing ever listens on port 1) so
// every fetch fails immediately with a real, fast "fetch failed" — never a real network
// round trip, never Vercel, never Anthropic. This sandbox's egress policy makes an
// actual local TCP server hang when connected to from a spawned child process (verified
// separately, unrelated to this feature's code), so an always-fails-fast target is what
// makes this test reliable rather than the point of the test.
import { execFileSync } from 'child_process';

const UNREACHABLE = 'http://127.0.0.1:1';

function run(args, timeoutMs = 20000) {
  try {
    const out = execFileSync('node', ['prototype/run-live-tests.js', ...args], {
      env: { ...process.env, PROTOTYPE_ENDPOINT_URL: UNREACHABLE, PROTOTYPE_TEST_SECRET: 'fake-secret' },
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    return { stdout: out, stderr: '', code: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status };
  }
}

let allOk = true;
function check(label, ok, detail) {
  allOk = allOk && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok && detail !== undefined) console.log('   ', detail);
}

console.log('=== 1. minjun만 지정 -> 민준만 실행 대상 ===');
{
  const { stdout, code } = run(['minjun']);
  check('exit code 0 (모든 화면이 네트워크 실패로 스킵돼도 스크립트 자체는 정상 종료)', code === 0, code);
  check('민준 실행됨', stdout.includes('=== minjun 실제 AI 생성 시작 ==='));
  check('서연 실행 안 됨', !stdout.includes('=== seoyeon 실제 AI 생성 시작 ==='));
  check('도윤 실행 안 됨', !stdout.includes('=== doyoon 실제 AI 생성 시작 ==='));
}

console.log('\n=== 2. 인자 없음 -> 3명 전체 실행(기존 동작 유지) ===');
{
  const { stdout, code } = run([]);
  check('exit code 0', code === 0, code);
  check('민준 실행됨', stdout.includes('=== minjun 실제 AI 생성 시작 ==='));
  check('서연 실행됨', stdout.includes('=== seoyeon 실제 AI 생성 시작 ==='));
  check('도윤 실행됨', stdout.includes('=== doyoon 실제 AI 생성 시작 ==='));
}

console.log('\n=== 3. 잘못된 이름 -> API 호출 전에 즉시 종료 ===');
{
  const { stdout, stderr, code } = run(['nobody']);
  check('exit code 1', code === 1, code);
  check('에러 메시지에 사용 가능한 이름 안내 포함', stderr.includes('minjun') && stderr.includes('seoyeon') && stderr.includes('doyoon'), stderr);
  check('어떤 고객 생성도 시작되지 않음(= 네트워크/Anthropic 호출 이전에 종료)', !stdout.includes('실제 AI 생성 시작'));
}

console.log('\n전체 결과:', allOk ? 'PASS' : 'FAIL');
process.exit(allOk ? 0 : 1);
