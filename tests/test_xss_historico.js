// Datos guardados con HTML dentro (p. ej. un JSON importado o vinculado manipulado) no deben ejecutarse
// al pintar el historial de Parte Combustible ni al cargarlo en el formulario.
const { chromium } = require('playwright');
const { nuevaPagina } = require('./_comun');

(async () => {
  const BASE = 'http://localhost:8899';
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  function ok(name, cond, extra) { if (cond) { console.log('PASS', name); pass++; } else { console.log('FAIL', name, extra || ''); fail++; } }

  // Cada payload apunta en window.__xss por donde se ha colado
  const marca = (donde) => "(window.__xss=window.__xss||[]).push('" + donde + "')";
  const FOTO_MALA = 'x" onerror="' + marca('foto');
  const FOTO_BUENA = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const TEXTO_MALO = '<img src=x onerror="' + marca('texto') + '">';
  const MES_MALO = '<img src=x onerror="' + marca('mes') + '">-06';

  // Mes distinto al de HOY_TESTS (jul 2026) para que la pagina no lo cargue sola al arrancar
  const HIST = {
    'AAA1111/2026-06': {
      mat: 'AAA1111', mes: '2026-06', tipo: 'gasolina', updatedAt: '2026-06-30T10:00:00Z',
      entries: [
        { kms: TEXTO_MALO, eur: TEXTO_MALO, lit: '5', fecha: '2026-06-01' },
        { kms: '200', eur: '20', lit: '10', fecha: '2026-06-02' },
        { kms: '300', eur: '30', lit: '15', fecha: '2026-06-03' }
      ],
      photos: { 0: { data: FOTO_MALA, w: 10, h: 10 }, 2: { data: FOTO_BUENA, w: 1, h: 1 } }
    },
    'BBB2222/2026-05': {
      mat: 'BBB2222', mes: MES_MALO, tipo: 'gasolina', updatedAt: '2026-05-30T10:00:00Z',
      entries: [{ kms: '100', eur: '10', lit: '5', fecha: '2026-05-01' }]
    }
  };

  const page = await nuevaPagina(browser);
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/parte_combustible.html');
  await page.evaluate((hist) => { localStorage.clear(); localStorage.setItem('partes_combustible_hist_v1', JSON.stringify(hist)); }, HIST);
  await page.reload();
  await page.waitForTimeout(400);

  // ===== A: pintar el historial =====
  await page.evaluate(() => {
    renderHistorico();
    document.querySelectorAll('#hist-list .hist-hdr').forEach(h => toggleHistEntry(h));
  });
  await page.waitForTimeout(300);
  const a = await page.evaluate((FOTO_MALA) => {
    const entradas = Array.from(document.querySelectorAll('#hist-list .hist-entry'));
    const deA = entradas.find(e => e.querySelectorAll('.hist-row').length === 3);
    const filas = deA ? Array.from(deA.querySelectorAll('.hist-row')) : [];
    return {
      xss: (window.__xss || []).slice(),
      nEntradas: entradas.length,
      conOnerror: document.querySelectorAll('#hist-list [onerror]').length,
      imgsPorFila: filas.map(f => f.querySelectorAll('img').length),
      srcFoto0: filas[0] && filas[0].querySelector('img') ? filas[0].querySelector('img').getAttribute('src') : null,
      srcFoto2: filas[2] && filas[2].querySelector('img') ? filas[2].querySelector('img').getAttribute('src') : null,
      textoFila0: filas[0] ? filas[0].querySelector('span').textContent : null,
      fotoMalaIgual: filas[0] && filas[0].querySelector('img') ? filas[0].querySelector('img').getAttribute('src') === FOTO_MALA : false
    };
  }, FOTO_MALA);

  ok('A: se pintan los dos partes', a.nEntradas === 2, 'entradas=' + a.nEntradas);
  ok('A: no se ejecuta nada desde los repostajes ni las fotos', !a.xss.includes('texto') && !a.xss.includes('foto'), 'xss=' + JSON.stringify(a.xss));
  ok('A: no aparece ningun atributo onerror en el historial', a.conOnerror === 0, 'n=' + a.conOnerror);
  ok('A: el texto con HTML se ve como texto', !!a.textoFila0 && a.textoFila0.includes('<img src=x'), 'texto=' + a.textoFila0);
  ok('A: solo las filas con foto llevan imagen', JSON.stringify(a.imgsPorFila) === '[1,0,1]', JSON.stringify(a.imgsPorFila));
  ok('A: la foto manipulada queda como src literal', a.fotoMalaIgual, 'src=' + a.srcFoto0);
  ok('A: una foto normal se sigue mostrando', a.srcFoto2 === FOTO_BUENA, 'src=' + a.srcFoto2);
  ok('A: el mes del parte no se ejecuta en la cabecera', !a.xss.includes('mes'), 'xss=' + JSON.stringify(a.xss));

  // ===== B: "Cargar en el formulario" el parte con la foto manipulada =====
  await page.evaluate(() => { window.__xss = []; loadHistorico('AAA1111/2026-06'); });
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => ({
    xss: (window.__xss || []).slice(),
    conOnerror: document.querySelectorAll('#rep-list [onerror]').length,
    srcs: Array.from(document.querySelectorAll('#rep-list img')).map(i => i.getAttribute('src'))
  }));
  ok('B: cargar el parte no ejecuta la foto manipulada', !b.xss.includes('foto'), 'xss=' + JSON.stringify(b.xss));
  ok('B: no aparece ningun atributo onerror en la lista de repostajes', b.conOnerror === 0, 'n=' + b.conOnerror);
  ok('B: las dos fotos se muestran con su src literal', b.srcs.length === 2 && b.srcs.includes(FOTO_MALA) && b.srcs.includes(FOTO_BUENA), JSON.stringify(b.srcs));

  console.log('\n=== RESULTADO:', pass, 'PASS /', fail, 'FAIL ===');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
