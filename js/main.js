// main.js — UI shell & navigasi, expose BioApp + Spinner helpers
(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    loadSavedDataFromStorage();
    loadAutoSuggestionsFromStorage();
  });

  try {
    const cache = Storage.getGasCache();
    if (cache && cache.length) {
      if (window.BioApp && typeof window.BioApp.renderReportTable === 'function') {
        window.BioApp.renderReportTable(cache); // gunakan renderer Anda sendiri
      }
    }
  } catch (e) { console.warn('Gagal render cache GAS:', e); }

  // =====================
  // Inisialisasi Aplikasi
  // =====================
  function initApp(){
  if (Storage.isAdminAuthenticated()) { showAdminSections(); }
  else { hideAdminSections(); }

  // atur batas maksimal (tidak boleh masa depan)
  const dateInput = document.getElementById('tanggal-lahir');
  if (dateInput){
    const todayIso = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    dateInput.max = todayIso;
  }

  // Filter input angka (untuk pattern="[0-9]+")
  const numberLikeInputs = document.querySelectorAll('input[type="text"][pattern="[0-9]+"]');
  numberLikeInputs.forEach(inp=>{
    inp.addEventListener('input', (e)=>{ e.target.value = e.target.value.replace(/\D/g,''); });
  });
}


  // ======================
  // Event Listeners (UI)
  // ======================
  function setupEventListeners(){
    // Navigasi antar section
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach((link)=>{
    link.addEventListener('click', (e)=>{
    const href = link.getAttribute('href') || '';

    // Abaikan link admin (punya handler sendiri) dan href kosong / '#'
    if (link.id === 'admin-login' || link.id === 'admin-logout' || href === '#' || !href.startsWith('#')) {
      return;
    }

    e.preventDefault();
    const targetId = href.substring(1);
    if (!targetId) return;

    showSection(targetId);
    updateNavigation(targetId);

    // render Report bila masuk tab report
    if (targetId === 'report') {
      window.BioApp?.renderReport?.();
    }

    // Tutup menu mobile
    const navMenu = document.querySelector('.nav-menu');
    navMenu && navMenu.classList.remove('active');
  });
});

    // Hamburger (mobile)
    const hamburger = document.querySelector('.hamburger');
    if (hamburger){
      hamburger.addEventListener('click', ()=>{
        const navMenu = document.querySelector('.nav-menu');
        navMenu && navMenu.classList.toggle('active');
      });
    }

    // Buka modal login admin
    const adminLoginBtn = document.getElementById('admin-login');
    if (adminLoginBtn){
      adminLoginBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        showAdminLogin();
      });
    }

    // Tutup modal (icon X)
    const closeModal = document.querySelector('.close');
    if (closeModal){ closeModal.addEventListener('click', ()=> hideAdminLogin()); }

    // Tutup modal saat klik di luar konten
    window.addEventListener('click', (e)=>{
      const modal = document.getElementById('admin-modal');
      if (e.target === modal) hideAdminLogin();
    });

    // Submit login admin (spinner + anti double-click)
    const adminLoginForm = document.getElementById('admin-login-form');
    if (adminLoginForm){
      adminLoginForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const btn = e.submitter || adminLoginForm.querySelector('button[type="submit"]');
        await withButtonLoading(btn, async ()=>{
          const password = document.getElementById('admin-password').value;
          if (password === 'admin123'){
            Storage.setAdminAuthenticated(true);
            showAdminSections();
            hideAdminLogin();
            showNotification('Login admin berhasil!', 'success');
          } else {
            showNotification('Password salah!', 'error');
          }
        }, { form: adminLoginForm, text: 'Memproses...' });
      });
    }

    // Logout admin (spinner + anti double-click)
    const adminLogoutBtn = document.getElementById('admin-logout');
    if (adminLogoutBtn){
      adminLogoutBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        await withButtonLoading(adminLogoutBtn, async ()=>{
          Storage.setAdminAuthenticated(false);
          hideAdminSections();
          showNotification('Anda telah keluar dari mode admin.', 'success');
        }, { text: 'Keluar...' });
      });
    }
  }

  // ======================
  // Section Visibility & Nav
  // ======================
  function showSection(sectionId){
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(sectionId);
    target && target.classList.add('active');
  }

  function updateNavigation(sectionId){
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link=>{
      const target = link.getAttribute('href');
      link.classList.toggle('active', target === `#${sectionId}`);
    });
  }

  function showAdminLogin(){
    const modal = document.getElementById('admin-modal');
    if (modal) modal.style.display = 'block';
  }

  function hideAdminLogin(){
    const modal = document.getElementById('admin-modal');
    if (modal) modal.style.display = 'none';
  }

  function showAdminSections(){
    document.querySelectorAll('.admin-only').forEach(el=> el.classList.remove('hidden'));
  }

  function hideAdminSections(){
    document.querySelectorAll('.admin-only').forEach(el=> el.classList.add('hidden'));
  }

  // ======================
  // Suggestions (datalist)
  // ======================
  function loadAutoSuggestionsFromStorage(){
    updateDataList('program-list'   , Storage.getSuggestions('program'));
    updateDataList('agama-list'     , Storage.getSuggestions('agama'));
    updateDataList('pendidikan-list', Storage.getSuggestions('pendidikan'));
    updateDataList('hubungan-list'  , Storage.getSuggestions('hubungan'));
    updateDataList('ukuran-list'    , Storage.getSuggestions('ukuran'));
  }

  function updateDataList(listId, suggestions){
    const dl = document.getElementById(listId);
    if (!dl) return;
    dl.innerHTML = '';
    (suggestions||[]).forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s;
      dl.appendChild(opt);
    });
  }

  // =====================
  // Restore form values
  // =====================
function loadSavedDataFromStorage(){
  const saved = Storage.getParticipantData() || {};
  Object.keys(saved).forEach((name)=>{
    const inp = document.querySelector(`[name="${name}"]`);
    if (!inp || typeof saved[name] === 'object') return;

    if (name === 'tanggal_lahir') {
      // simpanan lama mungkin DD/MM/YYYY → ubah ke ISO untuk input[type=date]
      const iso = toISODate(saved[name]); // helper di bawah
      inp.value = iso || saved[name];     // kalau gagal parse, biarkan apa adanya
    } else {
      inp.value = saved[name];
    }
  });
}


  // ======================
  // Spinner Helpers (global)
  // ======================
  function setButtonLoading(el, isLoading, text){
    if (!el) return;
    if (isLoading) {
      if (!el.dataset.originalText) el.dataset.originalText = (el.textContent || '').trim();
      if (text) el.textContent = text;
      el.classList.add('is-loading');
      if ('disabled' in el) el.disabled = true; else el.classList.add('is-disabled');
      el.setAttribute('aria-busy','true');
    } else {
      if (el.dataset.originalText) { el.textContent = el.dataset.originalText; delete el.dataset.originalText; }
      el.classList.remove('is-loading','is-disabled');
      if ('disabled' in el) el.disabled = false;
      el.removeAttribute('aria-busy');
    }
  }

  function setFormDisabled(form, disabled){
    if (!form) return;
    form.querySelectorAll('button, input, select, textarea, a.nav-link')
        .forEach(el => ('disabled' in el) ? (el.disabled = disabled) : el.classList.toggle('is-disabled', disabled));
  }

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function atLeast(promise, ms = 600){
    const [res] = await Promise.all([promise, sleep(ms)]);
    return res;
  }

  /**
   * Jalankan aksi async dengan state loading pada tombol, aman dari double click.
   * @param {HTMLElement} btn
   * @param {Function} asyncFn
   * @param {{form?: HTMLFormElement, text?: string, minDuration?: number}} opts
   */
  async function withButtonLoading(btn, asyncFn, opts = {}){
    const { form = btn && btn.closest('form'), text, minDuration = 600 } = opts;
    try {
      setFormDisabled(form, true);
      setButtonLoading(btn, true, text);
      const result = await atLeast(Promise.resolve().then(asyncFn), minDuration);
      return result;
    } finally {
      setButtonLoading(btn, false);
      setFormDisabled(form, false);
    }
  }

  function isISODateString(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}
function isDMYDateString(s) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(s || ''));
}
function dmyToISO(dmy) {
  if (!isDMYDateString(dmy)) return '';
  const [d,m,y] = dmy.split('/');
  return `${y}-${m}-${d}`;
}
function isoToDMY(iso) {
  if (!isISODateString(iso)) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
/** Terima DD/MM/YYYY atau YYYY-MM-DD → kembalikan YYYY-MM-DD (untuk input date) */
function toISODate(val) {
  if (!val) return '';
  if (isISODateString(val)) return val;
  if (isDMYDateString(val)) return dmyToISO(val);
  return '';
}

  // ======================
  // ====== IMPORT XLSX ===
  // ======================

  // dipanggil dari setupEventListeners()
  bindReportImportUI();

  function bindReportImportUI() {
    const fileInput = document.getElementById('xlsx-file');
    const btnParse  = document.getElementById('btn-parse-xlsx');
    const btnImport = document.getElementById('btn-import-gas');
    const btnLoad   = document.getElementById('btn-load-gas');

    if (btnParse) {
      btnParse.addEventListener('click', async () => {
        const file = fileInput?.files?.[0];
        if (!file) { showNotification('Pilih file .xlsx terlebih dahulu.', 'error'); return; }
        try {
          const rows = await readXlsxToObjects(file);
          const normalized = rows.map(normalizeImportedRow).filter(Boolean);
          const statsHtml = `<b>${normalized.length}</b> baris terdeteksi. Klik "Impor ke Google Sheets" untuk mengunggah.`;
          document.getElementById('import-stats').innerHTML = statsHtml;
          renderPreviewTable('xlsx-preview-table', normalized);
          // simpan sementara ke dataset tombol import
          btnImport.dataset.payload = JSON.stringify(normalized);
          btnImport.disabled = normalized.length === 0;
          showNotification('File berhasil diproses. Silakan review sebelum impor.', 'success');
        } catch (e) {
          console.error(e);
          showNotification('Gagal membaca file Excel. Pastikan format xlsx benar.', 'error');
        }
      });
    }

    if (btnImport) {
  btnImport.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const payloadStr = btn.dataset.payload || '[]';
    let rows;
    try { rows = JSON.parse(payloadStr); } catch { rows = []; }

    if (!Array.isArray(rows) || rows.length === 0) {
      showNotification('Tidak ada data yang siap diimpor.', 'error');
      return;
    }

    const skipDup = !!document.getElementById('skip-duplicates')?.checked;

    await withButtonLoading(btn, async () => {
      // (opsional) Skip duplikat berdasarkan NIK (pakai cache lokal)
      let filtered = rows;
      let skippedByFilter = 0;

      if (skipDup) {
        const cached = ensureGetRecordsCache();
        const nikSet = new Set(
          cached
            .map(r => String(r?.['NIK'] ?? r?.nik ?? '').replace(/\D/g,''))
            .filter(Boolean)
        );

        filtered = rows.filter(r => {
          const nik = String(r?.nik ?? '').replace(/\D/g,'');
          if (!nik) { skippedByFilter++; return false; }
          if (nikSet.has(nik)) { skippedByFilter++; return false; }
          nikSet.add(nik);
          return true;
        });
      }

      // === INI SNIPPET YANG KAMU TANYAKAN ===
      // Upload dengan progress modal
      const result = await BioApp.uploadRecordsToGASWithProgress(filtered);
      // result: { ok, fail, errors, canceled }

      const imported = result.ok || 0;
      const failed   = result.fail || 0;
      // jika dibatalkan, sisa yang belum diupload anggap dilewati
      const canceledRemainder = result.canceled ? (filtered.length - imported - failed) : 0;
      const totalSkipped = skippedByFilter + canceledRemainder;

      const summaryMsg = `Impor selesai: ${imported} sukses, ${totalSkipped} dilewati, ${failed} gagal${result.canceled ? ' (DIBATALKAN)' : ''}.`;
      document.getElementById('import-stats').textContent = summaryMsg;

      // Notifikasi ringkas
      showNotification(
        `Upload selesai. Berhasil: ${imported}, Gagal: ${failed}`,
        failed ? 'error' : 'success'
      );

      // Refresh tampilan tabel cache (uploadRecordsToGASWithProgress sudah memanggil fetch & cache ulang)
      const cachedNow = ensureGetRecordsCache();
      renderPreviewTable('gas-cache-table', cachedNow);
      const info = document.getElementById('gas-cache-info');
      if (info) info.textContent = `Cache: ${cachedNow.length} baris (disimpan di perangkat)`;
    }, { text: 'Mengimpor...' });
  });
}


    if (btnLoad) {
      btnLoad.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        await withButtonLoading(btn, async () => {
          const list = await fetchFromGoogleSheets(); // sudah meng-cache di gas-client.js (Storage / localStorage)
          renderPreviewTable('gas-cache-table', list);
          const info = document.getElementById('gas-cache-info');
          if (info) info.textContent = `Dari GAS: ${list.length} baris (juga disimpan di cache)`;
          showNotification('Data dari Google Sheets berhasil dimuat.', 'success');
        }, { text: 'Memuat...' });
      });
    }

    // render cache awal (jika ada)
    const cached = ensureGetRecordsCache();
    if (Array.isArray(cached) && cached.length) {
      renderPreviewTable('gas-cache-table', cached);
      const info = document.getElementById('gas-cache-info');
      if (info) info.textContent = `Cache: ${cached.length} baris (disimpan di perangkat)`;
    }
  }

  // Baca XLSX → array of objects (header dari baris pertama)
  async function readXlsxToObjects(file) {
    if (!window.XLSX) throw new Error('SheetJS (XLSX) belum dimuat');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // gunakan header otomatis, date akan diformat sebagai string human-readable
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    return rows; // [{Header1: "val", ...}, ...]
  }

  // Normalisasi satu baris import → bentuk internal app
  function normalizeImportedRow(row) {
    if (!row || typeof row !== 'object') return null;

    // map fleksibel: dukung "NIK", "NIK Peserta", "nik_peserta", dll
    const pick = (obj, keys) => {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
      }
      return '';
    };

    const snake = {};
    Object.keys(row).forEach(k => {
      const v = row[k];
      const s = String(k)
        .replace(/[.]/g,'')
        .replace(/\s+/g,'_')
        .replace(/([a-z])([A-Z])/g,'$1_$2')
        .toLowerCase();
      snake[s] = v;
      snake[k]  = v; // original juga
    });

    // ambil nilai
    let nik   = pick(snake, ['nik_peserta','nik','NIK','NIK Peserta']);
    let nama  = pick(snake, ['nama','Nama']);
    let prog  = pick(snake, ['program','Program']);
    let batch = pick(snake, ['batch','Batch']);
    let tmpL  = pick(snake, ['tempat_lahir','Tempat Lahir']);
    let tgl   = pick(snake, ['tanggal_lahir','Tanggal Lahir']);
    let agm   = pick(snake, ['agama','Agama']);
    let poh   = pick(snake, ['poh','POH']);
    let pend  = pick(snake, ['pendidikan_terakhir','pendidikan','Pendidikan Terakhir']);
    let skl   = pick(snake, ['asal_sekolah','sekolah','Asal Sekolah']);
    let dhr   = pick(snake, ['asal_daerah','daerah','Asal Daerah']);
    let hp    = pick(snake, ['no_hp','hp','No. HP']);
    let dar   = pick(snake, ['no_kontak_darurat','kontak_darurat','No. Kontak Darurat']);
    let hub   = pick(snake, ['hub_kontak_darurat','hubungan','Hub. Kontak Darurat']);
    let tggi  = pick(snake, ['tinggi_badan','tinggi','Tinggi Badan']);
    let brt   = pick(snake, ['berat_badan','berat','Berat Badan']);
    let uk    = pick(snake, ['ukuran_baju','Ukuran Baju']);

    // wajib minimal nik & nama
    nik = String(nik || '').replace(/\D/g,'');
    if (!nik) return null;

    // normalisasi tanggal → DMY (untuk konsistensi Storage)
    tgl = normalizeDateToDMY(tgl);

    // uppercase bbrp field
    nama = formatToUppercase(nama);
    prog = formatToUppercase(prog);
    tmpL = formatToUppercase(tmpL);
    agm  = formatToUppercase(agm);
    poh  = formatToUppercase(poh);
    pend = formatToUppercase(pend);
    skl  = formatToUppercase(skl);
    dhr  = formatToUppercase(dhr);
    hub  = formatToUppercase(hub);
    uk   = formatToUppercase(uk);

    // normalisasi telp
    hp  = formatPhoneNumber(hp);
    dar = formatPhoneNumber(dar);

    // kembalikan struktur internal (sesuai form-handler)
    return {
      nik: nik, nama: nama, program: prog, batch: batch,
      tempat_lahir: tmpL, tanggal_lahir: tgl, agama: agm, poh: poh,
      pendidikan: pend, sekolah: skl, daerah: dhr, hp: hp,
      kontak_darurat: dar, hubungan: hub, tinggi: tggi, berat: brt, ukuran_baju: uk
    };
  }

  // Normalize tanggal masuk → "DD/MM/YYYY"
  function normalizeDateToDMY(val) {
    if (!val) return '';
    const s = String(val).trim();
    // ISO → DMY
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`;
    }
    // DMY valid → pakai apa adanya
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      return s;
    }
    // coba parse Date()
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2,'0');
      const mm = String(dt.getMonth()+1).padStart(2,'0');
      const yy = dt.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
    return '';
  }

  // Render array objek ke tabel sederhana (head dari keys gabungan)
  function renderPreviewTable(tableId, rows) {
    const tbl = document.getElementById(tableId);
    if (!tbl) return;
    const thead = tbl.querySelector('thead');
    const tbody = tbl.querySelector('tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    const list = Array.isArray(rows) ? rows : [];

    if (!list.length) {
      thead.innerHTML = '<tr><th>Tidak ada data</th></tr>';
      return;
    }
    // head dari union keys (urutkan biar stabil)
    const keys = Array.from(
      list.reduce((set, r) => { Object.keys(r).forEach(k=>set.add(k)); return set; }, new Set())
    );
    // taruh NIK paling depan kalau ada
    const nikIdx = keys.indexOf('nik');
    if (nikIdx > 0) { keys.splice(nikIdx, 1); keys.unshift('nik'); }

    thead.innerHTML = '<tr>' + keys.map(k=>`<th>${k}</th>`).join('') + '</tr>';
    const frag = document.createDocumentFragment();
    list.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = keys.map(k=>`<td>${(r[k] ?? '')}</td>`).join('');
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  // Ambil cache records GAS dari Storage/localStorage
  function ensureGetRecordsCache() {
    if (window.Storage && typeof Storage.getRecordsCache === 'function') {
      return Storage.getRecordsCache() || [];
    }
    try {
      const raw = localStorage.getItem('gasRecordsCache');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // Simpan cache records ke Storage/localStorage
  function setRecordsCacheSafe(list) {
    if (window.Storage && typeof Storage.setRecordsCache === 'function') {
      try { Storage.setRecordsCache(list); return; } catch {}
    }
    try { localStorage.setItem('gasRecordsCache', JSON.stringify(list)); } catch {}
  }

  // Impor ke GAS satu-per-satu, skip dupe NIK bila diminta
  async function importRowsToGAS(rows, { skipDuplicates = true } = {}) {
    const cached = ensureGetRecordsCache();
    const nikSet = new Set(
      cached.map(r => String(r?.['NIK'] ?? r?.nik ?? '').replace(/\D/g,'')).filter(Boolean)
    );

    let imported = 0, skipped = 0, failed = 0;
    // proses baris
    for (const rec of rows) {
      const nik = String(rec?.nik ?? '').replace(/\D/g,'');
      if (!nik) { skipped++; continue; }

      if (skipDuplicates && nikSet.has(nik)) {
        skipped++;
        continue;
      }

      try {
        // kirim mentah (GAS side sudah punya pemetaan header fleksibel)
        await submitToGoogleSheets(rec);
        imported++;
        nikSet.add(nik);

        // tambahkan ke cache lokal bentuk header-lembar agar rapi di tabel bawah
        const mapped = mapInternalToSheetHeaders(rec);
        cached.push(mapped);
      } catch (e) {
        console.error('Gagal impor row NIK:', nik, e);
        failed++;
      }
    }

    // simpan cache yang sudah ditambah
    setRecordsCacheSafe(cached);
    return { imported, skipped, failed };
  }

  // mapping internal (form) → header sheet supaya tampilan cache konsisten
  function mapInternalToSheetHeaders(m) {
    return {
      'ID': '', 'Timestamp': '',
      'NIK': m.nik || '',
      'Nama': m.nama || '',
      'Program': m.program || '',
      'Batch': m.batch || '',
      'Tempat Lahir': m.tempat_lahir || '',
      'Tanggal Lahir': m.tanggal_lahir || '',
      'Agama': m.agama || '',
      'POH': m.poh || '',
      'Pendidikan Terakhir': m.pendidikan || '',
      'Asal Sekolah': m.sekolah || '',
      'Asal Daerah': m.daerah || '',
      'No. HP': m.hp || '',
      'No. Kontak Darurat': m.kontak_darurat || '',
      'Hub. Kontak Darurat': m.hubungan || '',
      'Tinggi Badan': m.tinggi || '',
      'Berat Badan': m.berat || '',
      'Ukuran Baju': m.ukuran_baju || '',
      'Lokasi Penempatan': m.lokasi_penempatan || '',
      'Region': m.region || '',
      'Estate': m.estate || '',
      'Divisi': m.divisi || '',
      'Nilai Program': m.nilai_program || ''
    };
  }


  // ===== Upload Progress Controller =====
const UploadProgress = (() => {
  let modal, fill, statusEl, countEl, percentEl, closeBtn, cancelBtn, errorsEl;
  let total = 0, done = 0, canceled = false, isOpen = false;

  function el(id){ return document.getElementById(id); }

  function ensureInit(){
    if (modal) return;
    modal     = el('upload-progress-modal');
    fill      = el('upload-progress-fill');
    statusEl  = el('upload-progress-status');
    countEl   = el('upload-progress-count');
    percentEl = el('upload-progress-percent');
    closeBtn  = el('upload-progress-close');
    cancelBtn = el('upload-progress-cancel');
    errorsEl  = el('upload-progress-errors');

    // tutup hanya bila selesai; saat proses berjalan, close akan memicu cancel
    closeBtn && closeBtn.addEventListener('click', () => {
      if (!isOpen) return;
      if (done < total) {
        // proses masih berjalan → anggap cancel
        requestCancel();
      } else {
        hide();
      }
    });

    cancelBtn && cancelBtn.addEventListener('click', requestCancel);

    // klik area luar modal untuk close hanya jika sudah selesai
    window.addEventListener('click', (e)=>{
      if (e.target === modal && done >= total) hide();
    });
  }

  function open(title, t){
    ensureInit();
    total = t || 0;
    done = 0;
    canceled = false;
    isOpen = true;
    statusEl.textContent = title || 'Mengunggah…';
    countEl.textContent = `0 / ${total}`;
    percentEl.textContent = '0%';
    fill.style.width = '0%';
    errorsEl.textContent = '';
    errorsEl.classList.add('hidden');
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Batalkan';
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  }

  function update(progressDone, msg){
    done = progressDone;
    if (msg) statusEl.textContent = msg;
    const pct = total ? Math.floor((done/total) * 100) : 0;
    countEl.textContent = `${done} / ${total}`;
    percentEl.textContent = `${pct}%`;
    fill.style.width = pct + '%';
  }

  function appendError(line){
    errorsEl.classList.remove('hidden');
    const div = document.createElement('div');
    div.textContent = line;
    errorsEl.appendChild(div);
  }

  function requestCancel(){
    canceled = true;
    statusEl.textContent = 'Membatalkan…';
    cancelBtn.disabled = true;
  }

  function isCanceled(){ return canceled; }

  function doneAll(msg){
    update(total, msg || 'Selesai.');
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Tutup';
    cancelBtn.onclick = hide; // ubah fungsi cancel menjadi tutup
  }

  function fail(msg){
    statusEl.textContent = msg || 'Gagal mengunggah.';
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Tutup';
    cancelBtn.onclick = hide;
  }

  function hide(){
    isOpen = false;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  return { open, update, appendError, isCanceled, doneAll, fail, hide };
})();

// ===== Helper upload dengan progress (panggil ini saat import) =====
async function uploadRecordsToGASWithProgress(records, { delayMs = 120 } = {}){
  if (!Array.isArray(records) || !records.length) {
    showNotification('Tidak ada data untuk diunggah.', 'error');
    return { ok: 0, fail: 0, errors: [] };
  }

  UploadProgress.open(`Mengunggah ${records.length} data…`, records.length);

  let ok = 0, fail = 0;
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    if (UploadProgress.isCanceled()) {
      UploadProgress.fail(`Dibatalkan. Berhasil: ${ok}, Gagal: ${fail}.`);
      return { ok, fail, errors, canceled: true };
    }

    try {
      await submitToGoogleSheets(records[i]);       // <— fungsi yang sudah kamu pakai
      ok++;
    } catch (e) {
      fail++;
      const msg = `Baris ${i+1}: ${e && e.message ? e.message : e}`;
      errors.push(msg);
      UploadProgress.appendError(msg);
    }

    UploadProgress.update(i + 1, 'Mengunggah…');

    if (delayMs) { // beri jeda kecil agar UI smooth & menghindari rate limit
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // selesai
  if (fail === 0) {
    UploadProgress.doneAll('Selesai mengunggah semua data.');
  } else {
    UploadProgress.fail(`Selesai dengan ${ok} berhasil, ${fail} gagal.`);
  }

  // opsional: refresh cache lokal dari GAS agar tabel admin up-to-date
  try {
    if (typeof fetchFromGoogleSheets === 'function') {
      const latest = await fetchFromGoogleSheets();
      if (window.Storage && typeof Storage.setGasCache === 'function') {
        Storage.setGasCache(latest);
      }
    }
  } catch (e) { /* diamkan */ }

  return { ok, fail, errors, canceled: false };
}



  // ======================
  // Expose ke global (BioApp)
  // ======================
  window.BioApp = Object.freeze({
    // Navigasi & admin UI
    showSection,
    updateNavigation,
    showAdminLogin,
    hideAdminLogin,
    showAdminSections,
    hideAdminSections,

    // Utilitas UI
    reloadSuggestions: loadAutoSuggestionsFromStorage,

    // Spinner helpers agar bisa dipakai file lain
    withButtonLoading,
    setButtonLoading,
    setFormDisabled,

     // progress upload
    uploadRecordsToGASWithProgress,
    ProgressUI: UploadProgress,

    renderReport: () => {}
  });

})();
