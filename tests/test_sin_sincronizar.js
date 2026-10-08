// Archivo vinculado sin permiso ("pendiente de reconectar"): lo guardado va solo a localStorage y deja
// la marca partes_fs_sin_sincronizar. Caso real (oct 2026): si el navegador volvía a dar permiso sin
// pulsar Reconectar, init() leía solo el archivo y pisaba localStorage, perdiendo lo guardado.
const { chromium } = require('playwright');
const { nuevaPagina, stubFS } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  const MARCA = 'partes_fs_sin_sincronizar';

  async function abrir(ruta) {
    const page = await nuevaPagina(browser);
    page.on('dialog', d => d.accept());
    await page.addInitScript(stubFS);
    await page.addInitScript(() => {
      window.__orden = (id, concepto, t) => ({ id, concepto, matricula: 'AAA1111', fecha: '2026-07-10', createdAt: t, updatedAt: t });
      window.__fileOrdenes = () => ((JSON.parse(window.__fileText || '{}').cht_orden_reparacion_v1) || []).map(o => o.id).sort().join();
      window.__appOrdenes = () => JSON.parse(FSStorage.getItem('cht_orden_reparacion_v1') || '[]').map(o => o.id).sort().join();
      window.__lsOrdenes = () => JSON.parse(localStorage.getItem('cht_orden_reparacion_v1') || '[]').map(o => o.id).sort().join();
      // Llena localStorage hasta que no quepa ni un carácter más (cuota real de Chromium)
      window.__llenar = () => {
        let i = 0;
        [100000, 10000, 1000, 100, 10, 1].forEach(t => { const v = 'x'.repeat(t); try { for (;;) localStorage.setItem('__r' + (i++), v); } catch (e) {} });
      };
      // Vincula un archivo con la orden o1, arranca una vez con permiso (copia el archivo a localStorage)
      // y deja la app pendiente de reconectar
      window.__vincularYPerderPermiso = async () => {
        window.__fileText = JSON.stringify({ cht_orden_reparacion_v1: [window.__orden('o1', 'Ruedas', '2026-07-01T10:00:00Z')] });
        await FSStorage.setup(true);
        await FSStorage.init();
        window.__perm = 'prompt';
        await FSStorage.init();
      };
      // Guarda o2 sin permiso (como lo haría la app: lista completa de órdenes)
      window.__guardarO2 = () => {
        const lista = JSON.parse(FSStorage.getItem('cht_orden_reparacion_v1') || '[]');
        lista.push(window.__orden('o2', 'Frenos', '2026-07-12T10:00:00Z'));
        FSStorage.setItem('cht_orden_reparacion_v1', JSON.stringify(lista));
      };
    });
    await page.goto(BASE + '/' + ruta);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/' + ruta);
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__errs = []; const o = showErr; showErr = m => { window.__errs.push(m); o(m); }; });
    return page;
  }

  // ===== A: escenario C. Guardar sin permiso y volver a arrancar con permiso, sin pulsar Reconectar =====
  {
    const page = await abrir('orden_reparacion.html');
    const r = await page.evaluate(async (MARCA) => {
      await window.__vincularYPerderPermiso();
      const pendiente = FSStorage.isPending();
      window.__guardarO2();
      const marcaTrasGuardar = localStorage.getItem(MARCA);
      const archivoAntes = window.__fileOrdenes();
      window.__perm = 'granted';
      await FSStorage.init();
      return { pendiente, marcaTrasGuardar, archivoAntes, activo: FSStorage.isActive(), archivo: window.__fileOrdenes(), app: window.__appOrdenes(), ls: window.__lsOrdenes(), marca: localStorage.getItem(MARCA) };
    }, MARCA);
    ok('A: queda pendiente de reconectar', r.pendiente === true);
    ok('A: guardar sin permiso deja la marca', r.marcaTrasGuardar === '1', JSON.stringify(r));
    ok('A: sin permiso la orden nueva no llega al archivo', r.archivoAntes === 'o1', JSON.stringify(r));
    ok('A: al arrancar con permiso queda conectado', r.activo === true);
    ok('A: la orden guardada sin permiso llega al archivo', r.archivo === 'o1,o2', JSON.stringify(r));
    ok('A: la app y localStorage la conservan', r.app === 'o1,o2' && r.ls === 'o1,o2', JSON.stringify(r));
    ok('A: la marca se borra tras escribir el archivo', r.marca === null, JSON.stringify(r));
    await page.close();
  }

  // ===== B: control sin marca. Un borrado hecho en otro equipo no resucita al arrancar =====
  {
    const page = await abrir('orden_reparacion.html');
    const r = await page.evaluate(async (MARCA) => {
      window.__fileText = JSON.stringify({ cht_orden_reparacion_v1: [window.__orden('o1', 'Ruedas', '2026-07-01T10:00:00Z'), window.__orden('o2', 'Frenos', '2026-07-02T10:00:00Z')] });
      await FSStorage.setup(true);
      await FSStorage.init();
      const lsAntes = window.__lsOrdenes();
      // Otro equipo borra o2 en el archivo compartido
      window.__fileText = JSON.stringify({ cht_orden_reparacion_v1: [window.__orden('o1', 'Ruedas', '2026-07-01T10:00:00Z')] });
      await FSStorage.init();
      return { lsAntes, marca: localStorage.getItem(MARCA), activo: FSStorage.isActive(), archivo: window.__fileOrdenes(), app: window.__appOrdenes(), ls: window.__lsOrdenes() };
    }, MARCA);
    ok('B: de partida localStorage tiene o1 y o2', r.lsAntes === 'o1,o2', JSON.stringify(r));
    ok('B: con archivo conectado no hay marca', r.marca === null, JSON.stringify(r));
    ok('B: init() usa el archivo: la orden borrada no resucita', r.activo && r.archivo === 'o1' && r.app === 'o1' && r.ls === 'o1', JSON.stringify(r));
    await page.close();
  }

  // ===== C: archivo dañado al arrancar. La marca se mantiene y se combina cuando se arregla =====
  {
    const page = await abrir('orden_reparacion.html');
    const r = await page.evaluate(async (MARCA) => {
      await window.__vincularYPerderPermiso();
      window.__guardarO2();
      window.__fileText = '{dañado';
      window.__perm = 'granted';
      await FSStorage.init();
      const dañado = { alertas: window.__alerts.length, activo: FSStorage.isActive(), archivo: window.__fileText, ls: window.__lsOrdenes(), marca: localStorage.getItem(MARCA) };
      window.__fileText = JSON.stringify({ cht_orden_reparacion_v1: [window.__orden('o1', 'Ruedas', '2026-07-01T10:00:00Z')] });
      await FSStorage.init();
      return { dañado, activo: FSStorage.isActive(), archivo: window.__fileOrdenes(), marca: localStorage.getItem(MARCA) };
    }, MARCA);
    ok('C: archivo dañado: avisa, no conecta ni lo toca', r.dañado.alertas === 1 && !r.dañado.activo && r.dañado.archivo === '{dañado', JSON.stringify(r.dañado));
    ok('C: archivo dañado: localStorage y la marca se conservan', r.dañado.ls === 'o1,o2' && r.dañado.marca === '1', JSON.stringify(r.dañado));
    ok('C: arreglado el archivo, se combina y se borra la marca', r.activo && r.archivo === 'o1,o2' && r.marca === null, JSON.stringify(r));
    await page.close();
  }

  // ===== D: falla la escritura del archivo al combinar. La marca se mantiene =====
  {
    const page = await abrir('orden_reparacion.html');
    const r = await page.evaluate(async (MARCA) => {
      await window.__vincularYPerderPermiso();
      window.__guardarO2();
      const h = await window.showSaveFilePicker(); // el stub devuelve siempre el mismo handle
      const escribir = h.createWritable;
      h.createWritable = async () => { throw new Error('disco no disponible'); };
      window.__perm = 'granted';
      let error = null;
      try { await FSStorage.init(); } catch (e) { error = e.message; }
      const fallo = { error, activo: FSStorage.isActive(), app: window.__appOrdenes(), ls: window.__lsOrdenes(), archivo: window.__fileOrdenes(), marca: localStorage.getItem(MARCA) };
      h.createWritable = escribir;
      await FSStorage.init();
      return { fallo, archivo: window.__fileOrdenes(), marca: localStorage.getItem(MARCA) };
    }, MARCA);
    ok('D: el fallo de escritura no rompe init()', r.fallo.error === null && r.fallo.activo, JSON.stringify(r.fallo));
    ok('D: la app y localStorage siguen teniendo la orden', r.fallo.app === 'o1,o2' && r.fallo.ls === 'o1,o2', JSON.stringify(r.fallo));
    ok('D: la marca se mantiene mientras el archivo no se escribe', r.fallo.archivo === 'o1' && r.fallo.marca === '1', JSON.stringify(r.fallo));
    ok('D: al siguiente arranque llega al archivo y se borra la marca', r.archivo === 'o1,o2' && r.marca === null, JSON.stringify(r));
    await page.close();
  }

  // ===== E: Reconectar y Configurar archivo borran la marca; sin archivo vinculado no se pone =====
  {
    const page = await abrir('orden_reparacion.html');
    const r = await page.evaluate(async (MARCA) => {
      FSStorage.setItem('partes_conductores_v1', JSON.stringify(['ANA']));
      const sinArchivo = localStorage.getItem(MARCA);
      await window.__vincularYPerderPermiso();
      window.__guardarO2();
      const okRe = await FSStorage.reconnect();
      const trasReconnect = { archivo: window.__fileOrdenes(), marca: localStorage.getItem(MARCA) };
      FSStorage.setItem('partes_conductores_v1', JSON.stringify(['ANA', 'LUIS']));
      const conectado = localStorage.getItem(MARCA);
      // Borrar sin permiso también marca
      window.__perm = 'prompt';
      await FSStorage.init();
      FSStorage.removeItem('partes_conductores_v1');
      const trasBorrar = localStorage.getItem(MARCA);
      // Configurar archivo de nuevo combina y borra la marca
      window.__perm = 'granted';
      const okSetup = await FSStorage.setup(true);
      return { sinArchivo, okRe, trasReconnect, conectado, trasBorrar, okSetup, trasSetup: localStorage.getItem(MARCA) };
    }, MARCA);
    ok('E: sin archivo vinculado guardar no pone la marca', r.sinArchivo === null, JSON.stringify(r));
    ok('E: reconnect() combina y borra la marca', r.okRe && r.trasReconnect.archivo === 'o1,o2' && r.trasReconnect.marca === null, JSON.stringify(r));
    ok('E: con el archivo conectado guardar no pone la marca', r.conectado === null, JSON.stringify(r));
    ok('E: borrar sin permiso pone la marca', r.trasBorrar === '1', JSON.stringify(r));
    ok('E: setup() borra la marca', r.okSetup && r.trasSetup === null, JSON.stringify(r));
    await page.close();
  }

  // ===== F: localStorage lleno sin permiso. Si la marca no cabe antes, se pone después de liberar sitio =====
  {
    const page = await abrir('orden_reparacion.html');
    const r = await page.evaluate(async (MARCA) => {
      await window.__vincularYPerderPermiso();
      localStorage.removeItem(MARCA);
      FSStorage.setItem('cht_parte_servicio_diario_v1', JSON.stringify([{ id: 'd1', firma: 'x'.repeat(2000000) }]));
      localStorage.removeItem(MARCA);
      window.__llenar();
      let cabeMarca = true;
      try { localStorage.setItem(MARCA, '1'); localStorage.removeItem(MARCA); } catch (e) { cabeMarca = false; }
      // Guardar un parte diario más pequeño (libera sitio)
      let error = null;
      try { FSStorage.setItem('cht_parte_servicio_diario_v1', JSON.stringify([{ id: 'd1', firma: 'corta' }])); } catch (e) { error = e.name; }
      return { cabeMarca, error, marca: localStorage.getItem(MARCA) };
    }, MARCA);
    ok('F: de partida no cabe ni la marca', r.cabeMarca === false, JSON.stringify(r));
    ok('F: guardar algo más pequeño funciona y deja la marca', r.error === null && r.marca === '1', JSON.stringify(r));
    await page.close();
  }

  // ===== G: avisos de almacenamiento lleno en órdenes y parte diario =====
  async function avisoOrden(pendiente) {
    const page = await abrir('orden_reparacion.html');
    if (pendiente) await page.evaluate(() => window.__vincularYPerderPermiso());
    await page.fill('#fecha', '2026-07-10');
    await page.fill('#matricula', 'AAA1111');
    await page.fill('#marca', 'SEAT');
    await page.fill('#vehiculo', 'IBIZA');
    await page.fill('#concepto', 'Cambio de ruedas');
    await page.evaluate(() => window.__llenar());
    const escapado = await page.evaluate(() => { try { saveOrden(); return null; } catch (e) { return e.name; } });
    const errs = await page.evaluate(() => window.__errs);
    await page.close();
    return { escapado, errs };
  }
  async function avisoDiario(pendiente) {
    const page = await abrir('parte_servicio_diario.html');
    if (pendiente) await page.evaluate(() => window.__vincularYPerderPermiso());
    const r = await page.evaluate(() => {
      window.__llenar();
      const guardado = setSavedParts([{ id: 'd1', fecha: '2026-07-10', parte_servicio: 'AAA1111', firma: 'x'.repeat(1000) }]);
      return { guardado, errs: window.__errs };
    });
    await page.close();
    return r;
  }
  // Por la interfaz: saveParteDiario() con un vehículo nuevo guarda antes el vehículo, que es lo que no cabe
  async function avisoDiarioInterfaz(pendiente) {
    const page = await abrir('parte_servicio_diario.html');
    if (pendiente) await page.evaluate(() => window.__vincularYPerderPermiso());
    await page.fill('#fecha', '2026-07-10'); await page.fill('#conductor', 'ANA'); await page.fill('#parte_servicio', 'ZZZ9999');
    await page.fill('#marca', 'SEAT'); await page.fill('#modelo', 'IBIZA');
    await page.fill('#cont_salida', '100'); await page.fill('#cont_llegada', '150'); await page.fill('#hora_salida', '08:00'); await page.fill('#hora_llegada', '09:00');
    await page.evaluate(() => window.__llenar());
    let escapado = null;
    try { await page.evaluate(() => saveParteDiario()); } catch (e) { escapado = e.message.split('\n')[0]; }
    const r = await page.evaluate(() => ({ errs: window.__errs, partes: JSON.parse(localStorage.getItem('cht_parte_servicio_diario_v1') || '[]').length, conductor: document.getElementById('conductor').value }));
    await page.close();
    return Object.assign({ escapado }, r);
  }
  {
    const o1 = await avisoOrden(true);
    ok('G: órdenes, pendiente: el aviso pide Reconectar', o1.escapado === null && o1.errs.length > 0 && o1.errs.every(m => /Reconectar/.test(m) && /lleno/.test(m) && !/Vincula/.test(m)), JSON.stringify(o1));
    const o2 = await avisoOrden(false);
    ok('G: órdenes, sin archivo: el aviso pide vincular un archivo', o2.escapado === null && o2.errs.length > 0 && o2.errs.every(m => /Vincula un archivo JSON/.test(m)), JSON.stringify(o2));
    const d1 = await avisoDiario(true);
    ok('G: parte diario, pendiente: el aviso pide Reconectar', d1.guardado === false && d1.errs.length === 1 && /lleno/.test(d1.errs[0]) && /Reconectar/.test(d1.errs[0]), JSON.stringify(d1));
    const d2 = await avisoDiario(false);
    ok('G: parte diario, sin archivo: se mantiene el aviso de siempre', d2.guardado === false && d2.errs.length === 1 && /Exporta una copia JSON/.test(d2.errs[0]) && !/Reconectar/.test(d2.errs[0]), JSON.stringify(d2));
    const i1 = await avisoDiarioInterfaz(false);
    ok('G: parte diario por la interfaz, vehículo nuevo, sin archivo: no se escapa el error y avisa', i1.escapado === null && i1.errs.length === 1 && /lleno/.test(i1.errs[0]) && /Exporta una copia JSON/.test(i1.errs[0]), JSON.stringify(i1));
    ok('G: parte diario por la interfaz: no se guarda y el formulario sigue relleno', i1.partes === 0 && i1.conductor === 'ANA', JSON.stringify(i1));
    const i2 = await avisoDiarioInterfaz(true);
    ok('G: parte diario por la interfaz, vehículo nuevo, pendiente: el aviso pide Reconectar', i2.escapado === null && i2.errs.length === 1 && /Reconectar/.test(i2.errs[0]), JSON.stringify(i2));
  }

  console.log('\n=== RESULTADO:', pass, 'PASS /', fail, 'FAIL ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
