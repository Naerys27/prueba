// Cálculos de fecha que dependen del día y la hora (bugs reales, nov 2026):
// - Combustible, órdenes y fotos de localStorage restaban meses con setMonth() sin pasar al día 1:
//   un día 31 (y algunos 29/30) el corte saltaba al mes siguiente y se purgaba un mes entero antes de tiempo.
// - El parte diario ponía la fecha por defecto con toISOString() (UTC): de 00:00 a 01:00/02:00 en España
//   salía la fecha de ayer.
const { chromium } = require('playwright');
const { nuevaPagina, stubFS } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }
  const MADRID = { timezoneId: 'Europe/Madrid' };

  async function abrir(pagina, hoy, conArchivo) {
    const page = await nuevaPagina(browser, MADRID, hoy);
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
    page.on('dialog', d => d.accept());
    if (conArchivo) await page.addInitScript(stubFS);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/' + pagina);
    await page.waitForTimeout(300);
    return { page, pageErrors };
  }

  const histSembrado = (meses, conFotos) => {
    const h = {};
    meses.forEach(mes => {
      h['ZZZ9999/' + mes] = { mat: 'ZZZ9999', mes, tipo: 'gasolina', entries: [{ kms: '100', eur: '50', lit: '30', fecha: mes + '-10', conductor: '' }],
        servicio: '', conductores: '', km_ini: '', km_fin: '', updatedAt: mes + '-10T10:00:00.000Z' };
      if (conFotos) h['ZZZ9999/' + mes].photos = { 0: 'data:image/jpeg;base64,AAAA' };
    });
    return h;
  };

  // ===== A: combustible, purga de 6 meses en días que no existen en el mes de corte =====
  // [hoy, mes que debe conservarse (justo el límite), mes que debe purgarse]
  const casosComb = [
    ['2026-10-31T10:00:00Z', '2026-04', '2026-03'],
    ['2026-08-31T10:00:00Z', '2026-02', '2026-01'],
    ['2026-08-29T10:00:00Z', '2026-02', '2026-01'],
    ['2026-12-31T10:00:00Z', '2026-06', '2026-05'],
    ['2026-11-24T10:00:00Z', '2026-05', '2026-04'], // control: día normal
  ];
  for (const [hoy, conserva, purga] of casosComb) {
    const dia = hoy.slice(0, 10);
    const { page, pageErrors } = await abrir('parte_combustible.html', hoy);
    await page.evaluate(h => localStorage.setItem('partes_combustible_hist_v1', JSON.stringify(h)), histSembrado([conserva, purga]));
    const mesHoy = dia.slice(0, 7);
    await page.fill('#v_mes', mesHoy); await page.locator('#v_mes').dispatchEvent('change');
    await page.fill('#v_mat', 'AAA1111'); await page.locator('#v_mat').dispatchEvent('change');
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('tipo_combustible').value = 'gasolina'; switchFuelType(); });
    await page.fill('#nf_gk', '9000'); await page.fill('#nf_ge', '61.03'); await page.fill('#nf_gl', '32.90'); await page.fill('#nf_gf', dia);
    await page.evaluate(() => addRepostaje('g'));
    await page.click('#savebtn');
    await page.waitForTimeout(300);
    const claves = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('partes_combustible_hist_v1') || '{}')));
    ok('A ' + dia + ': combustible conserva ' + conserva, claves.includes('ZZZ9999/' + conserva), JSON.stringify(claves));
    ok('A ' + dia + ': combustible purga ' + purga, !claves.includes('ZZZ9999/' + purga), JSON.stringify(claves));
    ok('A ' + dia + ': se guarda el parte de hoy', claves.includes('AAA1111/' + mesHoy), JSON.stringify(claves));
    ok('A ' + dia + ': sin errores de página', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // ===== B: órdenes de reparación, misma purga de 6 meses =====
  const casosOR = [
    ['2026-10-31T10:00:00Z', '2026-04-01', '2026-03-31'],
    ['2026-12-31T10:00:00Z', '2026-06-01', '2026-05-31'],
    ['2026-11-24T10:00:00Z', '2026-05-01', '2026-04-30'], // control: día normal
  ];
  for (const [hoy, conserva, purga] of casosOR) {
    const dia = hoy.slice(0, 10);
    const { page, pageErrors } = await abrir('orden_reparacion.html', hoy);
    await page.evaluate(([c, p]) => localStorage.setItem('cht_orden_reparacion_v1', JSON.stringify([
      { id: 'conserva', fecha: c, matricula: 'ZZZ9999', createdAt: c + 'T10:00:00.000Z' },
      { id: 'purga', fecha: p, matricula: 'ZZZ9999', createdAt: p + 'T10:00:00.000Z' }
    ])), [conserva, purga]);
    await page.fill('#fecha', dia);
    await page.fill('#matricula', 'AAA1111');
    await page.fill('#concepto', 'Revisión');
    await page.evaluate(() => saveOrden());
    await page.waitForTimeout(200);
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('cht_orden_reparacion_v1') || '[]').map(o => o.id));
    ok('B ' + dia + ': órdenes conserva la de ' + conserva, ids.includes('conserva'), JSON.stringify(ids));
    ok('B ' + dia + ': órdenes purga la de ' + purga, !ids.includes('purga'), JSON.stringify(ids));
    ok('B ' + dia + ': se guarda la orden nueva', ids.length === 2, JSON.stringify(ids));
    ok('B ' + dia + ': sin errores de página', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // ===== C: fotos en localStorage con archivo vinculado (purga de 3 meses) =====
  {
    const { page, pageErrors } = await abrir('parte_combustible.html', '2026-12-31T10:00:00Z', true);
    const r = await page.evaluate(async h => {
      window.__fileText = '{}';
      await FSStorage.setup(true);
      FSStorage.setItem('partes_combustible_hist_v1', JSON.stringify(h));
      const ls = JSON.parse(localStorage.getItem('partes_combustible_hist_v1'));
      const app = JSON.parse(FSStorage.getItem('partes_combustible_hist_v1'));
      return { lsSep: !!ls['ZZZ9999/2026-09'].photos, lsAgo: !!ls['ZZZ9999/2026-08'].photos, appAgo: !!app['ZZZ9999/2026-08'].photos };
    }, histSembrado(['2026-09', '2026-08'], true));
    ok('C 2026-12-31: localStorage conserva las fotos de septiembre', r.lsSep, JSON.stringify(r));
    ok('C 2026-12-31: localStorage quita las fotos de agosto', !r.lsAgo, JSON.stringify(r));
    ok('C 2026-12-31: la app sigue viendo las fotos de agosto (archivo)', r.appAgo, JSON.stringify(r));
    ok('C: sin errores de página', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // ===== D: fecha por defecto del parte diario en hora de España =====
  // [instante UTC, fecha local esperada]
  const casosDiario = [
    ['2026-07-14T22:30:00Z', '2026-07-15'], // 00:30 en verano (UTC+2)
    ['2026-12-14T23:30:00Z', '2026-12-15'], // 00:30 en invierno (UTC+1)
    ['2026-07-15T21:30:00Z', '2026-07-15'], // 23:30: control
  ];
  for (const [hoy, esperada] of casosDiario) {
    const { page, pageErrors } = await abrir('parte_servicio_diario.html', hoy);
    const alAbrir = await page.inputValue('#fecha');
    await page.fill('#fecha', '2020-01-01');
    await page.evaluate(() => resetForm(true));
    const trasNuevo = await page.inputValue('#fecha');
    ok('D ' + hoy + ': fecha al abrir = ' + esperada, alAbrir === esperada, alAbrir);
    ok('D ' + hoy + ': fecha tras "Nuevo" = ' + esperada, trasNuevo === esperada, trasNuevo);
    ok('D ' + hoy + ': sin errores de página', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  // ===== E: tras guardar un parte diario a las 00:30, el formulario vuelve a la fecha local =====
  {
    const { page, pageErrors } = await abrir('parte_servicio_diario.html', '2026-07-14T22:30:00Z');
    await page.fill('#conductor', 'PRUEBA FECHA');
    await page.fill('#parte_servicio', 'AAA1111');
    await page.evaluate(() => saveParteDiario());
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      fecha: document.getElementById('fecha').value,
      partes: JSON.parse(localStorage.getItem('cht_parte_servicio_diario_v1') || '[]').map(p => p.fecha)
    }));
    ok('E: el parte se guarda con la fecha local 2026-07-15', r.partes.length === 1 && r.partes[0] === '2026-07-15', JSON.stringify(r));
    ok('E: tras guardar la fecha vuelve a 2026-07-15', r.fecha === '2026-07-15', JSON.stringify(r));
    ok('E: sin errores de página', pageErrors.length === 0, JSON.stringify(pageErrors));
    await page.close();
  }

  await browser.close();
  console.log('\n=== RESULTADO: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail ? 1 : 0);
})();
