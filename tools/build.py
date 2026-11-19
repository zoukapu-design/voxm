"""Build VOXM into a single self-contained index.html (+ PWA files for hosting)."""
import base64, glob, os, sys, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'dist')
os.makedirs(OUT, exist_ok=True)
rd = lambda p: open(os.path.join(SRC, p), encoding='utf-8').read()
def data_uri(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(open(path, 'rb').read()).decode()
ICON = data_uri(os.path.join(ROOT, 'assets', 'icon-64.png'), 'image/png')
assets = {k: data_uri(os.path.join(ROOT, 'assets', f'{k}.jpg'), 'image/jpeg') for k in ('friendA', 'friendB')}
app = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(SRC, 'app', '*.js'))))
dsp = rd('dsp-core.js')
def page(pwa):
    head_pwa = ('<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-512.png">' if pwa else '')
    return f'''<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#05060a">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="VOXM">
<title>VOXM — Voice Memory Transformer</title>{head_pwa}<link rel="icon" href="{ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Michroma&family=Sora:wght@200;300;400&display=swap" rel="stylesheet">
<style>{rd('styles.css')}</style></head>
<body><div id="app"></div>
<script type="text/plain" id="voxm-dsp-src">{dsp}</script>
<script>window.VOXM_PWA = {str(pwa).lower()}; window.VOXM_ASSETS = {json.dumps(assets)};</script>
<script>{dsp}</script>
<script>{rd('analysis.js')}</script>
<script>{rd('engine.js')}</script>
<script>{rd('store.js')}</script>
<script>(() => {{ 'use strict';
{app}
}})();</script>
</body></html>'''
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page(True))
open(os.path.join(OUT, 'voxm_standalone.html'), 'w', encoding='utf-8').write(page(False))
json.dump({"name": "VOXM — Voice Memory Transformer", "short_name": "VOXM", "start_url": "./", "display": "standalone",
           "background_color": "#05060a", "theme_color": "#05060a", "orientation": "portrait",
           "icons": [{"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}]},
          open(os.path.join(OUT, 'manifest.webmanifest'), 'w'), ensure_ascii=False, indent=1)
import shutil; shutil.copy(os.path.join(ROOT, 'assets', 'icon-512.png'), os.path.join(OUT, 'icon-512.png'))
open(os.path.join(OUT, 'sw.js'), 'w').write("""const C='voxm-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon-512.png'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp)).catch(()=>{});return r}).catch(()=>caches.match(e.request)))});
""")
print('built', os.path.getsize(os.path.join(OUT, 'index.html')) // 1024, 'KB')
