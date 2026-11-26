// ================================================================
// shim.js  -  meniru google.script.run agar index.html lama tetap jalan
// Cukup ubah SATU baris di bawah (API_URL).
// ================================================================
(function () {
  // >>> GANTI "GANTI_PROJECT_REF" dengan Project ref Supabase Anda <<<
  var API_URL = 'https://uylmaybxbiughmdjhipq.supabase.co/functions/v1/api';
  var BATAS_WAKTU_MS = 60000;

  // ---------- Fungsi yang dijawab langsung di browser (tanpa server) ----------
  var lokal = {
    // Dulu: ScriptApp.getService().getUrl(). Sekarang: alamat halaman ini.
    getUrlWebApp: function () {
      return { status: 'success', url: location.origin + location.pathname };
    }
  };

  // ---------- Kirim satu panggilan ke Edge Function ----------
  function panggilServer(nama, args) {
    var kontrol = new AbortController();
    var timer = setTimeout(function () { kontrol.abort(); }, BATAS_WAKTU_MS);
    return fetch(API_URL, {
      method: 'POST',
      // text/plain: permintaan "sederhana", tidak perlu preflight (lebih cepat di HP)
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ fn: nama, args: args }),
      signal: kontrol.signal
    }).then(function (r) {
      clearTimeout(timer);
      return r.json();
    }).then(function (j) {
      if (j && j.ok) return j.data;
      throw new Error((j && j.message) || 'Server tidak memberi jawaban.');
    }).catch(function (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new Error('Koneksi terlalu lama. Coba lagi.');
      if (e instanceof TypeError) throw new Error('Tidak dapat terhubung ke server. Periksa internet Anda.');
      throw e;
    });
  }

  // ---------- Runner berantai: .withSuccessHandler(f).withFailureHandler(g).namaFungsi(...) ----------
  function buatRunner(ok, gagal) {
    return new Proxy({}, {
      get: function (_, nama) {
        if (typeof nama !== 'string' || nama === 'then') return undefined;
        if (nama === 'withSuccessHandler') return function (f) { return buatRunner(f, gagal); };
        if (nama === 'withFailureHandler') return function (g) { return buatRunner(ok, g); };
        if (nama === 'withUserObject') return function () { return buatRunner(ok, gagal); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          var janji;
          try {
            janji = lokal[nama] ? Promise.resolve(lokal[nama].apply(null, args)) : panggilServer(nama, args);
          } catch (e) { janji = Promise.reject(e); }
          // Bentuk then(a, b): galat di dalam handler sukses tidak ikut memanggil handler gagal.
          janji.then(
            function (data) { if (ok) ok(data); },
            function (err) {
              if (gagal) gagal(err);
              else if (window.console) console.error('Panggilan ' + nama + ' gagal:', err);
            }
          );
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = buatRunner(null, null);
  // Sengaja TIDAK membuat google.script.history / google.script.url,
  // sehingga index memakai localStorage (sim_sesi) untuk menyimpan sesi.

  // ---------- "Link Masuk Otomatis": ambil #sesi=<token> dari alamat halaman ----------
  try {
    var m = String(location.hash || '').match(/sesi=([0-9a-f]{64})/);
    if (m) {
      localStorage.setItem('sim_sesi', m[1]);
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) { /* abaikan */ }
})();