// localStorage lleno (cuota real de Chromium, ~5,2 M caracteres) con fotos de combustible recientes.
// Caso real (oct 2026): JSON vinculado de ~6 MB y aviso "Almacenamiento lleno. Vincula un archivo JSON"
// al guardar, porque la copia local guardaba las fotos de los últimos 3 meses.
const { chromium } = require('playwright');
const { nuevaPagina, stubFS } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  const HK = 'partes_combustible_hist_v1';
  // Meses recientes respecto a HOY_TESTS (2026-07-15): no los quita la purga de fotos de >3 meses
  const MESES = ['2026-04', '2026-05', '2026-06', '2026-07'];
  const FOTOS_POR_MES = 5;
  const TAM_FOTO = 300000; // 4 meses x 5 fotos x 300 K = 6 M caracteres, por encima de la cuota

  async function abrir() {
    const page = await nuevaPagina(browser);
    page.on('dialog', d => d.accept());
    await page.addInitScript(stubFS);
    await page.addInitScript(() => {
      const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      window.__foto = n => { let s = 'data:image/jpeg;base64,'; for (let i = 0; i < n; i++) s += B64[Math.random() * 64 | 0]; return s; };
      window.__nFotos = h => Object.values(h || {}).reduce((s, r) => s + Object.keys(r.photos || {}).length, 0);
      window.__lsHist = () => JSON.parse(localStorage.getItem('partes_combustible_hist_v1') || '{}');
      window.__fileHist = () => (JSON.parse(window.__fileText || '{}').partes_combustible_hist_v1) || {};
      window.__appHist = () => JSON.parse(FSStorage.getItem('partes_combustible_hist_v1') || '{}');
    });
    await page.goto(BASE + '/parte_combustible.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/parte_combustible.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__errs = []; const o = showErr; showErr = m => { window.__errs.push(m); o(m); }; });
    return page;
  }

  // Vincula un archivo que ya tiene el histórico con fotos recientes
  async function vincularArchivoGrande(page) {
    return page.evaluate(async (a) => {
      const hist = {};
      a.MESES.forEach(mes => {
        const entries = [], photos = {};
        for (let i = 0; i < a.FOTOS_POR_MES; i++) {
          entries.push({ kms: String(1000 * (i + 1)), eur: '50', lit: '30', fecha: mes + '-0' + (i + 1), conductor: 'ANA' });
          photos[i] = { data: window.__foto(a.TAM_FOTO), w: 1000, h: 1400 };
        }
        hist['AAA1111/' + mes] = { mat: 'AAA1111', mes, tipo: 'gasolina', entries, photos, updatedAt: mes + '-20T10:00:00Z' };
      });
      window.__fileText = JSON.stringify({ [a.HK]: hist }, null, 2);
      return FSStorage.setup(true);
    }, { MESES, FOTOS_POR_MES, TAM_FOTO, HK });
  }

  async function guardarRepostajeConFoto(page, mes, kms) {
    await page.fill('#v_mes', mes); await page.locator('#v_mes').dispatchEvent('change');
    await page.fill('#v_mat', 'AAA1111'); await page.locator('#v_mat').dispatchEvent('change');
    await page.waitForTimeout(300);
    await page.fill('#nf_gk', kms); await page.fill('#nf_ge', '61.03'); await page.fill('#nf_gl', '32.90'); await page.fill('#nf_gf', mes + '-14');
    await page.evaluate(() => addRepostaje('g'));
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const filas = Array.from(document.querySelectorAll('.gk')).filter(e => e.value).map(e => e.getAttribute('data-row'));
      rowPhotos['g_' + filas[filas.length - 1]] = { data: window.__foto(280000), w: 1000, h: 1400 };
    });
    await page.click('#savebtn');
    await page.waitForTimeout(400);
  }

  // ===== A: archivo conectado, fotos recientes que no caben en localStorage (el caso real) =====
  {
    const page = await abrir();
    ok('A: setup() con archivo de ~6 MB', await vincularArchivoGrande(page) === true);
    await guardarRepostajeConFoto(page, '2026-07', '9000');
    const r = await page.evaluate(() => {
      const f = window.__fileHist()['AAA1111/2026-07'], app = window.__appHist()['AAA1111/2026-07'], ls = window.__lsHist()['AAA1111/2026-07'];
      return {
        errs: window.__errs,
        fileEntries: f && f.entries.length, fileFotos: window.__nFotos(window.__fileHist()), fileFotoNueva: !!(f && f.photos && f.photos['5']),
        appEntries: app && app.entries.length, appFotos: window.__nFotos(window.__appHist()),
        lsEntries: ls && ls.entries.length, lsFotos: window.__nFotos(window.__lsHist())
      };
    });
    ok('A: al guardar NO sale el aviso de almacenamiento lleno', r.errs.length === 0, JSON.stringify(r.errs));
    ok('A: el repostaje nuevo y su foto llegan al archivo', r.fileEntries === 6 && r.fileFotoNueva, JSON.stringify(r));
    ok('A: el archivo conserva todas las fotos (20 + 1)', r.fileFotos === 21, r.fileFotos);
    ok('A: la app sigue viendo todas las fotos', r.appEntries === 6 && r.appFotos === 21, JSON.stringify(r));
    ok('A: localStorage tiene el repostaje nuevo, sin fotos', r.lsEntries === 6 && r.lsFotos === 0, JSON.stringify(r));

    // Volver a arrancar con el archivo conectado (init relee el archivo y reescribe localStorage)
    const r2 = await page.evaluate(async () => {
      let error = null;
      try { await FSStorage.init(); } catch (e) { error = e.name; }
      const ls = window.__lsHist()['AAA1111/2026-07'];
      return { error, activo: FSStorage.isActive(), appFotos: window.__nFotos(window.__appHist()), lsEntries: ls && ls.entries.length, lsFotos: window.__nFotos(window.__lsHist()) };
    });
    ok('A: init() con el archivo grande no falla y queda conectado', !r2.error && r2.activo, JSON.stringify(r2));
    ok('A: tras init() la app ve todas las fotos y localStorage tiene los datos sin fotos', r2.appFotos === 21 && r2.lsEntries === 6 && r2.lsFotos === 0, JSON.stringify(r2));
    await page.close();
  }

  // ===== B: otra clave (parte diario) no cabe porque las fotos de combustible llenan localStorage =====
  {
    const page = await abrir();
    await page.evaluate(async () => {
      await FSStorage.setup(false);
      // Histórico con fotos recientes que cabe justo (~4,9 M) en localStorage
      const hist = { 'AAA1111/2026-07': { mat: 'AAA1111', mes: '2026-07', tipo: 'gasolina', entries: [], photos: {}, updatedAt: '2026-07-10T10:00:00Z' } };
      for (let i = 0; i < 14; i++) { hist['AAA1111/2026-07'].entries.push({ kms: String(i), eur: '1', lit: '1' }); hist['AAA1111/2026-07'].photos[i] = { data: window.__foto(350000), w: 1, h: 1 }; }
      FSStorage.setItem('partes_combustible_hist_v1', JSON.stringify(hist));
    });
    const r = await page.evaluate(() => {
      const antes = window.__nFotos(window.__lsHist());
      const diario = [{ id: 'd1', fecha: '2026-07-14', conductor: 'ANA', firma: window.__foto(500000), updatedAt: '2026-07-14T10:00:00Z' }];
      let error = null;
      try { FSStorage.setItem('cht_parte_servicio_diario_v1', JSON.stringify(diario)); } catch (e) { error = e.name; }
      return {
        antes, error,
        lsDiario: (JSON.parse(localStorage.getItem('cht_parte_servicio_diario_v1') || '[]')[0] || {}).id,
        lsFotos: window.__nFotos(window.__lsHist()), appFotos: window.__nFotos(window.__appHist())
      };
    });
    ok('B: de partida localStorage tiene las 14 fotos', r.antes === 14, r.antes);
    ok('B: guardar el parte diario no da error de cuota', r.error === null, r.error);
    ok('B: el parte diario está en localStorage', r.lsDiario === 'd1', JSON.stringify(r));
    ok('B: para hacer sitio se quitan las fotos de la copia local, la app las sigue viendo', r.lsFotos === 0 && r.appFotos === 14, JSON.stringify(r));
    await page.close();
  }

  // ===== C: archivo vinculado SIN permiso y localStorage lleno: el aviso pide reconectar =====
  {
    const page = await abrir();
    await page.evaluate(async () => {
      await FSStorage.setup(false);
      window.__perm = 'prompt';
      await FSStorage.init();
      localStorage.setItem('__relleno', 'x'.repeat(5200000));
    });
    ok('C: queda pendiente de reconectar', await page.evaluate(() => FSStorage.isPending() && !FSStorage.isActive()));
    await guardarRepostajeConFoto(page, '2026-07', '9000');
    const errs = await page.evaluate(() => window.__errs);
    ok('C: el aviso pide pulsar Reconectar (no vincular un archivo)', errs.length > 0 && errs.every(m => /Reconectar/.test(m) && !/Vincula/.test(m)), JSON.stringify(errs));
    await page.close();
  }

  // ===== D: sin archivo vinculado y localStorage lleno: se mantiene el aviso de vincular =====
  {
    const page = await abrir();
    await page.evaluate(() => localStorage.setItem('__relleno', 'x'.repeat(5200000)));
    await guardarRepostajeConFoto(page, '2026-07', '9000');
    const errs = await page.evaluate(() => window.__errs);
    ok('D: el aviso pide vincular un archivo JSON', errs.length > 0 && errs.every(m => /Vincula un archivo JSON/.test(m)), JSON.stringify(errs));
    await page.close();
  }

  // ===== E: reconectar con un registro reciente más nuevo en localStorage =====
  {
    const page = await abrir();
    const r = await page.evaluate(async () => {
      await FSStorage.setup(false);
      window.__perm = 'prompt';
      await FSStorage.init();
      const foto = { data: 'data:image/png;base64,AAAA', w: 1, h: 1 };
      const base = n => ({ mat: 'AAA1111', mes: '2026-07', tipo: 'gasolina', entries: Array.from({ length: n }, (_, i) => ({ kms: String(i + 1), eur: '1', lit: '1' })), updatedAt: '2026-07-01T10:00:00Z' });
      // R1: localStorage sin fotos (quitadas por cuota) y editado después -> recuperar las del archivo
      // R2: localStorage con 1 de las 2 fotos (la otra la borró el usuario) -> respetar el borrado
      const fichero = { 'AAA1111/2026-07': Object.assign(base(2), { photos: { 0: foto, 1: foto } }), 'BBB2222/2026-07': Object.assign(base(2), { mat: 'BBB2222', photos: { 0: foto, 1: foto } }) };
      const local = { 'AAA1111/2026-07': Object.assign(base(3), { updatedAt: '2026-07-10T10:00:00Z' }), 'BBB2222/2026-07': Object.assign(base(2), { mat: 'BBB2222', photos: { 0: foto }, updatedAt: '2026-07-10T10:00:00Z' }) };
      window.__fileText = JSON.stringify({ partes_combustible_hist_v1: fichero });
      localStorage.setItem('partes_combustible_hist_v1', JSON.stringify(local));
      const okRe = await FSStorage.reconnect();
      const f = window.__fileHist();
      return { okRe, r1Entries: f['AAA1111/2026-07'].entries.length, r1Fotos: Object.keys(f['AAA1111/2026-07'].photos || {}), r2Fotos: Object.keys(f['BBB2222/2026-07'].photos || {}) };
    });
    ok('E: reconnect() funciona', r.okRe === true);
    ok('E: gana la versión local (3 repostajes) y recupera las 2 fotos del archivo', r.r1Entries === 3 && r.r1Fotos.join() === '0,1', JSON.stringify(r));
    ok('E: si la copia local tiene fotos, no resucita la que se borró', r.r2Fotos.join() === '0', JSON.stringify(r));
    await page.close();
  }

  console.log('\n=== RESULTADO:', pass, 'PASS /', fail, 'FAIL ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
