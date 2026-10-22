// Port de script_v2.js:1927-1954 (isTimeSlotAvailable) — même logique d'overlap,
// mais prend reservations/closedSlots en paramètres au lieu des globales du script client.
const TIME_SLOT_STEP = 0.5;

// reservations: array de {id, date, room, startTime, endTime}
// closedSlots: objet plat {"date.hour.room": true}
function isTimeSlotAvailable(date, startTime, endTime, room, reservations, closedSlots, reservationIdToIgnore = null) {
  for (let hour = startTime; hour < endTime; hour += TIME_SLOT_STEP) {
    const key = `${date}.${hour}.${room}`;
    if (closedSlots[key]) return false;
  }

  const sameDayReservations = reservations.filter((r) => r.date === date && r.room === room);
  for (const res of sameDayReservations) {
    if (res.id === reservationIdToIgnore) continue;
    if (
      (startTime >= res.startTime && startTime < res.endTime) ||
      (endTime > res.startTime && endTime <= res.endTime) ||
      (startTime <= res.startTime && endTime >= res.endTime)
    ) {
      return false;
    }
  }
  return true;
}

// Version qui renvoie la raison (porte de script_v2.js:1858-1880, sans le cas closedSlots
// détaillé par message puisque côté sync CRM on ne fait qu'alerter, pas d'UI par créneau).
function describeSlotConflict(date, startTime, endTime, room, reservations, closedSlots, reservationIdToIgnore = null) {
  for (let hour = startTime; hour < endTime; hour += TIME_SLOT_STEP) {
    const key = `${date}.${hour}.${room}`;
    if (closedSlots[key]) {
      return `Créneau ${hour}h fermé manuellement.`;
    }
  }
  const conflicts = reservations
    .filter((r) => r.date === date && r.room === room && r.id !== reservationIdToIgnore)
    .filter(
      (r) =>
        (startTime >= r.startTime && startTime < r.endTime) ||
        (endTime > r.startTime && endTime <= r.endTime) ||
        (startTime <= r.startTime && endTime >= r.endTime)
    )
    .sort((a, b) => a.startTime - b.startTime);
  if (conflicts.length > 0) {
    const c = conflicts[0];
    return `Chevauche la réservation de « ${c.clientName || '?'} » (${c.startTime}h → ${c.endTime}h).`;
  }
  return null;
}

// Même logique que isTimeSlotAvailable, mais pour qkReservations (clé "activity" au lieu de "room")
// — porte le même dédoublement que script_v2.js (isTimeSlotAvailable vs isQkSlotAvailable).
function isQkSlotAvailable(date, startTime, endTime, activity, reservations, closedSlots, reservationIdToIgnore = null) {
  for (let hour = startTime; hour < endTime; hour += TIME_SLOT_STEP) {
    const key = `${date}.${hour}.${activity}`;
    if (closedSlots[key]) return false;
  }

  const sameDayReservations = reservations.filter((r) => r.date === date && r.activity === activity);
  for (const res of sameDayReservations) {
    if (res.id === reservationIdToIgnore) continue;
    if (
      (startTime >= res.startTime && startTime < res.endTime) ||
      (endTime > res.startTime && endTime <= res.endTime) ||
      (startTime <= res.startTime && endTime >= res.endTime)
    ) {
      return false;
    }
  }
  return true;
}

module.exports = { isTimeSlotAvailable, isQkSlotAvailable, describeSlotConflict, TIME_SLOT_STEP };
