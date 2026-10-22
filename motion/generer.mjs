/* Filme une scène de motion design et l'enregistre en MP4 (H.264, 1080 × 1920, 30 images/s) pour les bornes.
     node motion/generer.mjs anniversaires            → borne/videos/anniversaires.mp4
     node motion/generer.mjs anniversaires --apercu   → quelques images clés dans motion/apercu/ (pour vérifier sans encoder)
   1. Chrome sans fenêtre ouvre motion/scenes/<nom>.html?rendu, à la taille exacte de la borne ;
   2. pour chaque image, toutes les animations sont figées au bon instant (__video.aller(t)), puis photographiées ;
   3. l'encodeur H.264 de Chrome (WebCodecs) compresse chaque image au débit DEBIT ; ce fichier range le tout dans un MP4.
   Rien à installer : Node 22+ et Chrome (ou Edge), comme pour les guides PDF. */
import fs from 'node:fs';
import path from 'node:path';
import { ouvrir, pause, RACINE } from '../docs/source/chrome.mjs';

const DEBIT = 7e6;                     // bits par seconde : ~1 Mo par seconde de vidéo, net sur les dégradés et les confettis
const nom = process.argv[2], apercu = process.argv.includes('--apercu');
const scene = path.join(RACINE, 'motion', 'scenes', nom + '.html');
if (!nom || !fs.existsSync(scene)) { console.log('Scène inconnue. Scènes : ' + fs.readdirSync(path.join(RACINE, 'motion', 'scenes')).map(f => f.replace('.html', '')).join(', ')); process.exit(1); }

/* l'encodeur, dans la page : reçoit les photos (JPEG en base64), rend les images compressées (format « avc » : NAL précédées de leur longueur) */
const ENCODEUR = (fps, l, h) => `window.__enc = (() => {
  const sorties = []; let avcC = null, erreur = null;
  const e = new VideoEncoder({ output: (m, meta) => { if (meta && meta.decoderConfig && meta.decoderConfig.description && !avcC) avcC = new Uint8Array(meta.decoderConfig.description); const b = new Uint8Array(m.byteLength); m.copyTo(b); sorties.push({ cle: m.type === 'key', t: m.timestamp, b }); }, error: x => { erreur = x.message; } });
  e.configure({ codec: 'avc1.640028', width: ${l}, height: ${h}, bitrate: ${DEBIT}, framerate: ${fps}, avc: { format: 'avc' } });
  const b64 = u8 => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(new Blob([u8])); });
  return {
    async image(jpeg, i) {
      const bmp = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + jpeg)).blob()), v = new VideoFrame(bmp, { timestamp: Math.round(i * 1e6 / ${fps}), duration: Math.round(1e6 / ${fps}) });
      e.encode(v, { keyFrame: i % ${fps * 2} === 0 }); v.close(); bmp.close();
      while (e.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 5));
      if (erreur) throw new Error(erreur);
    },
    async fin() {
      await e.flush(); if (erreur) throw new Error(erreur);
      window.__mp4 = await b64(new Blob(sorties.map(s => s.b)));      // relu par morceaux : d'un seul bloc, un gros message bloque la liaison avec Chrome
      return { avcC: await b64(avcC), longueur: __mp4.length, tailles: sorties.map(s => s.b.length), cles: sorties.map(s => s.cle), ordre: sorties.every((s, i) => !i || s.t > sorties[i - 1].t) };
    }
  };
})(); 'prêt'`;

/* MP4 minimal : une piste vidéo H.264, toutes les images d'un seul bloc (mdat), index en tête (lecture immédiate sur le web) */
function mp4({ largeur, hauteur, fps, avcC, donnees, tailles, cles }) {
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }, u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
  const boite = (type, ...p) => { const c = Buffer.concat(p.map(x => Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))); return Buffer.concat([u32(8 + c.length), Buffer.from(type, 'latin1'), c]); };
  const pleine = (type, flags, ...p) => boite(type, u32(flags), ...p);                 // version 0 + drapeaux
  const n = tailles.length, ms = Math.round(n * 1000 / fps), matrice = Buffer.concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));
  const ftyp = boite('ftyp', 'isom', u32(512), 'isomiso2avc1mp41');
  const moov = debut => boite('moov',
    pleine('mvhd', 0, u32(0), u32(0), u32(1000), u32(ms), u32(0x10000), u16(0x100), Buffer.alloc(10), matrice, Buffer.alloc(24), u32(2)),
    boite('trak',
      pleine('tkhd', 3, u32(0), u32(0), u32(1), u32(0), u32(ms), Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), matrice, u32(largeur << 16), u32(hauteur << 16)),
      boite('mdia',
        pleine('mdhd', 0, u32(0), u32(0), u32(fps), u32(n), u16(0x55c4), u16(0)),
        pleine('hdlr', 0, u32(0), 'vide', Buffer.alloc(12), 'SpaceBowling\0'),
        boite('minf', pleine('vmhd', 1, Buffer.alloc(8)), boite('dinf', pleine('dref', 0, u32(1), pleine('url ', 1))),
          boite('stbl',
            pleine('stsd', 0, u32(1), boite('avc1', Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(largeur), u16(hauteur), u32(0x480000), u32(0x480000), u32(0), u16(1), Buffer.alloc(32), u16(0x18), u16(-1), boite('avcC', avcC))),
            pleine('stts', 0, u32(1), u32(n), u32(1)),
            pleine('stss', 0, u32(cles.filter(Boolean).length), ...cles.map((k, i) => k ? u32(i + 1) : null).filter(Boolean)),
            pleine('stsc', 0, u32(1), u32(1), u32(n), u32(1)),
            pleine('stsz', 0, u32(0), u32(n), ...tailles.map(u32)),
            pleine('stco', 0, u32(1), u32(debut)))))));
  const taille = moov(0).length;                     // l'index ne change pas de taille avec l'adresse des données
  return Buffer.concat([ftyp, moov(ftyp.length + taille + 8), u32(8 + donnees.length), Buffer.from('mdat'), donnees]);
}

const c = await ouvrir({ largeur: 1080, hauteur: 1920, echelle: 1 });
try {
  await c.charger('/motion/scenes/' + nom + '.html?rendu');
  await c.evaluer('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))))');
  await pause(300);
  const { duree, fps } = await c.evaluer('({ duree: __video.duree, fps: __video.fps })');
  const n = Math.round(duree * fps), quand = apercu ? [...new Set([.02, .07, .13, .26, .36, .47, .6, .69, .78, .9, .995].map(f => f * duree).map(t => Math.round(t * fps)))] : [...Array(n).keys()];
  const dossierApercu = path.join(RACINE, 'motion', 'apercu');
  if (apercu) { fs.rmSync(dossierApercu, { recursive: true, force: true }); fs.mkdirSync(dossierApercu, { recursive: true }); }
  else await c.evaluer(ENCODEUR(fps, 1080, 1920));
  const t0 = Date.now();
  for (const [k, i] of quand.entries()) {
    await c.evaluer(`__video.aller(${i / fps}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const { data } = await c.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
    if (apercu) fs.writeFileSync(path.join(dossierApercu, nom + '-' + (i / fps).toFixed(2) + 's.jpg'), Buffer.from(data, 'base64'));
    else await c.evaluer(`__enc.image('${data}', ${i})`);
    if (k % 30 === 0) process.stdout.write(`\r${k + 1}/${quand.length} images (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log(`\r${quand.length} images en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (apercu) console.log('Aperçu : ' + path.relative(RACINE, dossierApercu));
  else {
    const r = await c.evaluer('__enc.fin()');
    if (!r.ordre || r.tailles.length !== n) throw new Error('encodage inattendu : ' + r.tailles.length + ' images sur ' + n + (r.ordre ? '' : ', dans le désordre'));
    const sortie = path.join(RACINE, 'borne', 'videos', nom + '.mp4');
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    let b64 = ''; for (let k = 0; k < r.longueur; k += 1 << 20) b64 += await c.evaluer(`__mp4.slice(${k}, ${k + (1 << 20)})`);
    fs.writeFileSync(sortie, mp4({ largeur: 1080, hauteur: 1920, fps, avcC: Buffer.from(r.avcC, 'base64'), donnees: Buffer.from(b64, 'base64'), tailles: r.tailles, cles: r.cles }));
    console.log('Vidéo : ' + path.relative(RACINE, sortie) + ' (' + (fs.statSync(sortie).size / 1e6).toFixed(1) + ' Mo, ' + duree + ' s)');
  }
} finally {
  await c.fermer();
}
