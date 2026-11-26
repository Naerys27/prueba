// Versión visible en el menú (formato año.mes.número, desde 2026.11.2). La versión se escribe una sola
// vez, en sw.js, y de ahí salen el nombre de la caché y el texto del menú (lo pide al SW que controla
// la página, así muestra la versión que de verdad se está usando).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { nuevaPagina } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const m = sw.match(/^const VERSION = '([^']+)';$/m);
  const version = m ? m[1] : null;
  ok('sw.js define VERSION con formato año.mes.número', !!version && /^\d{4}\.(1[0-2]|[1-9])\.[1-9]\d*$/.test(version), version);
  ok('sw.js saca el nombre de la caché de VERSION', /^const CACHE = 'partes-loco-' \+ VERSION;$/m.test(sw));

  const page = await nuevaPagina(browser);
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => { const e = document.getElementById('app-version'); return e && e.textContent; }, null, { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate(async () => ({
    texto: document.getElementById('app-version') ? document.getElementById('app-version').textContent : null,
    caches: await caches.keys()
  }));
  ok('el menú muestra "Versión ' + version + '"', r.texto === 'Versión ' + version, JSON.stringify(r));
  ok('la caché se llama partes-loco-' + version + ' y no queda otra', r.caches.length === 1 && r.caches[0] === 'partes-loco-' + version, JSON.stringify(r.caches));
  ok('no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
  await page.close();

  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
