// ================================================================
// shim.js  -  meniru google.script.run agar index.html lama tetap jalan
// Cukup ubah SATU baris di bawah (API_URL).
// ================================================================
(function () {
  // >>> GANTI "GANTI_PROJECT_REF" dengan Project ref Supabase Anda <<<
  var API_URL = 'https://uylmaybxbiughmdjhipq.supabase.co/functions/v1/api';
  var BATAS_WAKTU_MS = 60000;

  // ---------- Token sesi ----------
  // doLogin sekarang sekaligus membuat sesi: tokennya disimpan di sini lalu ke localStorage (sim_sesi).
  var tokenBaru = null;
  function tokenSesi() {
    if (tokenBaru) return tokenBaru;
    try { return localStorage.getItem('sim_sesi') || ''; } catch (e) { return ''; }
  }

  // ---------- Fungsi yang dijawab langsung di browser (tanpa server) ----------
  // Mengembalikan undefined = tidak dijawab di sini, teruskan ke server.
  var lokal = {
    // Dulu: ScriptApp.getService().getUrl(). Sekarang: alamat halaman ini.
    getUrlWebApp: function () {
      return { status: 'success', url: location.origin + location.pathname };
    },
    // index.html memanggil buatSesiLogin tepat setelah login. Sesinya sudah dibuat oleh doLogin,
    // jadi cukup dijawab dengan token itu (lebih cepat, dan tidak ada sesi ganda).
    buatSesiLogin: function () {
      if (!tokenBaru) return undefined;
      var t = tokenBaru;
      tokenBaru = null;
      return { status: 'success', token: t };
    }
  };

  // Pengolahan hasil dari server sebelum diberikan ke tampilan.
  var sesudah = {
    doLogin: function (hasil) {
      if (hasil && hasil.status === 'success' && hasil.token) {
        tokenBaru = hasil.token;
        try { localStorage.setItem('sim_sesi', hasil.token); } catch (e) { /* abaikan */ }
        delete hasil.token; // token tidak ikut ke tampilan (agar tidak tersimpan di sessionStorage)
      }
      return hasil;
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
      body: JSON.stringify({ fn: nama, args: args, token: tokenSesi() }),
      signal: kontrol.signal
    }).then(function (r) {
      clearTimeout(timer);
      return r.json();
    }).then(function (j) {
      if (j && j.ok) return sesudah[nama] ? sesudah[nama](j.data) : j.data;
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
            var hasilLokal = lokal[nama] ? lokal[nama].apply(null, args) : undefined;
            janji = hasilLokal !== undefined ? Promise.resolve(hasilLokal) : panggilServer(nama, args);
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
