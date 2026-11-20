import asyncio, json, sys, os, subprocess, time
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:8765/index.html'
errors = []
async def new_page(b, w, h):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True, permissions=['microphone', 'camera'])
    p = await ctx.new_page()
    p.on('console', lambda m: errors.append(f'[{w}x{h}] {m.type}: {m.text}') if m.type in ('error',) else None)
    p.on('pageerror', lambda e: errors.append(f'[{w}x{h}] pageerror: {e}'))
    return ctx, p
async def layout_check(p, tag):
    r = await p.evaluate('''() => {
      const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      const main = R(document.querySelector('main')), nav = R(document.querySelector('.tabs')), hdr = R(document.querySelector('.top'));
      const items = {}; for (const s of ['.case-bar', '.wheel .wcard.center', '#deck', '.ctrl', '#kConv', '#hitVol']) items[s] = R(document.querySelector(s));
      return { main, nav, hdr, items, docW: document.documentElement.scrollWidth, winW: innerWidth, scale: getComputedStyle(document.querySelector('#stage')).getPropertyValue('--s') };
    }''')
    probs = []
    for k, b in r['items'].items():
        if not b: probs.append(f'missing {k}'); continue
        if b[1] < r['main'][1] - 1 or b[3] > r['main'][3] + 1: probs.append(f'{k} outside main vertically {b} vs {r["main"]}')
        if b[0] < -1 and k != '#deck' or b[2] > r['winW'] + 1 and k != '#deck': probs.append(f'{k} outside horizontally {b}')
    if r['docW'] > r['winW']: probs.append(f'horizontal overflow {r["docW"]}>{r["winW"]}')
    print(tag, 'scale', r['scale'], 'OK' if not probs else probs)
    return probs
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--directory', os.path.join(os.path.dirname(__file__), '..', 'dist')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
            allprobs = []
            for (w, h) in [(320, 568), (360, 640), (375, 667), (390, 664), (390, 844), (430, 932), (768, 1024)]:
                ctx, p = await new_page(b, w, h)
                await p.goto(URL); await p.wait_for_timeout(900)
                allprobs += await layout_check(p, f'home {w}x{h}')
                await p.screenshot(path=f'{OUT}/home_{w}x{h}.png')
                await ctx.close()
            # flow test
            ctx, p = await new_page(b, 390, 664)
            await p.goto(URL); await p.wait_for_timeout(800)
            # swipe wheel left by dragging
            wb = await p.locator('#wheel').bounding_box()
            cx, cy = wb['x'] + wb['width'] / 2, wb['y'] + wb['height'] / 2
            await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 60, cy, steps=6); await p.mouse.move(cx - 140, cy, steps=6); await p.mouse.up()
            await p.wait_for_timeout(900)
            sel = await p.evaluate('VOXM_DEBUG.S.selectedId'); print('after swipe selected:', sel)
            await p.screenshot(path=f'{OUT}/flow1_swiped.png')
            # drag center card down into driver
            c = await p.locator('.wcard.center').bounding_box()
            x, y = c['x'] + c['width'] / 2, c['y'] + c['height'] / 2
            await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x, y + 40, steps=5); await p.mouse.move(x, y + 120, steps=8)
            await p.wait_for_timeout(150); await p.screenshot(path=f'{OUT}/flow2_dragging.png')
            await p.mouse.up(); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/flow3_inserting.png')
            await p.wait_for_timeout(700)
            ins = await p.evaluate('VOXM_DEBUG.S.insertedId'); print('inserted:', ins)
            await p.screenshot(path=f'{OUT}/flow4_inserted.png')
            # power on (fake mic)
            await p.click('#kConv'); await p.wait_for_timeout(2500)
            st = await p.evaluate('({s:VOXM_DEBUG.VoxEngine.status.state, k:VOXM_DEBUG.VoxEngine.status.coreKind, f0:VOXM_DEBUG.VoxEngine.status.f0, lat:VOXM_DEBUG.VoxEngine.latencyMs(), err:VOXM_DEBUG.VoxEngine.status.error})')
            print('engine:', st)
            await p.screenshot(path=f'{OUT}/flow5_live.png')
            # record 2s
            await p.click('#kRec'); await p.wait_for_timeout(2200); await p.click('#kRec'); await p.wait_for_timeout(800)
            print('recordings:', await p.evaluate('VOXM_DEBUG.S.recordings.map(r=>[r.name,r.mime,r.size])'))
            # tap another card while inserted -> swap
            await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 130, cy, steps=8); await p.mouse.up(); await p.wait_for_timeout(900)
            await p.click('.wcard.center'); await p.wait_for_timeout(1800)
            print('swapped to:', await p.evaluate('VOXM_DEBUG.S.insertedId'))
            await p.screenshot(path=f'{OUT}/flow6_swapped.png')
            # FX
            await p.click('.tab[data-tab=fx]'); await p.wait_for_timeout(300)
            await p.click('[data-fx=echo]'); await p.click('[data-fx=robot]'); await p.wait_for_timeout(300)
            await p.screenshot(path=f'{OUT}/fx.png', full_page=False)
            print('params:', await p.evaluate('JSON.stringify(VOXM_DEBUG.combinedParams())'))
            # memory chips / cases
            await p.click('.tab[data-tab=memory]'); await p.wait_for_timeout(400); await p.screenshot(path=f'{OUT}/memory_chips.png')
            await p.click('[data-chip]'); await p.wait_for_timeout(500); await p.screenshot(path=f'{OUT}/memory_chip_sheet.png')
            await p.click('.sheet [data-close]'); await p.wait_for_timeout(200)
            await p.click('[data-mt=cases]'); await p.wait_for_timeout(400); await p.screenshot(path=f'{OUT}/memory_cases.png')
            await p.click('#autoGroup'); await p.wait_for_timeout(500); await p.screenshot(path=f'{OUT}/memory_autogroup.png')
            await p.click('#agGo'); await p.wait_for_timeout(400)
            print('cases:', await p.evaluate('VOXM_DEBUG.S.cases.map(k=>k.name+":"+k.chipIds.length)'))
            # create character chip
            await p.click('.tab[data-tab=create]'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/create1.png')
            await p.click('[data-t=character]'); await p.wait_for_timeout(300)
            await p.click('[data-pre=c_monster]'); await p.wait_for_timeout(200)
            await p.fill('#cName', 'ダークナイト'); await p.screenshot(path=f'{OUT}/create2.png')
            await p.click('#cNext'); await p.wait_for_timeout(300); await p.screenshot(path=f'{OUT}/create4.png')
            await p.click('#cSave'); await p.wait_for_timeout(900)
            print('created:', await p.evaluate('VOXM_DEBUG.S.chips.slice(-1).map(c=>c.name+" "+JSON.stringify(c.profile))'))
            await p.screenshot(path=f'{OUT}/after_create_home.png')
            # create friend chip with fake mic recording (fake device = beep tone; analysis may fail → that's expected)
            await p.click('.tab[data-tab=output]'); await p.wait_for_timeout(500); await p.screenshot(path=f'{OUT}/output.png')
            await p.screenshot(path=f'{OUT}/output_full.png', full_page=True)
            # settings
            await p.click('#btnSettings'); await p.wait_for_timeout(400); await p.screenshot(path=f'{OUT}/settings.png')
            await ctx.close()
            await b.close()
            print('LAYOUT PROBLEMS:', allprobs)
    finally:
        srv.terminate()
    print('ERRORS:', json.dumps(errors, ensure_ascii=False, indent=1))
asyncio.run(main())
