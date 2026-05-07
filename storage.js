(function(global) {
  'use strict';

  var IDB_DB = 'partes_fss_v1';
  var IDB_STORE = 'config';
  var HANDLE_KEY = 'file_handle';
  var DATA_KEYS = ['partes_vehiculos_v1', 'partes_conductores_v1', 'cht_parte_servicio_diario_v1'];

  var _handle = null;
  var _cache = {};
  var _active = false;
  var _ready = false;
  var _queue = [];
  var _supported = typeof window.showSaveFilePicker === 'function';

  function openIDB() {
    return new Promise(function(res, rej) {
      var r = indexedDB.open(IDB_DB, 1);
      r.onupgradeneeded = function(e) { e.target.result.createObjectStore(IDB_STORE); };
      r.onsuccess = function(e) { res(e.target.result); };
      r.onerror = function(e) { rej(e.target.error); };
    });
  }

  function idbGet(key) {
    return openIDB().then(function(db) {
      return new Promise(function(res, rej) {
        var r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
        r.onsuccess = function(e) { res(e.target.result); };
        r.onerror = function(e) { rej(e.target.error); };
      });
    });
  }

  function idbPut(key, val) {
    return openIDB().then(function(db) {
      return new Promise(function(res, rej) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function() { res(); };
        tx.onerror = function(e) { rej(e.target.error); };
      });
    });
  }

  function idbDelete(key) {
    return openIDB().then(function(db) {
      return new Promise(function(res, rej) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = function() { res(); };
        tx.onerror = function(e) { rej(e.target.error); };
      });
    });
  }

  async function readFile(handle) {
    var file = await handle.getFile();
    var text = await file.text();
    if (!text || !text.trim()) return {};
    try { return JSON.parse(text); } catch(e) { return {}; }
  }

  async function writeFile(handle, data) {
    var w = await handle.createWritable();
    await w.write(JSON.stringify(data, null, 2));
    await w.close();
  }

  async function checkPermission(handle) {
    var opts = { mode: 'readwrite' };
    try {
      if (await handle.queryPermission(opts) === 'granted') return true;
      return (await handle.requestPermission(opts)) === 'granted';
    } catch(e) { return false; }
  }

  function loadLS() {
    DATA_KEYS.forEach(function(k) {
      var v = localStorage.getItem(k);
      if (v) try { _cache[k] = JSON.parse(v); } catch(e) {}
    });
  }

  function notify() {
    _ready = true;
    _queue.forEach(function(cb) { try { cb(); } catch(e) {} });
    _queue = [];
  }

  function mergeData(file, ls) {
    var result = {};
    var keys = {};
    Object.keys(file).forEach(function(k) { keys[k] = 1; });
    Object.keys(ls).forEach(function(k) { keys[k] = 1; });
    Object.keys(keys).forEach(function(k) {
      var fv = file[k], lv = ls[k];
      if (fv === undefined) { result[k] = lv; return; }
      if (lv === undefined) { result[k] = fv; return; }
      if (k === 'partes_vehiculos_v1') {
        result[k] = Object.assign({}, fv, lv);
      } else if (k === 'partes_conductores_v1') {
        var s = {};
        (Array.isArray(fv) ? fv : []).concat(Array.isArray(lv) ? lv : []).forEach(function(v) { if (v) s[v] = 1; });
        result[k] = Object.keys(s).sort();
      } else if (k === 'cht_parte_servicio_diario_v1') {
        var m = {};
        (Array.isArray(fv) ? fv : []).concat(Array.isArray(lv) ? lv : []).forEach(function(p) { if (p && p.id) m[p.id] = p; });
        result[k] = Object.values(m);
      } else {
        result[k] = lv;
      }
    });
    return result;
  }

  var FSStorage = {
    init: async function() {
      _ready = false;
      _active = false;
      _cache = {};
      if (!_supported) { loadLS(); notify(); return; }
      try {
        var handle = await idbGet(HANDLE_KEY);
        if (handle) {
          var ok = await checkPermission(handle);
          if (ok) {
            _handle = handle;
            _cache = await readFile(handle);
            _active = true;
          }
        }
      } catch(e) {
        console.warn('[FSStorage] init:', e.message);
      }
      if (!_active) loadLS();
      notify();
    },

    onReady: function(cb) {
      if (_ready) { try { cb(); } catch(e) {} }
      else _queue.push(cb);
    },

    isActive: function() { return _active; },
    isSupported: function() { return _supported; },

    setup: async function() {
      if (!_supported) {
        alert('Tu navegador no soporta esta función.\nUsa Chrome o Edge (Android o escritorio).');
        return false;
      }
      try {
        var useExisting = confirm(
          '¿Ya tienes un archivo de datos de partes guardado de una sesión anterior?\n\n' +
          'Aceptar → Seleccionar archivo existente\n' +
          'Cancelar → Crear archivo nuevo'
        );
        var handle;
        if (useExisting) {
          var picks = await window.showOpenFilePicker({
            types: [{ description: 'Datos JSON', accept: { 'application/json': ['.json'] } }]
          });
          handle = picks[0];
        } else {
          handle = await window.showSaveFilePicker({
            suggestedName: 'partes_datos.json',
            types: [{ description: 'Datos JSON', accept: { 'application/json': ['.json'] } }]
          });
        }
        var ok = await checkPermission(handle);
        if (!ok) {
          alert('Se necesita permiso de escritura para usar el archivo.');
          return false;
        }
        var fileData = {};
        try { fileData = await readFile(handle); } catch(e) {}
        var lsData = {};
        DATA_KEYS.forEach(function(k) {
          var v = localStorage.getItem(k);
          if (v) try { lsData[k] = JSON.parse(v); } catch(e) {}
        });
        var merged = mergeData(fileData, lsData);
        await writeFile(handle, merged);
        await idbPut(HANDLE_KEY, handle);
        _handle = handle;
        _cache = merged;
        _active = true;
        return true;
      } catch(e) {
        if (e.name === 'AbortError') return false;
        console.error('[FSStorage] setup:', e);
        alert('Error al configurar el archivo: ' + e.message);
        return false;
      }
    },

    disconnect: async function() {
      try { await idbDelete(HANDLE_KEY); } catch(e) {}
      _handle = null;
      _active = false;
    },

    getItem: function(key) {
      if (_active) {
        var v = _cache[key];
        return (v === undefined || v === null) ? null : JSON.stringify(v);
      }
      return localStorage.getItem(key);
    },

    setItem: function(key, value) {
      if (_active) {
        try { _cache[key] = JSON.parse(value); } catch(e) { _cache[key] = value; }
        writeFile(_handle, _cache).catch(function(e) {
          console.error('[FSStorage] write:', e.message);
        });
        return;
      }
      localStorage.setItem(key, value);
    },

    removeItem: function(key) {
      if (_active) {
        delete _cache[key];
        writeFile(_handle, _cache).catch(function(e) {
          console.error('[FSStorage] write:', e.message);
        });
        return;
      }
      localStorage.removeItem(key);
    }
  };

  global.FSStorage = FSStorage;
})(window);
