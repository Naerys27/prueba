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

// Init script: File System Access API falso para probar storage.js. El "archivo" es window.__fileText,
// el permiso window.__perm ('granted' | 'prompt' | 'denied') y los alert() quedan en window.__alerts.
// El IndexedDB falso recuerda lo guardado (init() relee el handle persistido), a diferencia del de
// test_stripOldPhotos.js.
function stubFS() {
  window.__fileText = '';
  window.__perm = 'granted';
  window.__alerts = [];
  window.alert = (msg) => { window.__alerts.push(msg); };
  const idbStore = {};
  const fakeDb = {
    createObjectStore() {},
    transaction() {
      const tx = {
        objectStore: () => ({
          put: (val, key) => { idbStore[key] = val; return {}; },
          get: (key) => { const rq = {}; setTimeout(() => rq.onsuccess && rq.onsuccess({ target: { result: idbStore[key] } }), 0); return rq; },
          delete: (key) => { delete idbStore[key]; return {}; }
        })
      };
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
      return tx;
    }
  };
  Object.defineProperty(window, 'indexedDB', { value: { open: () => { const r = { result: fakeDb }; setTimeout(() => r.onsuccess && r.onsuccess({ target: { result: fakeDb } }), 0); return r; } } });
  const handle = {
    queryPermission: async () => window.__perm,
    requestPermission: async () => 'granted',
    getFile: async () => ({ text: async () => window.__fileText }),
    createWritable: async () => ({ write: async (t) => { window.__fileText = t; }, close: async () => {} })
  };
  window.showSaveFilePicker = async () => handle;
  window.showOpenFilePicker = async () => [handle];
}

module.exports = { HOY_TESTS, nuevaPagina, stubFS };
