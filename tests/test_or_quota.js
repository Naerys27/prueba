const { chromium } = require('playwright');
const { nuevaPagina, stubFS } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  // Simulador de localStorage lleno, controlado con window.__lleno:
  //   null      -> funciona normal
  //   'ordenes' -> solo falla la clave de ordenes
  //   'todo'    -> falla cualquier clave salvo el borrador (lo realista: no cabe nada que crezca)
  //   'code22'  -> como 'ordenes' pero con un error antiguo sin name, solo code 22
  //   'otro'    -> la clave de ordenes lanza un error que no es de cuota
  const simuladorLleno = () => {
    window.__lleno = null;
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      const modo = window.__lleno;
      const afecta = modo === 'todo' ? key !== 'draft_reparacion_v1' : key === 'cht_orden_reparacion_v1';
      if (modo && afecta) {
        if (modo === 'code22') { const e = new Error('quota'); e.code = 22; throw e; }
        if (modo === 'otro') throw new TypeError('fallo inesperado');
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    };
  };

  async function abrir(conArchivo) {
    const page = await nuevaPagina(browser);
    page.on('dialog', d => d.accept());
    if (conArchivo) await page.addInitScript(stubFS);
    await page.goto(BASE + '/orden_reparacion.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(200);
    await page.evaluate(simuladorLleno);
    return page;
  }

  async function rellenar(page, matricula, concepto) {
    await page.fill('#fecha', '2026-07-10');
    await page.fill('#matricula', matricula);
    await page.fill('#marca', 'SEAT');
    await page.fill('#vehiculo', 'IBIZA');
    await page.fill('#concepto', concepto);
  }

  // Llama a saveOrden() y devuelve el error que se escape, si lo hay
  async function guardar(page) {
    return page.evaluate(() => { try { saveOrden(); return null; } catch (e) { return e.name + ': ' + e.message; } });
  }

  async function estado(page) {
    await page.waitForTimeout(150);
    return page.evaluate(() => {
      const err = document.getElementById('errbox');
      const raw = localStorage.getItem('cht_orden_reparacion_v1');
      return {
        err: err && err.style.display !== 'none' ? err.textContent : null,
        toast: document.getElementById('toast').classList.contains('on') ? document.getElementById('toast').textContent : null,
        ordenes: raw ? JSON.parse(raw) : null,
        concepto: document.getElementById('concepto').value,
        editando: _editingOrdenId
      };
    });
  }

  async function limpiarAvisos(page) {
    await page.evaluate(() => {
      document.getElementById('errbox').style.display = 'none';
      document.getElementById('toast').classList.remove('on');
    });
  }

  // ===== A: solo falla la clave de ordenes (vehiculo ya cabe) =====
  {
    const page = await abrir();
    await page.evaluate(() => { window.__lleno = 'ordenes'; });
    await rellenar(page, 'AAAA111', 'Prueba quota llena');
    const escapado = await guardar(page);
    const r = await estado(page);
    ok('A: no se escapa ningun error', escapado === null, escapado);
    ok('A: muestra aviso de almacenamiento lleno', !!r.err && /lleno/i.test(r.err), 'errbox: ' + r.err);
    ok('A: la orden NO se guardo en localStorage', r.ordenes === null, JSON.stringify(r.ordenes));
    ok('A: no dice "Orden guardada"', r.toast !== 'Orden guardada', 'toast: ' + r.toast);
    ok('A: el formulario NO se vacia (no se pierde lo escrito)', r.concepto === 'Prueba quota llena', 'concepto: ' + r.concepto);

    // Al liberar espacio, el mismo formulario se guarda bien
    await page.evaluate(() => { window.__lleno = null; });
    await limpiarAvisos(page);
    const escapado2 = await guardar(page);
    const r2 = await estado(page);
    ok('A: tras liberar espacio se guarda sin error', escapado2 === null && !r2.err, escapado2 + ' / ' + r2.err);
    ok('A: tras liberar espacio la orden queda guardada', !!r2.ordenes && r2.ordenes.length === 1 && r2.ordenes[0].concepto === 'Prueba quota llena', JSON.stringify(r2.ordenes));
    ok('A: tras liberar espacio dice "Orden guardada" y vacia el formulario', r2.toast === 'Orden guardada' && r2.concepto === '', JSON.stringify(r2));
    await page.close();
  }

  // ===== B: almacenamiento lleno de verdad (tambien falla la BD de vehiculos) =====
  {
    const page = await abrir();
    await page.evaluate(() => { window.__lleno = 'todo'; });
    await rellenar(page, 'BBBB222', 'Lleno del todo');
    const escapado = await guardar(page);
    const r = await estado(page);
    ok('B: no se escapa ningun error', escapado === null, escapado);
    ok('B: muestra aviso de almacenamiento lleno', !!r.err && /lleno/i.test(r.err), 'errbox: ' + r.err);
    ok('B: la orden NO se guardo y el formulario sigue relleno', r.ordenes === null && r.concepto === 'Lleno del todo', JSON.stringify(r));
    await page.close();
  }

  // ===== C: navegador antiguo, error sin name pero con code 22 =====
  {
    const page = await abrir();
    await page.evaluate(() => { window.__lleno = 'code22'; });
    await rellenar(page, 'CCCC333', 'Code 22');
    const escapado = await guardar(page);
    const r = await estado(page);
    ok('C: code 22 se trata como lleno', escapado === null && !!r.err && /lleno/i.test(r.err), escapado + ' / ' + r.err);
    await page.close();
  }

  // ===== D: un error que no es de cuota no se disfraza de "lleno" =====
  {
    const page = await abrir();
    await page.evaluate(() => { window.__lleno = 'otro'; });
    await rellenar(page, 'DDDD444', 'Otro error');
    const escapado = await guardar(page);
    const r = await estado(page);
    ok('D: el error se relanza', !!escapado && /fallo inesperado/.test(escapado), escapado);
    ok('D: no muestra el aviso de lleno', !r.err || !/lleno/i.test(r.err), 'errbox: ' + r.err);
    await page.close();
  }

  // ===== E: editar una orden guardada con el almacenamiento lleno =====
  {
    const page = await abrir();
    await rellenar(page, 'EEEE555', 'Version 1');
    await guardar(page);
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('cht_orden_reparacion_v1'))[0].id);
    await page.evaluate((id) => loadOrden(id), id);
    await page.fill('#concepto', 'Version 2');
    await page.evaluate(() => { window.__lleno = 'ordenes'; });
    await limpiarAvisos(page);
    const escapado = await guardar(page);
    const r = await estado(page);
    ok('E: editar con lleno avisa sin escaparse error', escapado === null && !!r.err && /lleno/i.test(r.err), escapado + ' / ' + r.err);
    ok('E: la version guardada sigue siendo la anterior', !!r.ordenes && r.ordenes.length === 1 && r.ordenes[0].concepto === 'Version 1', JSON.stringify(r.ordenes));
    ok('E: se sigue editando la misma orden con lo escrito', r.editando === id && r.concepto === 'Version 2', JSON.stringify(r));

    await page.evaluate(() => { window.__lleno = null; });
    await limpiarAvisos(page);
    await guardar(page);
    const r2 = await estado(page);
    ok('E: tras liberar espacio se actualiza la misma orden (sin duplicar)', !!r2.ordenes && r2.ordenes.length === 1 && r2.ordenes[0].id === id && r2.ordenes[0].concepto === 'Version 2', JSON.stringify(r2.ordenes));
    ok('E: dice "Orden actualizada"', r2.toast === 'Orden actualizada', 'toast: ' + r2.toast);
    await page.close();
  }

  // ===== F: con archivo JSON vinculado, la orden llega al archivo aunque localStorage este lleno =====
  {
    const page = await abrir(true);
    await page.evaluate(async () => { window.__fileText = '{}'; await FSStorage.setup(true); });
    await page.evaluate(() => { window.__lleno = 'ordenes'; });
    await rellenar(page, 'FFFF666', 'Con archivo');
    const escapado = await guardar(page);
    await page.waitForTimeout(150);
    const archivo = await page.evaluate(() => JSON.parse(window.__fileText));
    const enArchivo = archivo.cht_orden_reparacion_v1 || [];
    ok('F: no se escapa ningun error', escapado === null, escapado);
    ok('F: la orden queda en el archivo vinculado', enArchivo.length === 1 && enArchivo[0].concepto === 'Con archivo', JSON.stringify(enArchivo));
    await page.close();
  }

  console.log('');
  console.log('=== RESULTADO: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  await browser.close();
  if (fail > 0) process.exit(1);
})();
