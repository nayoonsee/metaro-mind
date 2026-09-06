// MVP-scoped Korean particle (조사) fix — deliberately narrow. This does NOT attempt to
// parse or correct arbitrary Korean sentences; it only fixes the two particle pairs
// (이/가, 은/는) immediately following a KNOWN customer nickname, which is the exact bug
// reported ("민준가" instead of "민준이"). A general-purpose josa engine covering 을/를,
// 과/와, 아/야, etc. across arbitrary text is explicitly out of scope for this round.

// Hangul syllable batchim (final consonant) check via Unicode block arithmetic:
// U+AC00 (가) is the first precomposed syllable; each syllable spans 28 code points
// (the number of possible final-consonant slots, 0 = none). Non-Hangul characters (a
// digit, a Latin letter used as part of a name, etc.) are treated as "no batchim" — the
// same default a plain reading would use.
function hasBatchim(char) {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function lastCharOf(word) {
  return word[word.length - 1];
}

// Fixes ONLY "<nickname>가" -> "<nickname>이" and "<nickname>는" -> "<nickname>은" when
// the nickname ends in a syllable WITH a batchim (e.g. 민준). The reverse direction
// (a batchim-less name incorrectly given 이/은) is left alone in this MVP — every
// existing template/prompt already defaults to 가/는, so 가/는 attached to a batchim-less
// name is already correct and never needs touching.
export function fixNicknameJosa(text, nickname) {
  if (!text || !nickname) return text;
  if (!hasBatchim(lastCharOf(nickname))) return text;
  const escaped = nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`${escaped}가`, 'g'), `${nickname}이`)
    .replace(new RegExp(`${escaped}는`, 'g'), `${nickname}은`);
}
