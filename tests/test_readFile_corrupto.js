const { chromium } = require('playwright');
const { nuevaPagina, stubFS } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  async function abrir() {
    const page = await nuevaPagina(browser);
    await page.addInitScript(stubFS);
    await page.goto(BASE + '/parte_combustible.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/parte_combustible.html');
    await page.waitForTimeout(300);
    return page;
  }

  // ===== ESCENARIO A: setup(true) vinculando un archivo con JSON corrupto =====
  {
    const page = await abrir();
    const r = await page.evaluate(async () => {
      localStorage.setItem('partes_vehiculos_v1', JSON.stringify({ AAA1111: { marca: 'SEAT', modelo: 'IBIZA' } }));
      window.__fileText = '{ esto no es json valido ]]]';
      const okSetup = await FSStorage.setup(true);
      await new Promise(r2 => setTimeout(r2, 100));
      return {
        okSetup,
        alerts: window.__alerts.slice(),
        fileTextUnchanged: window.__fileText,
        active: FSStorage.isActive(),
        ls: localStorage.getItem('partes_vehiculos_v1')
      };
    });

    ok('A: setup() aborta con false si el archivo esta corrupto', r.okSetup === false, 'okSetup=' + r.okSetup);
    ok('A: se avisa al usuario con alert()', r.alerts.length === 1 && /no es JSON válido/i.test(r.alerts[0]), JSON.stringify(r.alerts));
    ok('A: el archivo corrupto NO se sobreescribe', r.fileTextUnchanged === '{ esto no es json valido ]]]');
    ok('A: FSStorage sigue inactivo (no vinculado)', r.active === false);
    ok('A: los datos previos de localStorage siguen intactos', !!r.ls && JSON.parse(r.ls).AAA1111.marca === 'SEAT');
    await page.close();
  }

  // ===== ESCENARIO B: init() con un handle ya vinculado cuyo archivo se corrompio entre sesiones =====
  {
    const page = await abrir();
    const r = await page.evaluate(async () => {
      window.__fileText = '{}';
      await FSStorage.setup(true); // vincula con archivo valido primero
      localStorage.setItem('partes_vehiculos_v1', JSON.stringify({ BBB2222: { marca: 'FORD', modelo: 'FIESTA' } }));
      window.__fileText = 'esto ya no es json'; // se corrompe "entre sesiones"
      window.__alerts = [];
      await FSStorage.init(); // simula recarga de la app
      await new Promise(r2 => setTimeout(r2, 100));
      const tras = {
        alerts: window.__alerts.slice(),
        fileTextUnchanged: window.__fileText,
        active: FSStorage.isActive(),
        ls: localStorage.getItem('partes_vehiculos_v1'),
        leido: FSStorage.getItem('partes_vehiculos_v1')
      };
      // Seguir usando la app no debe tocar el archivo: lo nuevo va solo a localStorage
      FSStorage.setItem('partes_conductores_v1', JSON.stringify(['PEREZ']));
      await new Promise(r2 => setTimeout(r2, 100));
      tras.fileTrasGuardar = window.__fileText;
      tras.lsConductores = localStorage.getItem('partes_conductores_v1');
      return tras;
    });

    ok('B: init() avisa si el archivo vinculado esta corrupto', r.alerts.length === 1 && /dañado/i.test(r.alerts[0]), JSON.stringify(r.alerts));
    ok('B: el archivo corrupto NO se sobreescribe en init()', r.fileTextUnchanged === 'esto ya no es json');
    ok('B: FSStorage cae a modo localStorage (inactivo)', r.active === false);
    ok('B: los datos de localStorage no se pierden', !!r.ls && JSON.parse(r.ls).BBB2222.marca === 'FORD');
    ok('B: la app lee los datos de localStorage', !!r.leido && JSON.parse(r.leido).BBB2222.marca === 'FORD', 'getItem=' + r.leido);
    ok('B: guardar despues NO escribe en el archivo corrupto', r.fileTrasGuardar === 'esto ya no es json', 'archivo=' + r.fileTrasGuardar);
    ok('B: lo guardado despues queda en localStorage', r.lsConductores === '["PEREZ"]', 'ls=' + r.lsConductores);
    await page.close();
  }

  // ===== ESCENARIO C: reconnect() (banner "Reconectar") con el archivo corrompido =====
  {
    const page = await abrir();
    const r = await page.evaluate(async () => {
      window.__fileText = '{}';
      await FSStorage.setup(true);
      localStorage.setItem('partes_vehiculos_v1', JSON.stringify({ CCC3333: { marca: 'RENAULT', modelo: 'CLIO' } }));
      window.__fileText = '{"partes_vehiculos_v1": {';
      window.__perm = 'prompt'; // nueva sesion: el navegador vuelve a pedir permiso
      window.__alerts = [];
      await FSStorage.init();
      const pendiente = FSStorage.isPending();
      const alertsInit = window.__alerts.slice();
      const okReconnect = await FSStorage.reconnect();
      await new Promise(r2 => setTimeout(r2, 100));
      const tras = {
        pendiente, alertsInit, okReconnect,
        alerts: window.__alerts.slice(),
        fileTextUnchanged: window.__fileText,
        active: FSStorage.isActive(),
        leido: FSStorage.getItem('partes_vehiculos_v1')
      };
      FSStorage.setItem('partes_conductores_v1', JSON.stringify(['LOPEZ']));
      await new Promise(r2 => setTimeout(r2, 100));
      tras.fileTrasGuardar = window.__fileText;
      return tras;
    });

    ok('C: init() deja la vinculacion pendiente sin leer el archivo', r.pendiente === true && r.alertsInit.length === 0, JSON.stringify(r));
    ok('C: reconnect() devuelve true (quita el banner)', r.okReconnect === true);
    ok('C: reconnect() avisa de que el archivo esta dañado y no se modifica', r.alerts.length === 1 && /No se ha modificado/.test(r.alerts[0]), JSON.stringify(r.alerts));
    ok('C: el archivo corrupto NO se sobreescribe en reconnect()', r.fileTextUnchanged === '{"partes_vehiculos_v1": {');
    ok('C: FSStorage queda inactivo', r.active === false);
    ok('C: la app sigue leyendo los datos de localStorage', !!r.leido && JSON.parse(r.leido).CCC3333.marca === 'RENAULT', 'getItem=' + r.leido);
    ok('C: guardar despues NO escribe en el archivo corrupto', r.fileTrasGuardar === '{"partes_vehiculos_v1": {', 'archivo=' + r.fileTrasGuardar);
    await page.close();
  }

  // ===== ESCENARIO D: archivo vacio o solo con espacios = archivo nuevo, se puede vincular =====
  for (const [nombre, contenido] of [['vacio', ''], ['espacios', '  \n\t ']]) {
    const page = await abrir();
    const r = await page.evaluate(async (contenido) => {
      localStorage.setItem('partes_vehiculos_v1', JSON.stringify({ DDD4444: { marca: 'KIA' } }));
      window.__fileText = contenido;
      const okSetup = await FSStorage.setup(true);
      await new Promise(r2 => setTimeout(r2, 100));
      return { okSetup, alerts: window.__alerts.slice(), active: FSStorage.isActive(), file: window.__fileText };
    }, contenido);

    let escrito = null; try { escrito = JSON.parse(r.file); } catch (e) {}
    ok('D(' + nombre + '): setup() vincula sin avisos', r.okSetup === true && r.alerts.length === 0 && r.active === true, JSON.stringify(r));
    ok('D(' + nombre + '): el archivo recibe los datos de localStorage', !!escrito && escrito.partes_vehiculos_v1.DDD4444.marca === 'KIA', 'archivo=' + r.file);
    await page.close();
  }

  // ===== ESCENARIO E (control): init() con un archivo valido carga sus datos =====
  {
    const page = await abrir();
    const r = await page.evaluate(async () => {
      window.__fileText = '{}';
      await FSStorage.setup(true);
      window.__fileText = JSON.stringify({ partes_vehiculos_v1: { EEE5555: { marca: 'OPEL' } } });
      window.__alerts = [];
      await FSStorage.init();
      return {
        alerts: window.__alerts.slice(),
        active: FSStorage.isActive(),
        leido: FSStorage.getItem('partes_vehiculos_v1'),
        ls: localStorage.getItem('partes_vehiculos_v1')
      };
    });

    ok('E: init() con archivo valido no avisa y queda activo', r.alerts.length === 0 && r.active === true, JSON.stringify(r));
    ok('E: la app lee los datos del archivo', !!r.leido && JSON.parse(r.leido).EEE5555.marca === 'OPEL', 'getItem=' + r.leido);
    ok('E: localStorage se actualiza con el archivo', !!r.ls && JSON.parse(r.ls).EEE5555.marca === 'OPEL', 'ls=' + r.ls);
    await page.close();
  }

  // ===== ESCENARIO F (control): reconnect() con un archivo valido fusiona y lo reescribe =====
  {
    const page = await abrir();
    const r = await page.evaluate(async () => {
      window.__fileText = '{}';
      await FSStorage.setup(true);
      window.__fileText = JSON.stringify({ partes_conductores_v1: ['ARCHIVO'] });
      localStorage.setItem('partes_conductores_v1', JSON.stringify(['LOCAL']));
      window.__perm = 'prompt';
      window.__alerts = [];
      await FSStorage.init();
      const okReconnect = await FSStorage.reconnect();
      await new Promise(r2 => setTimeout(r2, 100));
      return { okReconnect, alerts: window.__alerts.slice(), active: FSStorage.isActive(), file: window.__fileText };
    });

    let escrito = null; try { escrito = JSON.parse(r.file); } catch (e) {}
    ok('F: reconnect() con archivo valido no avisa y queda activo', r.okReconnect === true && r.alerts.length === 0 && r.active === true, JSON.stringify(r));
    ok('F: el archivo queda con la fusion de ambos lados', !!escrito && JSON.stringify(escrito.partes_conductores_v1) === '["ARCHIVO","LOCAL"]', 'archivo=' + r.file);
    await page.close();
  }

  // ===== ESCENARIO G: JSON valido pero que no es un objeto (null, lista, numero, texto) =====
  // No es corrupcion de sintaxis, pero tampoco son datos de la app: no se debe romper nada ni pisar el archivo.
  for (const contenido of ['null', '[]', '5', '"texto"']) {
    {
      const page = await abrir();
      const r = await page.evaluate(async (contenido) => {
        localStorage.setItem('partes_vehiculos_v1', JSON.stringify({ GGG7777: { marca: 'FIAT' } }));
        window.__fileText = contenido;
        const okSetup = await FSStorage.setup(true);
        await new Promise(r2 => setTimeout(r2, 100));
        return { okSetup, active: FSStorage.isActive(), file: window.__fileText };
      }, contenido);
      ok('G setup(' + contenido + '): no vincula ni sobreescribe el archivo', r.okSetup === false && r.active === false && r.file === contenido, JSON.stringify(r));
      await page.close();
    }
    {
      const page = await abrir();
      const r = await page.evaluate(async (contenido) => {
        window.__fileText = '{}';
        await FSStorage.setup(true);
        localStorage.setItem('partes_vehiculos_v1', JSON.stringify({ GGG7777: { marca: 'FIAT' } }));
        window.__fileText = contenido;
        await FSStorage.init();
        const out = { active: FSStorage.isActive() };
        try { out.leido = FSStorage.getItem('partes_vehiculos_v1'); } catch (e) { out.error = e.message; }
        try { FSStorage.setItem('partes_conductores_v1', JSON.stringify(['RUIZ'])); } catch (e) { out.errorSet = e.message; }
        await new Promise(r2 => setTimeout(r2, 100));
        out.file = window.__fileText;
        return out;
      }, contenido);
      ok('G init(' + contenido + '): la app sigue leyendo sus datos', !r.error && !!r.leido && JSON.parse(r.leido).GGG7777.marca === 'FIAT', JSON.stringify(r));
      ok('G init(' + contenido + '): guardar no rompe ni pisa el archivo', !r.errorSet && r.file === contenido, JSON.stringify(r));
      await page.close();
    }
  }

  console.log('\n=== RESULTADO:', pass, 'PASS /', fail, 'FAIL ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
