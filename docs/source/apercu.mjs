/* Aperçu d'un PDF des docs, page par page, pour le relire sans lecteur PDF :
     node docs/source/apercu.mjs "Guide - Créer une activité.pdf"
   Rend chaque page avec pdf.js (apercu/index.html) et les assemble en planches de 8 pages : docs/source/apercu/pages/<guide>-N.png */
import path from 'node:path';
import { ouvrir, RACINE } from './chrome.mjs';

const fichier = process.argv[2]; if (!fichier) { console.log('Indiquez le nom du PDF (dans docs/).'); process.exit(1); }
const SORTIE = path.join(RACINE, 'docs', 'source', 'apercu', 'pages');
const prefixe = fichier.replace(/\.pdf$/i, '').replace(/^Guide( - )?/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'guide';
const c = await ouvrir({ largeur: 1700, hauteur: 1200, echelle: 1 });
try {
  await c.charger('/docs/source/apercu/index.html?f=' + encodeURIComponent('/docs/' + fichier));
  const n = await c.evaluer('window.rendu');
  await c.evaluer(`document.body.style.cssText = 'margin:0;background:#888;display:grid;grid-template-columns:repeat(4,595px);gap:8px;padding:8px;width:max-content'`);
  for (let k = 0; k * 8 < n; k++) {
    const r = await c.evaluer(`(() => { const a = document.getElementById('p${k * 8 + 1}').getBoundingClientRect(), b = document.getElementById('p' + Math.min(${n}, ${k * 8 + 8})).getBoundingClientRect(); return { y: a.top + scrollY, h: b.bottom - a.top }; })()`);
    await c.capture(path.join(SORTIE, prefixe + '-' + (k + 1) + '.png'), { x: 0, y: r.y, width: 4 * 603 + 8, height: r.h });
  }
  console.log(n + ' pages · planches dans ' + SORTIE);
} finally { await c.fermer(); }
