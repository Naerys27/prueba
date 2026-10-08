// Parte combustible con localStorage lleno de verdad (cuota real de Chromium). Bugs reales (oct 2026):
// con un vehículo nuevo, Guardar lanzaba un error sin aviso; con uno conocido avisaba, pero mostraba
// "Parte guardado" y borraba el borrador aunque no se había guardado nada.
const { chromium } = require('playwright');
const { nuevaPagina, stubFS } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  // Abre el parte con un repostaje de AAA1111 en julio. conocido: AAA1111 ya está en la BD de vehículos.
  async function abrir({ conocido = false, pendiente = false } = {}) {
    const page = await nuevaPagina(browser);
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
    page.on('dialog', d => d.accept());
    await page.addInitScript(stubFS);
    await page.goto(BASE + '/parte_combustible.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/parte_combustible.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__errs = []; const o = showErr; showErr = m => { window.__errs.push(m); o(m); };
      window.__toasts = []; const t = toast; toast = m => { window.__toasts.push(m); t(m); };
      window.__llenar = () => {
        let i = 0;
        [100000, 10000, 1000, 100, 10, 1].forEach(t => { const v = 'x'.repeat(t); try { for (;;) localStorage.setItem('__r' + (i++), v); } catch (e) {} });
      };
      window.__borrador = () => localStorage.getItem(DRAFT_KEY) !== null;
      window.__hist = () => Object.keys(JSON.parse(localStorage.getItem('partes_combustible_hist_v1') || '{}'));
      window.__filas = () => [...document.querySelectorAll('.gk, .dk')].filter(el => el.value).length;
    });
    if (pendiente) {
      await page.evaluate(async () => {
        window.__fileText = '{}';
        await FSStorage.setup(true);
        await FSStorage.init();
        window.__perm = 'prompt';
        await FSStorage.init();
      });
    }
    await page.fill('#v_mes', '2026-07'); await page.locator('#v_mes').dispatchEvent('change');
    await page.fill('#v_mat', 'AAA1111'); await page.locator('#v_mat').dispatchEvent('change');
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('tipo_combustible').value = 'gasolina'; switchFuelType(); });
    await page.fill('#nf_gk', '9000'); await page.fill('#nf_ge', '61.03'); await page.fill('#nf_gl', '32.90'); await page.fill('#nf_gf', '2026-07-14');
    await page.evaluate(() => addRepostaje('g'));
    await page.waitForTimeout(800); // deja que se guarde el borrador
    if (conocido) await page.evaluate(() => saveCurrentVehicle());
    return { page, pageErrors };
  }
  const estado = page => page.evaluate(() => ({
    errs: window.__errs, toasts: window.__toasts, hist: window.__hist(), borrador: window.__borrador(),
    filas: window.__filas(), mat: document.getElementById('v_mat').value, mes: document.getElementById('v_mes').value
  }));

  // ===== A: botón Guardar =====
  for (const conocido of [false, true]) {
    const etq = conocido ? 'vehículo conocido' : 'vehículo nuevo';
    const { page, pageErrors } = await abrir({ conocido });
    const borradorAntes = await page.evaluate(() => window.__borrador());
    await page.evaluate(() => window.__llenar());
    await page.click('#savebtn');
    await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors, borradorAntes }, await estado(page));
    ok('A: ' + etq + ': no se escapa ningún error', pageErrors.length === 0, JSON.stringify(r));
    ok('A: ' + etq + ': avisa una vez de que está lleno y pide vincular archivo', r.errs.length === 1 && /lleno/.test(r.errs[0]) && /Vincula un archivo JSON/.test(r.errs[0]), JSON.stringify(r));
    ok('A: ' + etq + ': no dice "Parte guardado"', !r.toasts.includes('Parte guardado'), JSON.stringify(r));
    ok('A: ' + etq + ': el borrador se conserva y el formulario sigue relleno', r.borradorAntes && r.borrador && r.filas > 0, JSON.stringify(r));
    await page.close();
  }

  // ===== B: pendiente de reconectar: el aviso pide Reconectar =====
  {
    const { page, pageErrors } = await abrir({ pendiente: true });
    await page.evaluate(() => window.__llenar());
    await page.click('#savebtn');
    await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors }, await estado(page));
    ok('B: pendiente, vehículo nuevo: avisa y pide Reconectar', pageErrors.length === 0 && r.errs.length === 1 && /Reconectar/.test(r.errs[0]), JSON.stringify(r));
    await page.close();
  }

  // ===== C: Generar PDF con el almacenamiento lleno: el PDF sale aunque no se guarde =====
  {
    const { page, pageErrors } = await abrir();
    await page.evaluate(() => window.__llenar());
    let descargado = false;
    const dl = page.waitForEvent('download', { timeout: 30000 }).then(() => { descargado = true; }).catch(() => {});
    await page.click('#pdfbtn');
    await dl;
    const r = Object.assign({ pageErrors, descargado }, await estado(page));
    ok('C: se genera el PDF', r.descargado, JSON.stringify(r));
    ok('C: avisa de que no se ha guardado y no se escapa ningún error', pageErrors.length === 0 && r.errs.length > 0 && r.errs.every(m => /lleno/.test(m)), JSON.stringify(r));
    ok('C: el borrador se conserva', r.borrador, JSON.stringify(r));
    await page.close();
  }

  // ===== D: cambiar de vehículo, de mes o pulsar "+ Nuevo" con lo rellenado sin poder guardar: no se pierde =====
  {
    const { page, pageErrors } = await abrir({ conocido: true });
    await page.evaluate(() => window.__llenar());
    await page.fill('#v_mat', 'BBB2222'); await page.locator('#v_mat').dispatchEvent('change');
    await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors }, await estado(page));
    ok('D: cambio de matrícula: se queda en el vehículo anterior con su repostaje', r.mat === 'AAA-1111' && r.filas > 0 && r.errs.length === 1, JSON.stringify(r));
    await page.close();
  }
  {
    const { page, pageErrors } = await abrir({ conocido: true });
    await page.evaluate(() => window.__llenar());
    // Un solo evento change, como al cambiarlo a mano (page.fill ya lanza uno en los input month)
    await page.evaluate(() => { const m = document.getElementById('v_mes'); m.value = '2026-06'; m.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors }, await estado(page));
    ok('D: cambio de mes: se queda en el mes anterior con su repostaje', r.mes === '2026-07' && r.mat === 'AAA-1111' && r.filas > 0 && r.errs.length === 1, JSON.stringify(r));
    await page.close();
  }
  {
    const { page, pageErrors } = await abrir({ conocido: true });
    await page.evaluate(() => { window.__llenar(); newParteForMes('2026-07'); });
    const r = Object.assign({ pageErrors }, await estado(page));
    ok('D: "+ Nuevo": el formulario sigue relleno', r.mat === 'AAA-1111' && r.filas > 0 && r.errs.length === 1 && pageErrors.length === 0, JSON.stringify(r));
    await page.close();
  }

  // ===== E: control con espacio libre: Guardar sigue funcionando como siempre =====
  {
    const { page, pageErrors } = await abrir();
    await page.click('#savebtn');
    await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors }, await estado(page));
    ok('E: con espacio: guarda, dice "Parte guardado" y borra el borrador', r.hist.length === 1 && r.toasts.includes('Parte guardado') && !r.borrador && r.errs.length === 0 && pageErrors.length === 0, JSON.stringify(r));
    await page.close();
  }

  console.log('\n=== RESULTADO:', pass, 'PASS /', fail, 'FAIL ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
