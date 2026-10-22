/* Outil des docs : un petit serveur sur le dossier LaserGameTest et un Chrome sans fenêtre piloté par le protocole
   DevTools (WebSocket intégré à Node 22+). Profil temporaire : sandbox neuve, données de démonstration du CRM. */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };
const NAVIGATEURS = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
export const pause = ms => new Promise(r => setTimeout(r, ms));

function serveur() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(RACINE, u);
    if (u === '/' || !f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

export async function ouvrir({ largeur = 1440, hauteur = 900, echelle = 2 } = {}) {
  const srv = await serveur(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = NAVIGATEURS.find(p => fs.existsSync(p)); if (!nav) throw new Error('Chrome ou Edge introuvable');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-docs-')), port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(nav, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=' + largeur + ',' + hauteur, 'about:blank'], { stdio: 'ignore' });
  let cibles = null;
  for (let k = 0; k < 100 && !cibles; k++) { await pause(150); cibles = await fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json()).catch(() => null); }
  const page = (cibles || []).find(c => c.type === 'page'); if (!page) throw new Error('Chrome ne répond pas');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const attente = new Map(), ecouteurs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && attente.has(m.id)) { const [ok, ko] = attente.get(m.id); attente.delete(m.id); m.error ? ko(new Error(m.error.message)) : ok(m.result); } else if (m.method) ecouteurs.forEach(f => f(m)); };
  const cdp = (method, params = {}) => new Promise((ok, ko) => { const i = ++id; attente.set(i, [ok, ko]); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const taille = (l, h) => cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: echelle, mobile: false });
  await taille(largeur, hauteur);

  const limite = (p, ms, quoi) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('délai dépassé : ' + quoi)), ms))]);
  const evaluer = async (expr) => {
    const r = await limite(cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), 30000, expr.slice(0, 80));
    if (r.exceptionDetails) throw new Error('JS : ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) + '\n' + expr.slice(0, 300));
    return r.result.value;
  };
  const charger = async (url) => {
    const fin = new Promise(r => { const f = m => { if (m.method === 'Page.loadEventFired') { ecouteurs.splice(ecouteurs.indexOf(f), 1); r(); } }; ecouteurs.push(f); });
    await cdp('Page.navigate', { url: url.startsWith('http') ? url : base + url }); await Promise.race([fin, pause(15000)]); await pause(400);
  };
  const capture = async (fichier, clip) => {
    const r = await cdp('Page.captureScreenshot', Object.assign({ format: 'png', captureBeyondViewport: !!clip }, clip ? { clip: Object.assign({ scale: 1 }, clip) } : {}));
    fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.writeFileSync(fichier, Buffer.from(r.data, 'base64'));
  };
  /* le PDF arrive par morceaux de 1 Mo : d'un seul bloc, un gros guide (beaucoup de captures) bloque la liaison avec Chrome */
  const pdf = async (fichier, opts) => {
    const r = await cdp('Page.printToPDF', Object.assign({ transferMode: 'ReturnAsStream' }, opts)), morceaux = [];
    for (;;) { const x = await cdp('IO.read', { handle: r.stream, size: 1 << 20 }); morceaux.push(Buffer.from(x.data, x.base64Encoded ? 'base64' : 'binary')); if (x.eof) break; }
    await cdp('IO.close', { handle: r.stream });
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    try { fs.writeFileSync(fichier, Buffer.concat(morceaux)); return fichier; }
    catch (e) { if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;          // PDF ouvert dans un lecteur : on écrit à côté
      const autre = fichier.replace(/\.pdf$/i, ' (nouvelle version).pdf'); fs.writeFileSync(autre, Buffer.concat(morceaux)); return autre; }
  };
  const fermer = async () => { try { ws.close(); } catch (e) {} chrome.kill(); srv.close(); await pause(300); try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {} };
  return { base, cdp, evaluer, charger, capture, pdf, taille, fermer };
}
