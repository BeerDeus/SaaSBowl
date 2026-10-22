"""Lance la batterie de tests SpaceBowling (tests/index.html) dans Chrome ou Edge sans fenêtre.

    python tests/lancer.py                 tout
    python tests/lancer.py --suite Borne   une suite (Moteur, CRM, Borne, Synchronisation, Site web)
    python tests/lancer.py --test laser    les tests dont le nom contient « laser »
    python tests/lancer.py --voir          avec la fenêtre du navigateur, pour regarder

Un petit serveur local sert le dossier LaserGameTest, le navigateur tourne avec un profil temporaire
(sandbox vide, rien n'est touché ailleurs), la page envoie ses résultats au serveur.
Code de sortie : 0 si tout est bon, 1 sinon.
"""
import argparse, functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading, urllib.parse

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAVIGATEURS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]

class Silencieux(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], ConnectionError):   # le navigateur coupe une vidéo ou une image : pas une erreur
            super().handle_error(request, client_address)


resultat = {}
fini = threading.Event()


class Serveur(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path in ('/', '/index.html'):        # jamais le front Firebase de la racine
            self.send_response(302); self.send_header('Location', '/tests/index.html'); self.end_headers(); return
        super().do_GET()

    def do_POST(self):
        if self.path != '/__resultats':
            self.send_error(404); return
        n = int(self.headers.get('Content-Length', 0))
        resultat.update(json.loads(self.rfile.read(n) or b'{}'))
        self.send_response(204); self.end_headers()
        fini.set()


def main():
    ap = argparse.ArgumentParser(description='Batterie de tests SpaceBowling')
    ap.add_argument('--suite'); ap.add_argument('--test')
    ap.add_argument('--voir', action='store_true', help='afficher le navigateur')
    ap.add_argument('--delai', type=int, default=600, help='secondes avant abandon (600)')
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    nav = next((p for p in NAVIGATEURS if os.path.exists(p)), None) or shutil.which('chrome') or shutil.which('msedge')
    if not nav:
        print('Chrome ou Edge introuvable : ouvrez tests/index.html dans un navigateur à la place.'); return 2

    srv = Silencieux(('127.0.0.1', 0), functools.partial(Serveur, directory=RACINE))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    q = {'cli': '1'}
    if a.suite: q['suite'] = a.suite
    if a.test: q['test'] = a.test
    url = 'http://127.0.0.1:%d/tests/index.html?%s' % (srv.server_address[1], urllib.parse.urlencode(q))

    profil = tempfile.mkdtemp(prefix='sb-tests-')
    args = [nav, '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1000',
            '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
    if not a.voir:
        args += ['--headless=new', '--disable-gpu']
    print('Tests en cours (%s)…' % os.path.basename(nav), flush=True)
    p = subprocess.Popen(args + [url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        termine = fini.wait(a.delai)
    finally:
        p.kill(); p.wait()
        srv.shutdown()
        shutil.rmtree(profil, ignore_errors=True)
    if not termine:
        print('Pas de résultat après %d s : la page de tests est bloquée (ouvrez tests/index.html pour voir).' % a.delai); return 2

    R = resultat.get('resultats', [])
    suite = None
    for r in R:
        if r['suite'] != suite:
            suite = r['suite']; L = [x for x in R if x['suite'] == suite]
            print('\n%s  (%d/%d)' % (suite, sum(x['ok'] for x in L), len(L)))
        print('  %s %s  [%d ms]' % ('✔' if r['ok'] else '✘', r['nom'], r['ms']))
        if not r['ok']:
            print('      → ' + str(r['erreur']).strip().replace('\n', '\n        '))
    ko = sum(not r['ok'] for r in R)
    print('\n%s · %d tests · %s s' % ('TOUT EST BON' if not ko else '%d ÉCHEC%s' % (ko, 'S' if ko > 1 else ''), len(R), resultat.get('duree')))
    return 1 if ko else 0


if __name__ == '__main__':
    sys.exit(main())
