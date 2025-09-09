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
    renderReport: () => {}
  });

})();
