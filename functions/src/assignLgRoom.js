// Port de resaTracker/src/renderPlanning.js — assignLgRoom
// Règle métier: <=12 joueurs -> salle du bas (Room 1, max 12), sinon -> salle du haut (Room 2, max 16)
function assignLgRoom(nbrParticipants) {
  return nbrParticipants <= 12
    ? { room: 1, label: 'Salle du bas (max 12)' }
    : { room: 2, label: 'Salle du haut (max 16)' };
}

module.exports = { assignLgRoom };
