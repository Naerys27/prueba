// Parte combustible con el formulario sin mes. Bug real (auditoría 2026-11-25): al cerrar el aviso del PDF
// o pulsar "Nuevo" el formulario se vacía, mes incluido. Si luego se metía otra matrícula y un repostaje:
//  - Guardar decía "Parte guardado" y borraba el borrador sin guardar nada.
//  - Cambiar de matrícula perdía el repostaje sin avisar.
//  - Elegir otro mes lo guardaba en el mes del parte anterior.
const { chromium } = require('playwright');
const { nuevaPagina } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  async function abrir() {
    const page = await nuevaPagina(browser);
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
    page.on('dialog', d => d.accept());
    await page.goto(BASE + '/parte_combustible.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/parte_combustible.html');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__errs = []; const o = showErr; showErr = m => { window.__errs.push(m); o(m); };
      window.__toasts = []; const t = toast; toast = m => { window.__toasts.push(m); t(m); };
    });
    return { page, pageErrors };
  }
  const mat = async (page, v) => { await page.fill('#v_mat', v); await page.locator('#v_mat').dispatchEvent('change'); await page.waitForTimeout(200); };
  const mes = async (page, v) => { await page.fill('#v_mes', v); await page.locator('#v_mes').dispatchEvent('change'); await page.waitForTimeout(200); };
  async function repostaje(page, kms, fecha) {
    await page.fill('#nf_gk', kms); await page.fill('#nf_ge', '50'); await page.fill('#nf_gl', '30'); await page.fill('#nf_gf', fecha);
    await page.evaluate(() => addRepostaje('g'));
    await page.waitForTimeout(200);
  }
  // AAA1111 con un repostaje en julio, guardado; luego el formulario se vacía por el camino indicado
  async function prepararSinMes(como) {
    const r = await abrir();
    const page = r.page;
    await mes(page, '2026-07'); await mat(page, 'AAA1111');
    await repostaje(page, '1000', '2026-07-02');
    await page.click('#savebtn'); await page.waitForTimeout(300);
    if (como === 'pdf') {
      const dl = page.waitForEvent('download');
      await page.click('#pdfbtn'); await dl; await page.waitForTimeout(300);
      await page.click('#_pdfm_c');
    } else {
      await page.click('button.btnc');
    }
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.__errs = []; window.__toasts = []; });
    return r;
  }
  const estado = page => page.evaluate(() => {
    const h = JSON.parse(localStorage.getItem('partes_combustible_hist_v1') || '{}');
    const guardado = {};
    Object.keys(h).forEach(k => { guardado[k] = h[k].entries.map(e => e.kms).join(','); });
    return {
      guardado, errs: window.__errs, toasts: window.__toasts,
      borrador: localStorage.getItem(DRAFT_KEY) !== null,
      mat: document.getElementById('v_mat').value, mes: document.getElementById('v_mes').value,
      filas: [...document.querySelectorAll('.gk, .dk')].filter(el => el.value).length
    };
  });

  for (const como of ['pdf', 'nuevo']) {
    const etq = como === 'pdf' ? 'tras cerrar el aviso del PDF' : 'tras pulsar Nuevo';

    // A: Guardar sin mes avisa y no dice "Parte guardado"
    {
      const { page, pageErrors } = await prepararSinMes(como);
      await mat(page, 'BBB2222');
      await repostaje(page, '2000', '2026-07-05');
      await page.waitForTimeout(900); // deja que se guarde el borrador
      await page.click('#savebtn'); await page.waitForTimeout(300);
      const r = Object.assign({ pageErrors }, await estado(page));
      ok('A ' + etq + ': Guardar sin mes no dice "Parte guardado"', !r.toasts.includes('Parte guardado'), JSON.stringify(r));
      ok('A ' + etq + ': avisa de que falta el mes', r.errs.length === 1 && /Indica el mes y año/.test(r.errs[0]), JSON.stringify(r));
      ok('A ' + etq + ': conserva el borrador y el repostaje en pantalla', r.borrador && r.filas === 1, JSON.stringify(r));
      ok('A ' + etq + ': no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
      await page.close();
    }

    // B: cambiar de matrícula sin mes no pierde el repostaje
    {
      const { page, pageErrors } = await prepararSinMes(como);
      await mat(page, 'BBB2222');
      await repostaje(page, '2000', '2026-07-05');
      await mat(page, 'CCC3333');
      const r = Object.assign({ pageErrors }, await estado(page));
      ok('B ' + etq + ': cambiar de matrícula sin mes avisa de que falta el mes', r.errs.length === 1 && /Indica el mes y año/.test(r.errs[0]), JSON.stringify(r));
      ok('B ' + etq + ': se queda en BBB-2222 con su repostaje', r.mat === 'BBB-2222' && r.filas === 1, JSON.stringify(r));
      await mes(page, '2026-07');
      await mat(page, 'CCC3333');
      const r2 = await estado(page);
      ok('B ' + etq + ': con el mes puesto, al cambiar se guarda en BBB2222/2026-07', r2.guardado['BBB2222/2026-07'] === '2000' && r2.mat === 'CCC-3333' && r2.filas === 0, JSON.stringify(r2));
      ok('B ' + etq + ': AAA1111 no se toca', r2.guardado['AAA1111/2026-07'] === '1000', JSON.stringify(r2));
      ok('B ' + etq + ': no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
      await page.close();
    }

    // C: elegir el mes después de meter el repostaje lo guarda en ese mes, no en el del parte anterior
    {
      const { page, pageErrors } = await prepararSinMes(como);
      await mat(page, 'BBB2222');
      await repostaje(page, '2000', '2026-08-05');
      await mes(page, '2026-08');
      const r = Object.assign({ pageErrors }, await estado(page));
      ok('C ' + etq + ': el repostaje queda en BBB2222/2026-08', r.guardado['BBB2222/2026-08'] === '2000', JSON.stringify(r));
      ok('C ' + etq + ': nada de BBB2222 en julio', !('BBB2222/2026-07' in r.guardado), JSON.stringify(r));
      ok('C ' + etq + ': AAA1111 no se toca', r.guardado['AAA1111/2026-07'] === '1000', JSON.stringify(r));
      ok('C ' + etq + ': no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
      await page.close();
    }
  }

  // D: sin matrícula y con repostaje, cambiar de mes avisa en vez de perderlo
  {
    const { page, pageErrors } = await abrir();
    await mes(page, '2026-07');
    await repostaje(page, '1000', '2026-07-02');
    await mes(page, '2026-08');
    const r = Object.assign({ pageErrors }, await estado(page));
    // fill() ya lanza 'change' y mes() lo lanza otra vez: el aviso puede salir dos veces en el test
    ok('D: cambiar de mes sin matrícula avisa de que falta la matrícula', r.errs.length >= 1 && r.errs.every(m => /Indica la matrícula/.test(m)), JSON.stringify(r));
    ok('D: el repostaje sigue en pantalla, en julio', r.filas === 1 && r.mes === '2026-07', JSON.stringify(r));
    ok('D: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // E: controles. Formulario sin repostajes y sin mes: Guardar no avisa (no hay nada que perder).
  // Generar PDF sin mes: sale el aviso de siempre y no hay PDF.
  {
    const { page, pageErrors } = await prepararSinMes('pdf');
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r = await estado(page);
    ok('E: formulario vacío: Guardar no muestra aviso', r.errs.length === 0, JSON.stringify(r));
    await mat(page, 'BBB2222');
    await repostaje(page, '2000', '2026-07-05');
    await page.evaluate(() => { window.__errs = []; });
    let descargado = false;
    page.on('download', () => { descargado = true; });
    await page.click('#pdfbtn'); await page.waitForTimeout(600);
    const r2 = Object.assign({ pageErrors }, await estado(page));
    ok('E: Generar PDF sin mes: el último aviso es "Revisa el parte" con el mes', /Revisa el parte/.test(r2.errs[r2.errs.length - 1] || '') && /Indica el mes y año/.test(r2.errs[r2.errs.length - 1]), JSON.stringify(r2));
    ok('E: Generar PDF sin mes: no se descarga nada y el repostaje sigue', !descargado && r2.filas === 1, JSON.stringify(r2));
    ok('E: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // F: control del flujo normal con mes: Guardar sigue diciendo "Parte guardado" y cambiar A->B guarda A
  {
    const { page, pageErrors } = await abrir();
    await mes(page, '2026-07'); await mat(page, 'AAA1111');
    await repostaje(page, '1000', '2026-07-02');
    await page.click('#savebtn'); await page.waitForTimeout(300);
    const r = await estado(page);
    ok('F: Guardar con mes dice "Parte guardado" sin avisos', r.toasts.includes('Parte guardado') && r.errs.length === 0, JSON.stringify(r));
    await repostaje(page, '1100', '2026-07-03');
    await mat(page, 'BBB2222');
    const r2 = Object.assign({ pageErrors }, await estado(page));
    ok('F: cambiar A->B con mes guarda los 2 repostajes de A y deja B vacío', r2.guardado['AAA1111/2026-07'] === '1000,1100' && r2.mat === 'BBB-2222' && r2.filas === 0 && r2.errs.length === 0, JSON.stringify(r2));
    ok('F: no se escapa ningún error', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
