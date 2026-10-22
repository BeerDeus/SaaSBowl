/* Fabrique un guide PDF à partir de son texte (guides/<nom>.mjs) et de vraies captures du CRM.
     node docs/source/generer.mjs creer-une-activite
   1. Chrome sans fenêtre ouvre le CRM (sandbox neuve, données de démonstration), joue les étapes du guide
      (vrais clics, vraies saisies), entoure et numérote les éléments expliqués, prend les captures ;
   2. la page du guide est assemblée, puis imprimée en PDF dans docs/. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrir, pause, RACINE } from './chrome.mjs';

const ICI = path.join(RACINE, 'docs', 'source');
/* la collection : tous les guides de guides/, dans leur ordre ; « tous » les refait l'un après l'autre */
const COLLECTION = (await Promise.all(fs.readdirSync(path.join(ICI, 'guides')).filter(f => f.endsWith('.mjs'))
  .map(async f => Object.assign({ nom: f.replace(/\.mjs$/, '') }, (await import('./guides/' + f)).default)))).sort((x, y) => (x.ordre ?? 99) - (y.ordre ?? 99));
const demande = process.argv[2] || 'guide-general';
if (demande === 'tous') {
  const { execFileSync } = await import('node:child_process');
  for (const g of COLLECTION) execFileSync(process.execPath, [fileURLToPath(import.meta.url), g.nom], { stdio: 'inherit' });
  process.exit(0);
}
const nom = demande, G = COLLECTION.find(g => g.nom === nom);
if (!G) { console.log('Guide inconnu : ' + nom + '. Guides : ' + COLLECTION.map(g => g.nom).join(', ') + ', ou « tous ».'); process.exit(1); }
const CAPT = path.join(ICI, 'captures', nom);
fs.rmSync(CAPT, { recursive: true, force: true }); fs.mkdirSync(CAPT, { recursive: true });

/* Outils glissés dans la page du CRM : trouver un élément (sélecteur CSS, ou { css, txt } = le plus petit élément qui contient ce texte),
   cliquer, saisir, entourer, mesurer la zone à capturer. */
const OUTILS = `window.__doc = (() => {
  const net = s => String(s || '').replace(/\\s+/g, ' ').trim();
  const el = s => { if (!s) return null; if (typeof s === 'string') return document.querySelector(s);
    if (s.sel) { const e = document.querySelector(s.sel); return e && s.parent ? e.closest(s.parent) : e; }       // { sel, parent } : l'ancêtre d'un champ
    const racine = s.dans ? el(s.dans) : document; if (!racine) return null;              // { dans } : chercher seulement à l'intérieur d'un élément
    const L = [...racine.querySelectorAll(s.css || '*')].filter(e => e.offsetParent !== null && (!s.txt || net(e.textContent).includes(s.txt)));
    L.sort((a, b) => net(a.textContent).length - net(b.textContent).length); return L[s.i || 0] || null; };
  const doit = (s) => { const e = el(s); if (!e) throw new Error('Introuvable : ' + JSON.stringify(s)); return e; };
  const rect = specs => { const R = [].concat(specs).map(s => doit(s).getBoundingClientRect()).filter(r => r.width || r.height);
    const x = Math.min(...R.map(r => r.left)), y = Math.min(...R.map(r => r.top)), X = Math.max(...R.map(r => r.right)), Y = Math.max(...R.map(r => r.bottom));
    return { x: x + scrollX, y: y + scrollY, w: X - x, h: Y - y }; };
  const rendre = () => { const app = document.getElementById('app'); if (app && window.rendre) app.innerHTML = window.rendre(); };
  return {
    el, rect, rendre,
    clic(s) { doit(s).click(); },
    saisir(s, v) { const e = doit(s); e.focus(); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); },
    choisir(s, v) { const e = doit(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); },
    marquer(marques) {
      const box = document.createElement('div'); box.id = '__marques'; box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none';
      document.body.appendChild(box); const o = box.getBoundingClientRect(), ox = o.left + scrollX, oy = o.top + scrollY, B = [];
      marques.forEach(m => { const r = rect(m.cible), p = m.marge == null ? 5 : m.marge;
        const c = document.createElement('div'); c.style.cssText = 'position:absolute;border:3px solid #e8590c;border-radius:7px;box-shadow:0 0 0 2px #fff,0 2px 10px rgba(232,89,12,.35)';
        Object.assign(c.style, { left: r.x - p - ox + 'px', top: r.y - p - oy + 'px', width: r.w + 2 * p + 'px', height: r.h + 2 * p + 'px' }); box.appendChild(c);
        if (m.n == null) return;
        const b = document.createElement('div'), cote = m.cote || 'gauche'; b.textContent = m.n;
        b.style.cssText = 'position:absolute;width:26px;height:26px;border-radius:50%;background:#e8590c;color:#fff;font:700 15px/26px Barlow,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.3)';
        const bx = cote === 'droite' ? r.x + r.w + p - 7 : r.x - p - 19, by = cote === 'bas' ? r.y + r.h + p - 7 : r.y - p - 19;
        Object.assign(b.style, { left: bx - ox + 'px', top: by - oy + 'px' }); box.appendChild(b); B.push([bx - 3, by - 3, bx + 29, by + 29]); });
      return B;            // la place des numéros : la photo s'élargit pour ne pas les couper
    },
    effacer() { const b = document.getElementById('__marques'); if (b) b.remove(); }
  };
})();`;

const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + ' s]', ...a);
log('Chrome : démarrage');
const c = await ouvrir({ largeur: 1440, hauteur: 1000, echelle: 2 });
try {
  log('page /maquettes/e-v2.html (le CRM crée les données de démonstration)');
  await c.charger('/maquettes/e-v2.html'); await pause(1800);
  let page = '/maquettes/e-v2.html', taille = '1440x1000';
  const etapes = G.sections.flatMap(s => s.blocs || []).flatMap(b => b.duo || [b]).filter(b => b.capture), rates = [];
  for (const b of etapes) {
    const k = b.capture, [L, H] = k.taille || [1440, 1000];
    try {
    if (L + 'x' + H !== taille) { await c.taille(L, H); taille = L + 'x' + H; }
    if (k.page && k.page !== page) { log('page', k.page); await c.charger(k.page); page = k.page; await pause(k.page.includes('e-v2') ? 1800 : 1200); }
    await c.evaluer(OUTILS);
    if (k.faire) { await c.evaluer(`(async () => { const D = __doc; ${k.faire} })()`); await pause(k.attente || 450); }
    await c.evaluer('__doc.effacer(); window.scrollTo(0, 0)');
    const numeros = k.marques ? await c.evaluer(`__doc.marquer(${JSON.stringify(k.marques)})`) : [];
    await pause(150);
    let clip;
    if (k.zone) { const r = await c.evaluer(`__doc.rect(${JSON.stringify(k.zone)})`), m = k.marge == null ? 18 : k.marge;
      let x0 = r.x - m, y0 = r.y - m, x1 = r.x + r.w + m, y1 = r.y + r.h + m;
      numeros.filter(([a, b, c2, d]) => a > x0 - 40 && c2 < x1 + 40 && b > y0 - 40 && d < y1 + 40)          // seulement les numéros collés à la zone
        .forEach(([a, b, c2, d]) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c2); y1 = Math.max(y1, d); });
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(L, k.lmax ? x0 + k.lmax : x1);
      clip = { x: x0, y: y0, width: x1 - x0, height: Math.min(k.hmax || 2400, y1 - y0) }; }
    else clip = { x: 0, y: 0, width: L, height: k.hauteur || H };
    const f = path.join(CAPT, k.nom + '.jpg');
    await c.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88, captureBeyondViewport: true, clip: Object.assign({ scale: 1 }, clip) })
      .then(r => fs.writeFileSync(f, Buffer.from(r.data, 'base64')));
    await c.evaluer('__doc.effacer()');
    log('capture', k.nom);
    } catch (e) { rates.push(k.nom); log('RATÉE', k.nom, '·', e.message.split(String.fromCharCode(10))[0]); }
  }

  /* --- la page du guide --- */
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const riche = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/«\s/g, '«&nbsp;').replace(/\s([»:;?!])/g, '&nbsp;$1');
  const bloc = b => {
    if (b.texte) return [].concat(b.texte).map(t => `<p>${riche(t)}</p>`).join('');
    if (b.etapes) return `<ol class="etapes">${b.etapes.map(t => `<li>${riche(t)}</li>`).join('')}</ol>`;
    if (b.liste) return `<ul>${b.liste.map(t => `<li>${riche(t)}</li>`).join('')}</ul>`;
    if (b.encadre) return `<div class="encadre ${b.genre || ''}"><b>${esc(b.titre || 'À savoir')}</b>${[].concat(b.encadre).map(t => `<p>${riche(t)}</p>`).join('')}</div>`;
    if (b.tableau) return `<table><thead><tr>${b.tableau[0].map(x => `<th>${riche(x)}</th>`).join('')}</tr></thead><tbody>${b.tableau.slice(1).map(l => `<tr>${l.map(x => `<td>${riche(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    if (b.capture) return `<div class="etape"><figure class="${b.capture.petite ? 'petite' : ''}">${rates.includes(b.capture.nom) ? '<div class="manque">Capture à venir</div>' : `<img src="captures/${nom}/${b.capture.nom}.jpg" alt="">`}${b.legende ? `<figcaption>${riche(b.legende)}</figcaption>` : ''}</figure>
      ${b.reperes ? `<ol class="reperes">${b.reperes.map(([n, t, d]) => `<li><span class="num">${n}</span><div><b>${riche(t)}</b>${d ? ' ' + riche(d) : ''}</div></li>`).join('')}</ol>` : ''}</div>`;
    if (b.options) return `<div class="options"><p class="o-titre">${riche(b.options)}</p><table><thead><tr><th>Option</th><th>Ce qui se passe</th>${b.deux ? '' : '<th>À choisir quand</th>'}</tr></thead><tbody>${b.lignes.map(l => `<tr>${l.map((x, i) => `<td>${i ? riche(x) : '<b>' + riche(x) + '</b>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (b.duo) return `<div class="duo">${b.duo.map(bloc).join('')}</div>`;
    if (b.saut) return '<div class="saut"></div>';
    return '';
  };
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(G.titre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="guide.css"></head><body>
<section class="couverture"><div class="c-haut"><img src="../../maquettes/logo.png" alt=""><span>${esc(G.collection || 'Guides du CRM')}</span></div>
  <div class="c-titre"><p class="c-sur">${esc(G.surtitre || '')}</p><h1>${esc(G.titre)}</h1><p class="c-sous">${riche(G.sousTitre || '')}</p></div>
  <div class="c-bas"><span>${esc(G.edition || '')}</span><span>SpaceBowling Engine</span></div></section>
<section class="sommaire">${G.intro ? `<div class="intro">${G.intro.map(t => `<p>${riche(t)}</p>`).join('')}</div>` : ''}<h2>Sommaire</h2><ol>${G.sections.map((s, i) => `<li><a href="#c${i + 1}"><span>${i + 1}</span>${esc(s.titre)}</a></li>`).join('')}</ol></section>
${G.sections.map((s, i) => { const B = (s.blocs || []).map(bloc); return `<section class="chap" id="c${i + 1}"><div class="debut"><header><span class="n">${i + 1}</span><h2>${esc(s.titre)}</h2></header>${s.chapeau ? `<p class="chapeau">${riche(s.chapeau)}</p>` : ''}${B[0] || ''}</div>${B.slice(1).join('')}</section>`; }).join('')}
<section class="collection"><h2>La collection des guides</h2><p class="chapeau">Tous les guides du CRM, refaits à partir du vrai logiciel. Ils se trouvent dans le dossier <b>docs</b>.</p>
<ol>${COLLECTION.map(g => `<li class="${g.nom === nom ? 'ici' : ''}"><b>${esc(g.surtitre ? g.titre + ' · ' + g.surtitre : g.titre)}</b>${g.nom === nom ? ' <span>(ce guide)</span>' : ''}<small>${riche(g.sousTitre || '')}</small><em>${esc(g.fichier || g.nom + '.pdf')}</em></li>`).join('')}</ol></section>
</body></html>`;
  const fHtml = path.join(ICI, nom + '.html');
  fs.writeFileSync(fHtml, html); log('PDF : page du guide écrite', fHtml);
  await c.taille(794, 1123);
  log('PDF : chargement de la page'); await c.charger('/docs/source/' + nom + '.html');
  log('PDF : attente des polices et des images'); await c.evaluer('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))))');
  await pause(500);
  const pied = `<div style="width:100%;font:8px Arial,sans-serif;color:#7a8a96;padding:0 15mm;display:flex;justify-content:space-between"><span>${esc(G.titre)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const sortie = path.join(RACINE, 'docs', G.fichier || nom + '.pdf');
  log('PDF : impression'); const ecrit = await c.pdf(sortie, { printBackground: true, preferCSSPageSize: true, generateDocumentOutline: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: pied, marginTop: 0, marginBottom: 0 });
  log('PDF prêt :', ecrit, rates.length ? '· captures ratées : ' + rates.join(', ') : '');
} finally { await c.fermer(); }
