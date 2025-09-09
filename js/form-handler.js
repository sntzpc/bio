// form-handler.js — Integrasi form + Admin pages + Report kolektif (search/filter/sort/paging)
(() => {
  'use strict';

  // === Konfigurasi ===
  const ENABLE_GAS_SYNC = true;

  // State untuk report kolektif
  let GAS_DATA = [];   // semua dari GAS (array of objects)
  let GAS_VIEW = [];   // hasil filter+sort
  const STATE = {
    q: '',
    program: '',
    region: '',
    batchMin: '',
    batchMax: '',
    sort: 'timestamp_desc',
    page: 1,
    pageSize: 10
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindFormHandlers();
    bindReportControls();
    setupInputHandlers();
    populateFormFromStorage();
    renderLocalSummary(); // ringkasan peserta aktif (lokal)
  });

  // ==========================
  // Binding Form Utama & Admin
  // ==========================
  function bindFormHandlers(){
    const f1 = document.getElementById('personal-data-form');
    if (f1) f1.addEventListener('submit', onPersonalDataSubmit);

    const f2 = document.getElementById('shirt-size-form');
    if (f2) f2.addEventListener('submit', onShirtSizeSubmit);

    const f3 = document.getElementById('placement-form');
    if (f3) f3.addEventListener('submit', onPlacementSubmit);

    const f4 = document.getElementById('score-form');
    if (f4) f4.addEventListener('submit', onScoreSubmit);

    // Toolbar Report Lokal
    const syncBtn  = document.getElementById('sync-now-btn');
    const exportJ  = document.getElementById('export-json-btn');
    const exportC  = document.getElementById('export-csv-btn');
    const clearBtn = document.getElementById('clear-local-btn');
    const loadBtn  = document.getElementById('load-from-gas-btn');

    if (syncBtn){
      syncBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        await callWithButtonLoading(syncBtn, syncNowToGAS, { text:'Sinkron...' });
      });
    }
    if (exportJ){
      exportJ.addEventListener('click', (e)=>{
        e.preventDefault();
        const uri = Storage.exportData();
        if (!uri) return showNotification('Gagal export JSON.', 'error');
        const a = document.createElement('a');
        a.href = uri; a.download = 'training-data.json';
        document.body.appendChild(a); a.click(); a.remove();
      });
    }
    if (exportC){
      exportC.addEventListener('click', (e)=>{
        e.preventDefault();
        exportCurrentAsCSV();
      });
    }
    if (clearBtn){
      clearBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        await callWithButtonLoading(clearBtn, async ()=>{
          Storage.clearParticipantData();
          showNotification('Data lokal dibersihkan.', 'success');
          clearForms();
          renderLocalSummary();
        }, { text:'Membersihkan...' });
      });
    }
    if (loadBtn){
      loadBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        await callWithButtonLoading(loadBtn, async ()=>{
          await loadAllFromGAS();
        }, { text:'Memuat...' });
      });
    }
  }

  // ======================
  // Kontrol Report Kolektif
  // ======================
  function bindReportControls(){
    const search = document.getElementById('report-search');
    const prog   = document.getElementById('filter-program');
    const region = document.getElementById('filter-region');
    const bmin   = document.getElementById('filter-batch-min');
    const bmax   = document.getElementById('filter-batch-max');
    const sort   = document.getElementById('sort-by');
    const ps     = document.getElementById('page-size');

    if (search){
      search.addEventListener('input', debounce(()=>{
        STATE.q = (search.value||'').trim().toLowerCase();
        STATE.page = 1; applyFiltersSortRender();
      }, 250));
    }
    if (prog){
      prog.addEventListener('change', ()=>{
        STATE.program = prog.value || '';
        STATE.page = 1; applyFiltersSortRender();
      });
    }
    if (region){
      region.addEventListener('change', ()=>{
        STATE.region = region.value || '';
        STATE.page = 1; applyFiltersSortRender();
      });
    }
    if (bmin){
      bmin.addEventListener('input', ()=>{
        STATE.batchMin = bmin.value;
        STATE.page = 1; applyFiltersSortRender();
      });
    }
    if (bmax){
      bmax.addEventListener('input', ()=>{
        STATE.batchMax = bmax.value;
        STATE.page = 1; applyFiltersSortRender();
      });
    }
    if (sort){
      sort.addEventListener('change', ()=>{
        STATE.sort = sort.value;
        STATE.page = 1; applyFiltersSortRender();
      });
    }
    if (ps){
      ps.addEventListener('change', ()=>{
        STATE.pageSize = parseInt(ps.value,10)||10;
        STATE.page = 1; applyFiltersSortRender();
      });
    }
  }

  // =======================
  // Submit: Data Pribadi
  // =======================
  async function onPersonalDataSubmit(e){
  e.preventDefault();
  const form = e.target;
  const btn  = e.submitter || form.querySelector('button[type="submit"]');

  // --- AMBIL SNAPSHOT SEBELUM DISABLE ---
  const raw  = new FormData(form);
  const data = Object.fromEntries(raw.entries());

  // Normalisasi tanggal ke DMY jika input[type=date] memberi ISO
  if (data.tanggal_lahir && isISODateString(data.tanggal_lahir)) {
    const dmy = isoToDMY(data.tanggal_lahir);
    if (dmy) data.tanggal_lahir = dmy;
  }

  await callWithButtonLoading(btn, async () => {
    // --- PAKAI SNAPSHOT "data", JANGAN BACA FORM LAGI DI SINI ---

    // Normalisasi NIK Peserta → hanya angka
data.nik = String(data.nik || '').replace(/\D/g, '');

// Cek duplikasi NIK Peserta dari cache/remote
const existingRecords = await ensureRecordsCacheLoaded(false);
const isDupe = Array.isArray(existingRecords) && existingRecords.some(rec => {
  const nikSheet = String(rec?.['NIK'] ?? rec?.nik ?? '').replace(/\D/g, '');
  return nikSheet && nikSheet === data.nik;
});

if (isDupe) {
  showNotification('NIK Peserta tersebut sudah terdaftar. Untuk mengubah data, silakan lakukan edit di halaman Report.', 'error');
  return;
}


    // Validasi
    if (!validatePersonalData(data)){
      showNotification('Harap isi semua field yang wajib diisi dengan format yang benar!', 'error');
      return;
    }

    // Normalisasi/format
    const formatted = formatPersonalData(data);

    // Simpan ke Storage
    Storage.saveParticipantData(formatted);

    // Simpan suggestions
    saveSuggestionsFromPersonal(formatted);

    // Refresh datalist (agar opsi baru muncul)
    window.BioApp?.reloadSuggestions?.();

    // Arahkan ke langkah berikut
    window.BioApp?.showSection?.('ukuran-baju');
    window.BioApp?.updateNavigation?.('ukuran-baju');
    showNotification('Data pribadi berhasil disimpan!', 'success');
  }, { form, text: 'Menyimpan...' });
}

  // =====================
  // Submit: Ukuran Baju
  // =====================
    async function onShirtSizeSubmit(e){
  e.preventDefault();

  const form = e.target;
  const btn  = e.submitter || form.querySelector('button[type="submit"]');

  // --- AMBIL SNAPSHOT SEBELUM DISABLE ---
  const raw  = new FormData(form);
  const data = Object.fromEntries(raw.entries());

  await callWithButtonLoading(btn, async () => {
    // --- PAKAI SNAPSHOT "data", JANGAN BACA FORM LAGI DI SINI ---

    if (!data.ukuran_baju || !String(data.ukuran_baju).trim()){
      showNotification('Harap pilih ukuran baju!', 'error');
      return;
    }

    // Simpan ukuran ke Storage (merge)
    Storage.saveParticipantData({ ukuran_baju: data.ukuran_baju });

    // Simpan suggestion ukuran
    Storage.saveSuggestion('ukuran', data.ukuran_baju);

    // Refresh datalist ukuran
    window.BioApp?.reloadSuggestions?.();

    showNotification('Ukuran baju berhasil disimpan!', 'success');

    // Opsional: kirim ke Google Sheets
if (ENABLE_GAS_SYNC){
  try{
    const payload = Storage.getParticipantData();
    if (!payload || Object.keys(payload).length === 0){
      showNotification('Data lokal kosong, tidak ada yang dikirim.', 'error');
      return;
    }

    // ====== CEK DUPLIKAT BERDASARKAN NIK PESERTA (LOKAL CACHE) ======
    const nikNow = Storage.sanitizeNikPeserta?.(payload.nik) || '';
    if (!nikNow){
      showNotification('NIK Peserta tidak valid.', 'error');
      return;
    }
    await ensureRecordsCacheLoaded();                 // pastikan cache terisi
    const known = Storage.getKnownNIKs?.() || [];
    if (known.includes(nikNow) || Storage.findRecordByNik?.(nikNow)) {
      showNotification('NIK Peserta sudah terdaftar. Silakan edit datanya melalui menu Report.', 'error');
      return; // BLOKIR CREATE
    }

    // ====== SAFE TO CREATE ======
    await submitToGoogleSheets(payload);

    // perbarui indeks NIK lokal + refresh cache dari server
    Storage.upsertKnownNIK?.(nikNow);
    try { await fetchFromGoogleSheets(); } catch(e){ /* diamkan */ }

    Storage.setSyncStatus({ synced:true, lastSync:new Date().toISOString(), server:'GAS' });
    showNotification('Data tersinkron ke Google Sheets.', 'success');
  }catch(err){
    // Deteksi error duplikat dari server (lihat patch GAS)
    const msg = String(err?.message || err || '');
    if (/DUPLICATE_NIK/i.test(msg)) {
      showNotification('NIK Peserta sudah terdaftar di server. Gunakan menu Report untuk mengedit.', 'error');
    } else {
      showNotification('Gagal sinkron ke Google Sheets. Data tetap aman di perangkat.', 'error');
      console.error(err);
    }
    Storage.setSyncStatus({ synced:false, lastSync:new Date().toISOString(), server:'GAS', error:String(err) });
    return;
  }
}

    // Alur berikutnya
    if (document.querySelector('.admin-only:not(.hidden)')){
      window.BioApp?.showSection?.('lokasi-penempatan');
      window.BioApp?.updateNavigation?.('lokasi-penempatan');
    } else {
      form.reset();
      window.BioApp?.showSection?.('data-pribadi');
      window.BioApp?.updateNavigation?.('data-pribadi');
      showNotification('Data peserta berhasil dikumpulkan!', 'success');
    }
  }, { form, text: 'Menyimpan...' });
}

  // =====================
  // Submit: Lokasi Penempatan
  // =====================
  async function onPlacementSubmit(e){
    e.preventDefault();
    const form = e.target;
    const btn  = e.submitter || form.querySelector('button[type="submit"]');

    await callWithButtonLoading(btn, async ()=>{
      const raw  = new FormData(form);
      const data = Object.fromEntries(raw.entries());

      if (!data.lokasi_penempatan || !String(data.lokasi_penempatan).trim()){
        showNotification('Harap isi Lokasi Penempatan.', 'error');
        return;
      }

      Storage.saveParticipantData({
        lokasi_penempatan: data.lokasi_penempatan,
        region: data.region || '',
        estate: data.estate || '',
        divisi: data.divisi || ''
      });

      if (ENABLE_GAS_SYNC){
        try{
          await upsertToGAS(Storage.getParticipantData());
          showNotification('Penempatan tersimpan & tersinkron.', 'success');
        }catch(err){
          console.error(err);
          showNotification('Gagal sinkron ke Google Sheets.', 'error');
        }
      } else {
        showNotification('Penempatan disimpan (lokal).', 'success');
      }

      renderLocalSummary();
    }, { form, text:'Menyimpan...' });
  }

  // =====================
  // Submit: Nilai
  // =====================
  async function onScoreSubmit(e){
    e.preventDefault();
    const form = e.target;
    const btn  = e.submitter || form.querySelector('button[type="submit"]');

    await callWithButtonLoading(btn, async ()=>{
      const raw  = new FormData(form);
      const data = Object.fromEntries(raw.entries());

      const n = Number(data.nilai_program);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        showNotification('Nilai harus 0–100.', 'error');
        return;
      }

      Storage.saveParticipantData({
        nilai_program: String(n),
        catatan_nilai: data.catatan_nilai || ''
      });

      if (ENABLE_GAS_SYNC){
        try{
          await upsertToGAS(Storage.getParticipantData());
          showNotification('Nilai tersimpan & tersinkron.', 'success');
        }catch(err){
          console.error(err);
          showNotification('Gagal sinkron ke Google Sheets.', 'error');
        }
      } else {
        showNotification('Nilai disimpan (lokal).', 'success');
      }

      renderLocalSummary();
    }, { form, text:'Menyimpan...' });
  }

  // ==================
  // Validasi & Format
  // ==================
  function validatePersonalData(data){
    const required = [
      'nik','nama','program','batch','tempat_lahir','tanggal_lahir','agama',
      'poh','pendidikan','sekolah','daerah','hp','kontak_darurat','hubungan',
      'tinggi','berat'
    ];
    const missing = required.filter(k => !data[k] || String(data[k]).trim()==='');
    if (missing.length) return false;
    if (!isValidDate(data.tanggal_lahir)) return false;
    return true;
  }

  function formatPersonalData(data){
    const uppercaseFields = ['nama','program','tempat_lahir','agama','poh','pendidikan','sekolah','daerah','hubungan'];
    const out = { ...data };
    uppercaseFields.forEach(f=>{ if (out[f]) out[f] = formatToUppercase(out[f]); });
    if (out.hp) out.hp = formatPhoneNumber(String(out.hp).replace(/\D/g,''));
    if (out.kontak_darurat) out.kontak_darurat = formatPhoneNumber(String(out.kontak_darurat).replace(/\D/g,''));
    return out;
  }

  // Simpan saran (datalist) dari data pribadi yang baru disimpan
function saveSuggestionsFromPersonal(data){
  if (!data || typeof data !== 'object') return;
  if (data.program)    Storage.saveSuggestion('program', data.program);
  if (data.agama)      Storage.saveSuggestion('agama', data.agama);
  if (data.pendidikan) Storage.saveSuggestion('pendidikan', data.pendidikan);
  if (data.hubungan)   Storage.saveSuggestion('hubungan', data.hubungan);
}


  // ======================
  // Autosave & Suggestions
  // ======================
  function setupInputHandlers(){
    const sel = [
      '#personal-data-form input',
      '#shirt-size-form input',
      '#placement-form input',
      '#score-form input',
      '#score-form textarea'
    ].join(',');
    const allInputs = document.querySelectorAll(sel);

    allInputs.forEach(inp=>{
      inp.addEventListener('blur', ()=>{
        const form = inp.form; if (!form) return;
        const raw  = new FormData(form);
        const data = Object.fromEntries(raw.entries());

        if (data.tanggal_lahir && isISODateString(data.tanggal_lahir)) {
          const dmy = isoToDMY(data.tanggal_lahir);
          if (dmy) data.tanggal_lahir = dmy;
        }

        Storage.saveParticipantData(data);
        renderLocalSummary();
      });
    });

    const suggestMap = { program:'program', agama:'agama', pendidikan:'pendidikan', hubungan:'hubungan', ukuran_baju:'ukuran' };
    Object.entries(suggestMap).forEach(([name,type])=>{
      const input = document.querySelector(`[name="${name}"]`);
      if (input){
        input.addEventListener('blur', ()=>{
          const val = input.value;
          if (val && String(val).trim()){
            Storage.saveSuggestion(type, val);
            window.BioApp?.reloadSuggestions?.();
          }
        });
      }
    });
  }

  // ======================
  // Populate form on load
  // ======================
  function populateFormFromStorage(){
    const saved = Storage.getParticipantData() || {};
    if (!saved || typeof saved!=='object') return;
    Object.keys(saved).forEach(k=>{
      const el = document.querySelector(`[name="${k}"]`);
      if (!el || typeof saved[k]==='object') return;
      if (k === 'tanggal_lahir') {
        const iso = dmyToISO(saved[k]) || (isISODateString(saved[k]) ? saved[k] : '');
        if (iso) el.value = iso;
      } else {
        el.value = saved[k];
      }
    });
  }

  // ======================
  // Upsert ke GAS (create/update)
  // ======================
  async function upsertToGAS(payload){
    if (!payload || Object.keys(payload).length===0) throw new Error('Payload kosong');
    const existingId = payload.id;
    let res;
    if (existingId) {
      res = await updateInGoogleSheets(existingId, payload);
    } else {
      res = await submitToGoogleSheets(payload);
      if (res && res.id) Storage.saveParticipantData({ id: res.id });
    }
    Storage.setSyncStatus({ synced:true, lastSync:new Date().toISOString(), server:'GAS' });
    return res;
  }

  async function syncNowToGAS(){
    const payload = Storage.getParticipantData();
    if (!payload || Object.keys(payload).length===0) {
      showNotification('Data lokal kosong.', 'error');
      return;
    }
    await upsertToGAS(payload);
    renderLocalSummary();
    showNotification('Sinkronisasi berhasil.', 'success');
  }

  // ======================
  // Report Lokal (ringkasan peserta aktif)
  // ======================
  function renderLocalSummary(){
    const wrap = document.getElementById('report-container');
    if (!wrap) return;
    const d = Storage.getParticipantData() || {};
    if (!d || Object.keys(d).length === 0) {
      wrap.innerHTML = `<div style="color:var(--text-light)">Belum ada data peserta yang tersimpan di perangkat.</div>`;
      return;
    }

    const rows = [
      ['ID', d.id || '-'],
      ['Timestamp (sinkron terakhir)', (Storage.getSyncStatus().lastSync || '-')],
      ['NIK', d.nik || '-'],
      ['Nama', d.nama || '-'],
      ['Program', d.program || '-'],
      ['Batch', d.batch || '-'],
      ['Tempat Lahir', d.tempat_lahir || '-'],
      ['Tanggal Lahir', d.tanggal_lahir || '-'],
      ['Agama', d.agama || '-'],
      ['POH', d.poh || '-'],
      ['Pendidikan', d.pendidikan || '-'],
      ['Asal Sekolah', d.sekolah || '-'],
      ['Asal Daerah', d.daerah || '-'],
      ['No. HP', d.hp || '-'],
      ['Kontak Darurat', d.kontak_darurat || '-'],
      ['Hub. Kontak Darurat', d.hubungan || '-'],
      ['Tinggi (cm)', d.tinggi || '-'],
      ['Berat (kg)', d.berat || '-'],
      ['Ukuran Baju', d.ukuran_baju || '-'],
      ['Lokasi Penempatan', d.lokasi_penempatan || '-'],
      ['Region', d.region || '-'],
      ['Estate', d.estate || '-'],
      ['Divisi', d.divisi || '-'],
      ['Nilai Program', d.nilai_program || '-'],
      ['Catatan Nilai', d.catatan_nilai || '-']
    ];

    wrap.innerHTML = `
      <div style="overflow:auto">
        <table class="table-simple">
          <thead>
            <tr><th>Field</th><th>Nilai</th></tr>
          </thead>
          <tbody>
            ${rows.map(([k,v]) => `<tr><td>${k}</td><td>${String(v)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function exportCurrentAsCSV(){
    const d = Storage.getParticipantData() || {};
    if (!d || Object.keys(d).length===0) {
      showNotification('Tidak ada data untuk diexport.', 'error');
      return;
    }
    const row = {
      id: d.id || '',
      nik: d.nik || '',
      nama: d.nama || '',
      program: d.program || '',
      batch: d.batch || '',
      tempat_lahir: d.tempat_lahir || '',
      tanggal_lahir: d.tanggal_lahir || '',
      agama: d.agama || '',
      poh: d.poh || '',
      pendidikan: d.pendidikan || '',
      sekolah: d.sekolah || '',
      daerah: d.daerah || '',
      hp: d.hp || '',
      kontak_darurat: d.kontak_darurat || '',
      hubungan: d.hubungan || '',
      tinggi: d.tinggi || '',
      berat: d.berat || '',
      ukuran_baju: d.ukuran_baju || '',
      lokasi_penempatan: d.lokasi_penempatan || '',
      region: d.region || '',
      estate: d.estate || '',
      divisi: d.divisi || '',
      nilai_program: d.nilai_program || '',
      catatan_nilai: d.catatan_nilai || ''
    };
    exportToCSV([row], 'participant.csv');
  }

  // ======================
  // Report Kolektif (GAS)
  // ======================
  async function loadAllFromGAS(){
    const res = await fetchFromGoogleSheets(); // => array of objects
    GAS_DATA = Array.isArray(res) ? res : (res?.data || []);
    // Isi filter program/region dari unique values
    fillSelectUnique('filter-program', GAS_DATA.map(r => safeStr(r['Program'])));
    fillSelectUnique('filter-region', GAS_DATA.map(r => safeStr(r['Region'])));
    applyFiltersSortRender();
    showNotification(`Memuat ${GAS_DATA.length} data dari GAS.`, 'success');
  }

  function applyFiltersSortRender(){
    // filter
    GAS_VIEW = GAS_DATA.filter(r => {
      const q = (STATE.q || '').toLowerCase();
      const prog = STATE.program || '';
      const reg  = STATE.region || '';
      const bMin = STATE.batchMin ? parseInt(STATE.batchMin,10) : null;
      const bMax = STATE.batchMax ? parseInt(STATE.batchMax,10) : null;

      const nama = safeStr(r['Nama']).toLowerCase();
      const nik  = safeStr(r['NIK']).toLowerCase();
      const program = safeStr(r['Program']);
      const region  = safeStr(r['Region']);
      const batch   = parseInt(safeStr(r['Batch']),10);

      if (q && !(nama.includes(q) || nik.includes(q) || program.toLowerCase().includes(q))) return false;
      if (prog && program !== prog) return false;
      if (reg && region !== reg) return false;
      if (bMin !== null && !(Number.isFinite(batch) && batch >= bMin)) return false;
      if (bMax !== null && !(Number.isFinite(batch) && batch <= bMax)) return false;

      return true;
    });

    // sort
    const s = STATE.sort;
    const byStr = (a,b,ka,kb) => safeStr(ka).localeCompare(safeStr(kb), 'id', {sensitivity:'base'});
    const byNum = (a,b,ka,kb) => (parseFloat(ka)||0) - (parseFloat(kb)||0);
    const byTs  = (a,b,ka,kb) => tsValue(kb) - tsValue(ka); // default desc

    GAS_VIEW.sort((a,b)=>{
      switch(s){
        case 'timestamp_asc' : return tsValue(a['Timestamp']) - tsValue(b['Timestamp']);
        case 'timestamp_desc': return tsValue(b['Timestamp']) - tsValue(a['Timestamp']);
        case 'nama_asc'      : return byStr(a,b,a['Nama'],b['Nama']);
        case 'nama_desc'     : return byStr(b,a,a['Nama'],b['Nama']);
        case 'program_asc'   : return byStr(a,b,a['Program'],b['Program']);
        case 'batch_asc'     : return byNum(a,b,a['Batch'],b['Batch']);
        case 'batch_desc'    : return byNum(b,a,a['Batch'],b['Batch']);
        case 'nilai_asc'     : return byNum(a,b,a['Nilai Program'],b['Nilai Program']);
        case 'nilai_desc'    : return byNum(b,a,a['Nilai Program'],b['Nilai Program']);
        default: return byTs(a,b,a['Timestamp'],b['Timestamp']);
      }
    });

    renderGASTable();
  }

  function renderGASTable(){
    const tableWrap = document.getElementById('gas-table');
    const pagerWrap = document.getElementById('gas-pager');
    if (!tableWrap || !pagerWrap) return;

    const total = GAS_VIEW.length;
    const pages = Math.max(1, Math.ceil(total / Math.max(1, STATE.pageSize)));
    if (STATE.page > pages) STATE.page = pages;

    const start = (STATE.page - 1) * STATE.pageSize;
    const end   = Math.min(total, start + STATE.pageSize);
    const slice = GAS_VIEW.slice(start, end);

    if (total === 0){
      tableWrap.innerHTML = `<div style="color:var(--text-light)">Belum ada data (klik "Muat Data (GAS)" untuk mengambil).</div>`;
      pagerWrap.innerHTML = '';
      return;
    }

    const rowsHtml = slice.map(r=>{
      const id   = safeStr(r['ID']);
      const nik  = safeStr(r['NIK']);
      const nama = safeStr(r['Nama']);
      const prog = safeStr(r['Program']);
      const batch= safeStr(r['Batch']);
      const lok  = safeStr(r['Lokasi Penempatan']);
      const reg  = safeStr(r['Region']);
      const nilai= safeStr(r['Nilai Program']);
      const ts   = displayTs(r['Timestamp']);
      return `
        <tr data-id="${id}">
          <td>${nik}</td>
          <td>${nama}</td>
          <td>${prog}</td>
          <td>${batch}</td>
          <td>${lok}</td>
          <td>${reg}</td>
          <td>${nilai}</td>
          <td>${ts}</td>
          <td>
            <div class="table-actions">
              <button class="btn btn-primary btn-pilih" data-id="${id}">Pilih</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableWrap.innerHTML = `
      <div style="overflow:auto">
        <table class="table-simple">
          <thead>
            <tr>
              <th>NIK</th>
              <th>Nama</th>
              <th>Program</th>
              <th>Batch</th>
              <th>Lokasi</th>
              <th>Region</th>
              <th>Nilai</th>
              <th>Timestamp</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // bind tombol pilih
    tableWrap.querySelectorAll('.btn-pilih').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const id = e.currentTarget.getAttribute('data-id');
        const row = GAS_VIEW.find(x => String(x['ID']) === String(id));
        if (row) selectRecordToForm(row);
      });
    });

    // pager
    pagerWrap.innerHTML = `
      <button class="btn btn-secondary" ${STATE.page<=1?'disabled':''} id="pg-prev">Prev</button>
      <span class="page-info">Halaman ${STATE.page} / ${pages} &nbsp;•&nbsp; ${total} data</span>
      <button class="btn btn-secondary" ${STATE.page>=pages?'disabled':''} id="pg-next">Next</button>
    `;
    const prev = document.getElementById('pg-prev');
    const next = document.getElementById('pg-next');
    prev && prev.addEventListener('click', ()=>{ if (STATE.page>1){ STATE.page--; renderGASTable(); } });
    next && next.addEventListener('click', ()=>{ if (STATE.page<pages){ STATE.page++; renderGASTable(); } });
  }

  function selectRecordToForm(r){
    // Mapping header GAS → field lokal
    const local = {
      id: safeStr(r['ID']),
      nik: safeStr(r['NIK']),
      nama: safeStr(r['Nama']),
      program: safeStr(r['Program']),
      batch: safeStr(r['Batch']),
      tempat_lahir: safeStr(r['Tempat Lahir']),
      tanggal_lahir: toDMYFlexible(r['Tanggal Lahir']),
      agama: safeStr(r['Agama']),
      poh: safeStr(r['POH']),
      pendidikan: safeStr(r['Pendidikan Terakhir']) || safeStr(r['Pendidikan']),
      sekolah: safeStr(r['Asal Sekolah']),
      daerah: safeStr(r['Asal Daerah']),
      hp: safeStr(r['No. HP']),
      kontak_darurat: safeStr(r['No. Kontak Darurat']),
      hubungan: safeStr(r['Hub. Kontak Darurat']),
      tinggi: safeStr(r['Tinggi Badan']),
      berat: safeStr(r['Berat Badan']),
      ukuran_baju: safeStr(r['Ukuran Baju']),
      lokasi_penempatan: safeStr(r['Lokasi Penempatan']),
      region: safeStr(r['Region']),
      estate: safeStr(r['Estate']),
      divisi: safeStr(r['Divisi']),
      nilai_program: safeStr(r['Nilai Program']),
      catatan_nilai: '' // header opsional
    };

    Storage.saveParticipantData(local);
    populateFormFromStorage();
    window.BioApp?.showSection?.('data-pribadi');
    window.BioApp?.updateNavigation?.('data-pribadi');
    showNotification('Data peserta dimuat ke form.', 'success');
    renderLocalSummary();
  }

  // ======================
  // Utils untuk Report GAS
  // ======================
  function tsValue(v){
    if (!v) return 0;
    // Google Sheets bisa kirim date string/gmt; coba parse
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  function displayTs(v){
    const t = tsValue(v);
    if (!t) return '-';
    const d = new Date(t);
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function pad2(n){ return (n<10?'0':'')+n; }
  function safeStr(x){ return (x===null||x===undefined) ? '' : String(x); }

  function fillSelectUnique(selectId, arr){
    const el = document.getElementById(selectId);
    if (!el) return;
    const uniq = [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id',{sensitivity:'base'}));
    const cur = el.value || '';
    el.innerHTML = `<option value="">(Semua)</option>` + uniq.map(v=>`<option>${v}</option>`).join('');
    // restore jika masih ada
    if (cur && uniq.includes(cur)) el.value = cur; else el.value = '';
  }

  function toDMYFlexible(v){
    const s = safeStr(v).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return isoToDMY(s.slice(0,10));
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
    return s; // fallback
  }

  // ====== GAS records cache helper ======
async function ensureRecordsCacheLoaded(force = false) {
  // 1) Coba baca dari Storage API baru (bila ada)
  const hasCacheAPI = window.Storage
    && typeof Storage.getRecordsCache === 'function'
    && typeof Storage.setRecordsCache === 'function';

  if (!force && hasCacheAPI) {
    const cached = Storage.getRecordsCache();
    if (Array.isArray(cached) && cached.length) return cached;
  }

  // 2) Fallback: coba localStorage mentah (kalau tidak ada API di Storage)
  if (!force && !hasCacheAPI) {
    try {
      const raw = localStorage.getItem('gasRecordsCache');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch (e) {}
  }

  // 3) Terakhir: tarik dari GAS
  if (typeof fetchFromGoogleSheets === 'function') {
    try {
      const list = await fetchFromGoogleSheets(); // fungsi ini biasanya juga men-cache
      if (!hasCacheAPI && Array.isArray(list)) {
        try { localStorage.setItem('gasRecordsCache', JSON.stringify(list)); } catch (e) {}
      }
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn('Gagal memuat data dari GAS:', e);
    }
  }

  return [];
}


  // ======================
  // Spinner fallback
  // ======================
  async function callWithButtonLoading(btn, asyncFn, opts = {}){
    if (window.BioApp && typeof window.BioApp.withButtonLoading === 'function') {
      return window.BioApp.withButtonLoading(btn, asyncFn, opts);
    }
    const form = opts.form || (btn && btn.closest && btn.closest('form'));
    try {
      setButtonLoadingLocal(btn, true, opts.text || 'Memproses...');
      setFormDisabledLocal(form, true);
      return await asyncFn();
    } finally {
      setButtonLoadingLocal(btn, false);
      setFormDisabledLocal(form, false);
    }
  }
  function setButtonLoadingLocal(el, isLoading, text){
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
  function setFormDisabledLocal(form, disabled){
    if (!form) return;
    form.querySelectorAll('button, input, select, textarea, a.nav-link')
        .forEach(el => ('disabled' in el) ? (el.disabled = disabled) : el.classList.toggle('is-disabled', disabled));
  }

  // ======================
  // Date helpers
  // ======================
  function isISODateString(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function isDMYDateString(s) { return /^\d{2}\/\d{2}\/\d{4}$/.test(String(s || '')); }
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

  // ======================
  // Misc helpers
  // ======================
  function clearForms(){
    try{
      ['personal-data-form','shirt-size-form','placement-form','score-form'].forEach(id=>{
        const f = document.getElementById(id); f && f.reset();
      });
    }catch(e){}
  }

})();
