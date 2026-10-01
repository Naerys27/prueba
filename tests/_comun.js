// Utilidades compartidas por la bateria (no es un test: run_tests.sh solo lanza test_*.js).

const BASE = 'http://localhost:8899';

// "Hoy" de la bateria. Los datos sembrados usan fechas fijas (jul 2026) y la app purga por antiguedad
// (parte diario: MESES_A_CONSERVAR = 3; fotos de combustible: >3 meses). Con el reloj real los tests
// caducan solos; con el reloj fijado dan el mismo resultado cualquier dia.
const HOY_TESTS = '2026-07-15T10:00:00';

// Abre una pagina con el reloj del navegador arrancando en HOY_TESTS. El tiempo sigue corriendo
// (updatedAt distintos entre guardados) y los temporizadores funcionan a velocidad real.
// Antes de devolverla espera a que el Service Worker controle la pagina: en un contexto nuevo el SW
// se instala en la primera carga, hace clients.claim() y la app recarga en 'controllerchange'. Si esa
// recarga cae a mitad de test borra lo rellenado (Bug2 fallaba ~2 de cada 3 veces por esto).
async function nuevaPagina(browser, opciones) {
  const page = await browser.newPage(opciones);
  await page.clock.install({ time: HOY_TESTS });
  // Solo un documento cargado ya a traves del SW (el recargado) nace con controller.
  await page.addInitScript(() => { window.__nacioConSW = !!navigator.serviceWorker.controller; });
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__nacioConSW && document.readyState === 'complete', null, { polling: 50 });
  return page;
}

module.exports = { HOY_TESTS, nuevaPagina };
