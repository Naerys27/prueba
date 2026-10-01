const { chromium } = require('playwright');
const { nuevaPagina } = require('./_comun');
const fs = require('fs');

// Tamano de los PDFs: sin compress:true jsPDF incrusta cada firma PNG como pixeles en bruto
// (~250 KB por dia firmado; 10 dias = 3-7 MB segun el ancho del lienzo). Comprimido, 10 dias ~650 KB
// (casi todo es el logo, que se incrusta una sola vez). El limite deja margen y salta si se pierde la compresion.
const LIMITE_MENSUAL_10_DIAS = 1024 * 1024;
const DIAS_FIRMADOS = 10;

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  async function abre(ruta) {
    const page = await nuevaPagina(browser, { acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push('JS: ' + e.message));
    page.on('dialog', d => d.accept());
    await page.goto(BASE + ruta);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + ruta);
    await page.waitForTimeout(300);
    return { page, errors };
  }
  async function descargaPDF(page, fn) {
    const dl = page.waitForEvent('download', { timeout: 30000 });
    await page.evaluate(fn);
    const d = await dl;
    return fs.readFileSync(await d.path());
  }
  const comprimido = buf => buf.toString('latin1').includes('/FlateDecode');

  // ===== PARTE DIARIO: PDF mensual de 10 dias firmados =====
  {
    const { page, errors } = await abre('/parte_servicio_diario.html');
    await page.evaluate((n) => {
      // Firma distinta por dia para que jsPDF no pueda reutilizar la misma imagen entre paginas
      function firma(seed) {
        const c = document.createElement('canvas'); c.width = sigCanvas.width; c.height = sigCanvas.height;
        const x = c.getContext('2d'); x.lineWidth = 2; x.beginPath(); x.moveTo(20, 60);
        for (let i = 0; i < 40; i++) x.lineTo(20 + i * 8, 60 + Math.sin(i + seed) * 30);
        x.stroke(); return c.toDataURL('image/png');
      }
      const ahora = new Date().toISOString();
      const partes = [];
      for (let d = 1; d <= n; d++) partes.push({ id: 'pdf' + d, fecha: '2026-07-' + String(d).padStart(2, '0'), conductor: 'PRUEBA PDF', parte_servicio: 'PDF1234', marca: 'SEAT', modelo: 'LEON', cont_salida: String(1000 + d * 100), cont_llegada: String(1080 + d * 100), kms_recorridos: '80', hora_salida: '08:00', hora_llegada: '13:00', itinerario: 'Madrid - Toledo - Madrid', firma: firma(d), createdAt: ahora, updatedAt: ahora });
      localStorage.setItem('cht_parte_servicio_diario_v1', JSON.stringify(partes));
    }, DIAS_FIRMADOS);
    await page.goto(BASE + '/parte_servicio_diario.html');
    await page.waitForTimeout(400);
    await page.evaluate(() => { q('mes_partes').value = '2026-07'; renderSavedDays(); });
    const marcados = await page.evaluate(() => { const cs = document.querySelectorAll('.saved-check'); cs.forEach(c => { c.checked = true; }); return cs.length; });
    ok('PD: los ' + DIAS_FIRMADOS + ' partes aparecen en el historial', marcados === DIAS_FIRMADOS, 'hay ' + marcados);

    const pdf = await descargaPDF(page, () => makeMonthlyPDF());
    const paginas = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    ok('PD mensual: una pagina por dia', paginas === DIAS_FIRMADOS, paginas + ' paginas');
    ok('PD mensual: comprimido (FlateDecode)', comprimido(pdf));
    ok('PD mensual: 10 dias firmados < 1 MB', pdf.length < LIMITE_MENSUAL_10_DIAS, Math.round(pdf.length / 1024) + ' KB');

    await page.evaluate(async () => { await editSavedPart('pdf1'); });
    await page.waitForTimeout(300);
    const pdfDia = await descargaPDF(page, () => makePDF());
    ok('PD dia suelto: comprimido (FlateDecode)', comprimido(pdfDia));
    ok('PD: sin errores JS', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ===== PARTE COMBUSTIBLE =====
  {
    const { page, errors } = await abre('/parte_combustible.html');
    await page.fill('#v_mes', '2026-07');
    await page.locator('#v_mes').dispatchEvent('change');
    await page.fill('#v_mat', 'PDF5678');
    await page.locator('#v_mat').dispatchEvent('change');
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('tipo_combustible').value = 'gasolina'; switchFuelType(); });
    await page.fill('#nf_gk', '5000');
    await page.fill('#nf_ge', '60');
    await page.fill('#nf_gl', '40');
    await page.evaluate(() => addRepostaje('g'));
    await page.waitForTimeout(300);
    const pdf = await descargaPDF(page, () => makePDF());
    ok('FC: PDF comprimido (FlateDecode)', comprimido(pdf));
    ok('FC: sin errores JS', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // ===== ORDEN DE REPARACION =====
  {
    const { page, errors } = await abre('/orden_reparacion.html');
    await page.fill('#fecha', '2026-07-03');
    await page.fill('#matricula', 'PDF9012');
    await page.fill('#concepto', 'Revision');
    const pdf = await descargaPDF(page, () => makePDF());
    ok('OR: PDF comprimido (FlateDecode)', comprimido(pdf));
    ok('OR: sin errores JS', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  console.log('\n=== RESULTADO:', pass, 'PASS /', fail, 'FAIL ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
