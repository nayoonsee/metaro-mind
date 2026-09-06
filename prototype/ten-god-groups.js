// Reads which ten-god categories the NATAL chart (year/month/day/time gan + all hidden
// stems) actually contains, and how many times, so the slot planner can decide which
// topic screens have real calculation support for THIS person — never force a topic a
// chart doesn't contain evidence for.

// When hourKnown is false, the time pillar was filled with a placeholder noon value by
// calcSaju() purely so the library has something to compute against — that placeholder
// must never be cited as evidence. All 'time-gan'/'time-hide' occurrences are excluded
// whenever chart.hourKnown is false (governance: "출생시간을 몰라 확인할 수 없는 부분은
// 자연스럽게 축소한다", never silently treat the 12:00 default as if it were real).
export function collectNatalTenGodOccurrences(chart) {
  const occ = []; // { tenGod, gan, reading, location: 'year-gan'|'year-hide'|... }
  const push = (tenGod, gan, reading, location) => occ.push({ tenGod, gan, reading, location });

  push(chart.pillars.year.tenGod, chart.pillars.year.gan, chart.pillars.year.ganReading, 'year-gan');
  push(chart.pillars.month.tenGod, chart.pillars.month.gan, chart.pillars.month.ganReading, 'month-gan');
  chart.hideGan.year.forEach((h) => push(h.tenGod, h.gan, h.reading, 'year-hide'));
  chart.hideGan.month.forEach((h) => push(h.tenGod, h.gan, h.reading, 'month-hide'));
  chart.hideGan.day.forEach((h) => push(h.tenGod, h.gan, h.reading, 'day-hide'));

  if (chart.hourKnown) {
    // day-gan itself is the day master identity, not counted as a "ten god occurrence"
    push(chart.pillars.time.tenGod, chart.pillars.time.gan, chart.pillars.time.ganReading, 'time-gan');
    chart.hideGan.time.forEach((h) => push(h.tenGod, h.gan, h.reading, 'time-hide'));
  }

  return occ;
}

// Ten-god categories grouped the same way the frozen nayoon report grouped them.
export const GROUPS = {
  bigyeop: ['비견', '겁재'],
  insung: ['정인', '편인'],
  siksang: ['식신', '상관'],
  jaeseong: ['정재', '편재'],
  gwanseong: ['정관', '편관'],
};

export function groupPresence(occurrences) {
  const byTenGod = {};
  occurrences.forEach((o) => {
    byTenGod[o.tenGod] = byTenGod[o.tenGod] || [];
    byTenGod[o.tenGod].push(o);
  });
  const presence = {};
  for (const [groupName, tenGods] of Object.entries(GROUPS)) {
    const found = tenGods.flatMap((tg) => byTenGod[tg] || []);
    presence[groupName] = {
      count: found.length,
      members: found,
      hasBoth: tenGods.every((tg) => (byTenGod[tg] || []).length > 0),
      hasAny: found.length > 0,
    };
  }
  return presence;
}
