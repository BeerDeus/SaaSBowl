// Agrège les réservations bowling (planning/byMonth) en nombre de pistes réservées par heure, avec
// le détail par résa. Le CRM indique déjà lui-même le nombre de pistes allouées via le champ "piste"
// (un "<span>Piste:...</span>" par piste, confirmé par capture réseau réelle sur un vrai mois:
// 1-7 participants -> 1 piste, 8-14 -> 2 pistes) -> on compte les <span>, pas de formule de
// capacité à deviner nous-même.
function countLanes(pisteField) {
  const matches = String(pisteField || '').match(/<span>/g);
  return matches ? matches.length : 1;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function eventDateStr(event) {
  return `${event.y}-${pad2(event.m)}-${pad2(event.d)}`;
}

// events: liste brute de getBowlingPlanningByMonth (un mois entier). dateStr: "YYYY-MM-DD" à isoler.
// Renvoie [{ hour, totalLanes, bookings: [{ lanes, participants, client }] }] trié par heure.
function aggregateLanesByHour(events, dateStr) {
  const byHour = new Map();
  for (const event of events) {
    if (eventDateStr(event) !== dateStr) continue;
    const hour = event.h;
    const booking = {
      lanes: countLanes(event.piste),
      participants: event.nbr_participants || 0,
      client: event.user || null,
    };
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(booking);
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, bookings]) => ({
      hour,
      totalLanes: bookings.reduce((sum, b) => sum + b.lanes, 0),
      bookings,
    }));
}

module.exports = { countLanes, aggregateLanesByHour, eventDateStr };
