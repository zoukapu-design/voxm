import asyncio, subprocess, sys, os, time, json
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__))
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--directory', D + '/../dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
    errs = []
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
            ctx = await b.new_context(viewport={'width': 390, 'height': 664}, device_scale_factor=2, has_touch=True, is_mobile=True)
            p = await ctx.new_page()
            p.on('pageerror', lambda e: errs.append(str(e)))
            p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await p.goto('http://localhost:8765/index.html#create'); await p.wait_for_timeout(700)
            await p.click('[data-t=friend]'); await p.fill('#cName', 'ゆうき'); await p.click('#cNext'); await p.wait_for_timeout(300)
            await p.click('#cConsent'); await p.wait_for_timeout(200)
            await p.set_input_files('#baseBox [data-f]', D + '/me.wav'); await p.wait_for_timeout(2500)
            await p.set_input_files('#sampleBox [data-f]', D + '/friend.wav'); await p.wait_for_timeout(3500)
            await p.screenshot(path=D + '/shots/friend_analysis.png', full_page=True)
            print('draft profile:', await p.evaluate('JSON.stringify(VOXM_DEBUG.S.baseline && {base: Math.round(VOXM_DEBUG.S.baseline.f0)})'))
            await p.click('#cNext'); await p.wait_for_timeout(400)
            await p.click('#cBase'); await p.wait_for_timeout(1500)
            await p.screenshot(path=D + '/shots/friend_tune.png')
            await p.click('#cSave'); await p.wait_for_timeout(1200)
            c = await p.evaluate('(() => { const c = VOXM_DEBUG.S.chips[VOXM_DEBUG.S.chips.length-1]; return {name:c.name, profile:c.profile, analysis:c.analysis, consent:!!c.consent, sample:!!c.sampleKey}; })()')
            print('friend chip:', json.dumps(c, ensure_ascii=False))
            await p.screenshot(path=D + '/shots/friend_home.png')
            # insert it and convert a file
            await p.click('.wcard.center'); await p.wait_for_timeout(1000)
            await p.click('.tab[data-tab=output]'); await p.wait_for_timeout(300)
            await p.set_input_files('[data-act=file]', D + '/me.wav'); await p.wait_for_timeout(3000)
            print('recordings:', await p.evaluate('VOXM_DEBUG.S.recordings.map(r=>r.name+" "+r.mime+" "+r.seconds.toFixed(1))'))
            # camera
            await p.click('[data-act=cam]'); await p.wait_for_timeout(1500)
            await p.click('.cam .shutter'); await p.wait_for_timeout(2000); await p.screenshot(path=D + '/shots/camera.png')
            await p.click('.cam .shutter'); await p.wait_for_timeout(1500)
            print('after video:', await p.evaluate('VOXM_DEBUG.S.recordings.map(r=>r.kind+" "+r.mime)'))
            await p.screenshot(path=D + '/shots/video_saved.png')
            # reload persistence
            await p.reload(); await p.wait_for_timeout(1200)
            print('after reload chips:', await p.evaluate('VOXM_DEBUG.S.chips.length'), 'inserted:', await p.evaluate('JSON.stringify(VOXM_DEBUG.S.slots)'), 'recs:', await p.evaluate('VOXM_DEBUG.S.recordings.length'))
            await p.screenshot(path=D + '/shots/after_reload.png')
            await b.close()
    finally:
        srv.terminate()
    print('ERRORS', errs)
asyncio.run(main())
