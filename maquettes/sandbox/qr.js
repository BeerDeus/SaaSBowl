/* =====================================================================
   QR codes des tickets CE et codes promo : chaque code a le sien, calculé
   à partir de son texte (rien à stocker, rien à installer).
     QR.matrice('L2026-07-0002-3508') → lignes de booléens (true = module noir)
     QR.svg('L2026-07-0002-3508')     → <svg> net à toute taille, marge de 4 modules
   Norme ISO/IEC 18004 : mode octet (UTF-8), correction d'erreur M (15 %),
   versions 1 à 6 (jusqu'à 106 octets, largement assez pour un code).
   Lu par les téléphones et par la scannette des bornes (mode clavier : elle tape le texte).
   ===================================================================== */
(function () {
  'use strict';
  const ECC = [0, 10, 16, 26, 18, 24, 16];                   // codes correcteurs par bloc, niveau M, versions 1 à 6
  const BLOCS = [0, 1, 1, 1, 2, 2, 4];                        // nombre de blocs
  const modulesUtiles = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) r -= (25 * 2 - 10) * 2 - 55; return r; };   // hors motifs fixes (2 repères d'alignement jusqu'à v6)
  const capacite = v => Math.floor(modulesUtiles(v) / 8) - ECC[v] * BLOCS[v];      // octets de données

  /* Reed-Solomon sur GF(256), polynôme 0x11D */
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
  function diviseur(n) {
    const r = new Array(n).fill(0); r[n - 1] = 1; let racine = 1;
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { r[j] = mul(r[j], racine); if (j + 1 < n) r[j] ^= r[j + 1]; } racine = mul(racine, 2); }
    return r;
  }
  function reste(donnees, div) {
    const r = div.map(() => 0);
    for (const b of donnees) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); }
    return r;
  }

  function matrice(texte) {
    const octets = Array.from(new TextEncoder().encode(String(texte)));
    let v = 1; while (v <= 6 && 12 + 8 * octets.length > capacite(v) * 8) v++;
    if (v > 6) throw new Error('Texte trop long pour un QR code (106 octets au plus)');
    /* 1. les données : mode octet (0100), longueur sur 8 bits, octets, fin, puis remplissage 0xEC 0x11 */
    const bits = [], ajouter = (n, l) => { for (let i = l - 1; i >= 0; i--) bits.push((n >>> i) & 1); };
    ajouter(4, 4); ajouter(octets.length, 8); octets.forEach(o => ajouter(o, 8));
    const cap = capacite(v) * 8;
    ajouter(0, Math.min(4, cap - bits.length)); ajouter(0, (8 - bits.length % 8) % 8);
    for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) ajouter(p, 8);
    const donnees = []; for (let i = 0; i < bits.length; i += 8) donnees.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
    /* 2. découpe en blocs, codes correcteurs, entrelacement */
    const brut = Math.floor(modulesUtiles(v) / 8), nb = BLOCS[v], e = ECC[v], courts = nb - brut % nb, long = Math.floor(brut / nb), div = diviseur(e), blocs = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const d = donnees.slice(k, k + long - e + (i < courts ? 0 : 1)); k += d.length;
      const c = reste(d, div); if (i < courts) d.push(0); blocs.push(d.concat(c));
    }
    const mots = []; for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== long - e || j >= courts) mots.push(b[i]); });
    /* 3. motifs fixes : repères, lignes de synchronisation, alignement, zone du format */
    const n = 17 + 4 * v, M = Array.from({ length: n }, () => new Array(n).fill(false)), fixe = Array.from({ length: n }, () => new Array(n).fill(false));
    const poser = (x, y, noir) => { M[y][x] = noir; fixe[y][x] = true; };
    for (let i = 0; i < n; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < n && y >= 0 && y < n) poser(x, y, d !== 2 && d !== 4); } });
    if (v >= 2) { const a = n - 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const format = masque => {                                // niveau M (00) + masque, BCH(15,5), xor 0x5412
      let r = masque; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const f = ((masque << 10) | r) ^ 0x5412, b = i => ((f >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) poser(8, i, b(i));
      poser(8, 7, b(6)); poser(8, 8, b(7)); poser(7, 8, b(8));
      for (let i = 9; i < 15; i++) poser(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) poser(n - 1 - i, 8, b(i));
      for (let i = 8; i < 15; i++) poser(8, n - 15 + i, b(i));
      poser(8, n - 8, true);                                  // module noir obligatoire
    };
    format(0);
    /* 4. les mots en zigzag, deux colonnes à la fois, de bas en haut puis de haut en bas */
    let i = 0;
    for (let droite = n - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = droite - j, y = ((droite + 1) & 2) === 0 ? n - 1 - vert : vert;
        if (!fixe[y][x] && i < mots.length * 8) { M[y][x] = ((mots[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    /* 5. le masque le plus lisible (pénalités : longues suites, carrés 2 × 2, équilibre noir / blanc) */
    const COND = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const masquer = m => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixe[y][x] && COND[m](x, y)) M[y][x] = !M[y][x]; };
    const penalite = () => {
      let p = 0, noirs = 0;
      for (let k = 0; k < 2; k++) for (let a = 0; a < n; a++) { let suite = 1; for (let b = 1; b <= n; b++) { const c = b < n && (k ? M[b][a] : M[a][b]) === (k ? M[b - 1][a] : M[a][b - 1]); if (c) suite++; else { if (suite >= 5) p += suite - 2; suite = 1; } } }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (M[y][x]) noirs++; if (x < n - 1 && y < n - 1 && M[y][x] === M[y][x + 1] && M[y][x] === M[y + 1][x] && M[y][x] === M[y + 1][x + 1]) p += 3; }
      return p + 10 * (Math.ceil(Math.abs(noirs * 20 - n * n * 10) / (n * n)) - 1);
    };
    let meilleur = 0, min = Infinity;
    for (let m = 0; m < 8; m++) { masquer(m); format(m); const p = penalite(); if (p < min) { min = p; meilleur = m; } masquer(m); }
    masquer(meilleur); format(meilleur);
    return M;
  }

  function svg(texte, attrs) {
    const M = matrice(texte), n = M.length; let d = '';
    M.forEach((ligne, y) => ligne.forEach((noir, x) => { if (noir) d += `M${x} ${y}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" class="qr" viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code ${String(texte).replace(/[&<>"]/g, '')}" ${attrs || ''}><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  (typeof window !== 'undefined' ? window : globalThis).QR = { matrice, svg };
})();
