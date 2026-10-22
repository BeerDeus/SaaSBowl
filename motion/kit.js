/* =====================================================================
   Kit de motion design SpaceBowling (outil interne, jamais envoyé sur Hostinger).
   Une scène = une page HTML de 1080 × 1920 animée en CSS (animations avec délais).
   · ouverte dans un navigateur : elle tourne en boucle, réduite à la taille de la fenêtre,
     avec une barre pour mettre en pause et choisir l'instant ;
   · ?rendu : generer.mjs la filme image par image (__video.aller(t)), puis l'encode en MP4.
   Hasard « à graine » : la même scène donne toujours la même vidéo.
   ===================================================================== */
(function () {
  'use strict';
  const RENDU = /[?&]rendu\b/.test(location.search);
  document.documentElement.classList.toggle('rendu', RENDU);

  /* hasard reproductible (mulberry32) */
  const graine = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const R = graine(2026);
  const entre = (a, b) => a + R() * (b - a);
  const f2 = n => n.toFixed(2);

  const KIT = window.KIT = {
    R, entre,
    /* un texte découpé en lettres (<span class="l" style="--i:n">) pour les animer une par une */
    lettres(el) { el.innerHTML = [...el.textContent].map((c, i) => `<span class="l" style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join(''); },
    /* ciel : n étoiles qui scintillent */
    etoiles(el, n) { el.innerHTML = Array.from({ length: n }, () => `<i style="left:${f2(entre(0, 100))}%;top:${f2(entre(0, 100))}%;--s:${f2(entre(2, 6))}px;--t:${f2(entre(1.6, 3.6))}s;animation-delay:-${f2(entre(0, 4))}s"></i>`).join(''); },
    /* explosion de confettis depuis (x, y), à l'instant a (s) */
    confettis(el, n, { x = 540, y = 800, a = 0, couleurs = ['#ff3d7f', '#00aee0', '#f5c542', '#fffdf9', '#d9272e', '#7fd4f2'] } = {}) {
      el.insertAdjacentHTML('beforeend', Array.from({ length: n }, () => {
        const ang = entre(-Math.PI, 0) + entre(-.35, .35), v = entre(320, 900), dx = Math.cos(ang) * v, dy = Math.sin(ang) * v;
        return `<i class="confetti" style="left:${x}px;top:${y}px;--dx:${f2(dx)}px;--dy:${f2(dy)}px;--chute:${f2(entre(900, 1500))}px;--r:${Math.round(entre(-900, 900))}deg;--c:${couleurs[Math.floor(R() * couleurs.length)]};--w:${f2(entre(14, 26))}px;--h:${f2(entre(8, 16))}px;--d:${f2(entre(2.2, 3.4))}s;animation-delay:${f2(a + entre(0, .08))}s"></i>`;
      }).join(''));
    },
    /* ballons qui montent : [x, retard, durée, couleur, taille] */
    ballons(el, L) {
      el.innerHTML = L.map(([x, a, d, c, k]) => `<div class="ballon" style="left:${x}px;--a:${a}s;--d:${d}s;--k:${k};--c:${c}"><svg viewBox="0 0 120 260"><path d="M60 8C28 8 8 34 8 66c0 40 30 72 52 80 22-8 52-40 52-80C112 34 92 8 60 8z" fill="var(--c)"/><path d="M60 146l-7 10h14z" fill="var(--c)"/><path d="M60 156c-10 20 10 34 0 52s8 30 0 48" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/><ellipse cx="40" cy="44" rx="11" ry="20" fill="#fff" opacity=".35" transform="rotate(-24 40 44)"/></svg></div>`).join('');
    }
  };

  /* ---- le temps : une seule horloge pour toutes les animations ---- */
  const duree = () => +(document.body.dataset.duree || 8);
  const toutes = () => document.getAnimations();
  window.__video = {
    fps: 30,
    get duree() { return duree(); },
    aller(t) { toutes().forEach(a => { a.pause(); a.currentTime = t * 1000; }); return t; }
  };

  /* ---- lecture dans le navigateur : la scène réduite, en boucle, avec une barre ---- */
  addEventListener('load', () => {
    if (RENDU) return;
    const sc = document.getElementById('scene'), ajuster = () => { const k = Math.min((innerWidth - 24) / 1080, (innerHeight - 70) / 1920); sc.style.transform = `scale(${k})`; sc.parentElement.style.width = 1080 * k + 'px'; sc.parentElement.style.height = 1920 * k + 'px'; };
    ajuster(); addEventListener('resize', ajuster);
    document.body.insertAdjacentHTML('beforeend', `<div class="barre"><button type="button" data-lecture>Pause</button><input type="range" min="0" max="${duree()}" step="0.01" value="0" aria-label="Instant"><output>0,00 s</output></div>`);
    const b = document.querySelector('[data-lecture]'), r = document.querySelector('.barre input'), o = document.querySelector('.barre output');
    let joue = true, t0 = performance.now(), t = 0;
    const montrer = () => { __video.aller(t); r.value = t; o.textContent = t.toFixed(2).replace('.', ',') + ' s'; };
    b.onclick = () => { joue = !joue; b.textContent = joue ? 'Pause' : 'Lecture'; t0 = performance.now() - t * 1000; };
    r.oninput = () => { joue = false; b.textContent = 'Lecture'; t = +r.value; montrer(); };
    (function boucle() { if (joue) { t = ((performance.now() - t0) / 1000) % duree(); montrer(); } requestAnimationFrame(boucle); })();
  });
})();
