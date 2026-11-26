// Parte combustible guardado que se queda sin repostajes. Bug real (auditoría 2026-11-26): borrar el único
// repostaje y pulsar Guardar decía "Parte guardado", pero el parte seguía guardado con el repostaje.
// Ahora Guardar pregunta si se borra el parte entero.
const { chromium } = require('playwright');
const { nuevaPagina } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  // respuesta: true acepta los confirm(), false los cancela
  async function abrir(respuesta) {
    const page = await nuevaPagina(browser);
    const pageErrors = [], dialogos = [];
    page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
    page.on('dialog', d => { dialogos.push(d.message()); respuesta ? d.accept() : d.dismiss(); });
    await page.goto(BASE + '/parte_combustible.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/parte_combustible.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__toasts = []; const t = toast; toast = m => { window.__toasts.push(m); t(m); };
    });
    return { page, pageErrors, dialogos };
  }
  const mat = async (page, v) => { await page.fill('#v_mat', v); await page.locator('#v_mat').dispatchEvent('change'); await page.waitForTimeout(200); };
  const mes = async (page, v) => { await page.fill('#v_mes', v); await page.locator('#v_mes').dispatchEvent('change'); await page.waitForTimeout(200); };
  async function repostaje(page, kms) {
    await page.fill('#nf_gk', kms); await page.fill('#nf_ge', '50'); await page.fill('#nf_gl', '30'); await page.fill('#nf_gf', '2026-07-02');
    await page.evaluate(() => addRepostaje('g'));
    await page.waitForTimeout(200);
  }
  // AAA1111 y BBB2222 guardados en julio; queda abierto AAA1111 con n repostajes
  async function preparar(page, n) {
    await mes(page, '2026-07');
    await mat(page, 'BBB2222'); await repostaje(page, '5000');
    await page.click('#savebtn'); await page.waitForTimeout(300);
    await mat(page, 'AAA1111');
    for (let i = 0; i < n; i++) await repostaje(page, String(1000 + i * 100));
    await page.click('#savebtn'); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__toasts = []; });
  }
  const estado = page => page.evaluate(() => {
    const h = JSON.parse(localStorage.getItem('partes_combustible_hist_v1') || '{}');
    const guardado = {};
    Object.keys(h).forEach(k => { guardado[k] = h[k].entries.map(e => e.kms).join(','); });
    return {
      guardado, toasts: window.__toasts,
      chips: [...document.querySelectorAll('#mat-chips-bar .mat-chip')].map(b => b.textContent),
      historial: document.getElementById('hist-list') ? document.getElementById('hist-list').textContent : '',
      mat: document.getElementById('v_mat').value, mes: document.getElementById('v_mes').value
    };
  });

  // A: borrar el único repostaje + Guardar + aceptar -> el parte se borra
  {
    const { page, pageErrors, dialogos } = await abrir(true);
    await preparar(page, 1);
    const d0 = dialogos.length;
    await page.locator('.rep-del').first().click(); await page.waitForTimeout(200);
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors, dialogos: dialogos.slice(d0) }, await estado(page));
    ok('A: pregunta una vez si se borra el parte, nombrando mes y matrícula', r.dialogos.length === 1 && /sin repostajes/.test(r.dialogos[0]) && /Julio 2026/.test(r.dialogos[0]) && /AAA-1111/.test(r.dialogos[0]), JSON.stringify(r));
    ok('A: el parte de AAA1111 ya no está guardado', !('AAA1111/2026-07' in r.guardado), JSON.stringify(r));
    ok('A: BBB2222 no se toca', r.guardado['BBB2222/2026-07'] === '5000', JSON.stringify(r));
    ok('A: dice "Parte borrado" y no "Parte guardado"', r.toasts.includes('Parte borrado') && !r.toasts.includes('Parte guardado'), JSON.stringify(r));
    ok('A: la barra de matrículas ya no muestra AAA-1111', !r.chips.includes('AAA-1111') && r.chips.includes('BBB-2222'), JSON.stringify(r));
    ok('A: el formulario conserva mes y matrícula', r.mat === 'AAA-1111' && r.mes === '2026-07', JSON.stringify(r));
    await page.goto(BASE + '/parte_combustible.html'); await page.waitForTimeout(400);
    await mes(page, '2026-07'); await mat(page, 'AAA1111');
    ok('A: al recargar, AAA1111 sale sin repostajes', await page.locator('.rep-edit').count() === 0);
    // Se puede empezar de nuevo y guardar
    await repostaje(page, '2000');
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r2 = await estado(page);
    ok('A: después se puede volver a guardar AAA1111', r2.guardado['AAA1111/2026-07'] === '2000', JSON.stringify(r2));
    ok('A: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // B: lo mismo pero cancelando -> no se borra ni se dice nada
  {
    const { page, pageErrors, dialogos } = await abrir(false);
    await preparar(page, 1);
    const d0 = dialogos.length;
    await page.locator('.rep-del').first().click(); await page.waitForTimeout(200);
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r = Object.assign({ pageErrors, dialogos: dialogos.slice(d0) }, await estado(page));
    ok('B: cancelar: pregunta una vez', r.dialogos.length === 1, JSON.stringify(r));
    ok('B: cancelar: el parte sigue guardado como estaba', r.guardado['AAA1111/2026-07'] === '1000', JSON.stringify(r));
    ok('B: cancelar: no dice ni "Parte guardado" ni "Parte borrado"', !r.toasts.includes('Parte guardado') && !r.toasts.includes('Parte borrado'), JSON.stringify(r));
    ok('B: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // C: controles. Con 2 repostajes, borrar uno y Guardar guarda el otro sin preguntar.
  // Formulario nuevo sin repostajes ni parte guardado: Guardar no pregunta nada.
  {
    const { page, pageErrors, dialogos } = await abrir(true);
    await preparar(page, 2);
    const d0 = dialogos.length;
    await page.locator('.rep-del').first().click(); await page.waitForTimeout(200);
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r = Object.assign({ dialogos: dialogos.slice(d0) }, await estado(page));
    ok('C: con otro repostaje: no pregunta y guarda el que queda', r.dialogos.length === 0 && r.guardado['AAA1111/2026-07'] === '1100' && r.toasts.includes('Parte guardado'), JSON.stringify(r));
    await mat(page, 'CCC3333');
    const d1 = dialogos.length;
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r2 = Object.assign({ pageErrors, dialogos: dialogos.slice(d1) }, await estado(page));
    ok('C: vehículo sin parte guardado ni repostajes: no pregunta ni guarda nada', r2.dialogos.length === 0 && !('CCC3333/2026-07' in r2.guardado), JSON.stringify(r2));
    ok('C: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // D: borrar desde el historial sigue preguntando y borrando como antes
  {
    const { page, pageErrors, dialogos } = await abrir(true);
    await preparar(page, 1);
    const d0 = dialogos.length;
    await page.evaluate(() => deleteHistorico('BBB2222/2026-07', 'Julio 2026 · BBB-2222'));
    await page.waitForTimeout(200);
    const r = Object.assign({ pageErrors, dialogos: dialogos.slice(d0) }, await estado(page));
    ok('D: historial: pregunta "¿Borrar el parte de ...?" y lo borra', r.dialogos.length === 1 && /^¿Borrar el parte de Julio 2026 · BBB-2222\?$/.test(r.dialogos[0]) && !('BBB2222/2026-07' in r.guardado) && r.guardado['AAA1111/2026-07'] === '1000', JSON.stringify(r));
    ok('D: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
