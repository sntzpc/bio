// utils.js — General utilities (global)
(function(){
  'use strict';

  function formatToUppercase(text){ return text ? String(text).toUpperCase() : ''; }

  function formatPhoneNumber(phone){
    if (!phone) return '';
    const cleaned = String(phone).replace(/\D/g,'');
    return cleaned.startsWith('0') ? ('62' + cleaned.slice(1)) : cleaned;
  }

  function isValidDate(dateString){
    if (!dateString) return false;
    const pattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!pattern.test(dateString)) return false;

    const [d,m,y] = dateString.split('/').map(n=>parseInt(n,10));
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;

    // 30-hari months
    if ([4,6,9,11].includes(m) && d > 30) return false;

    // Februari
    const isLeap = (y%4===0 && y%100!==0) || (y%400===0);
    if (m===2 && (d > (isLeap ? 29 : 28))) return false;

    return true;
  }

function showNotification(message, type='success'){
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = message || '';
  document.body.appendChild(el);
  setTimeout(()=> { el.parentNode && el.parentNode.removeChild(el); }, 3000);
}

  function debounce(fn, wait){
    let t=null;
    return (...args)=>{
      clearTimeout(t);
      t = setTimeout(()=>fn(...args), wait);
    };
  }

  function formatNumber(num){ return new Intl.NumberFormat('id-ID').format(num); }

  function exportToCSV(rows, filename){
    if (!Array.isArray(rows) || rows.length===0) return;
    const header = Object.keys(rows[0]).join(',');
    const csv = rows.map(r =>
      Object.values(r).map(v => (typeof v==='string' && v.includes(',')) ? `"${v}"` : v).join(',')
    ).join('\n');
    const blob = new Blob([header + '\n' + csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'data.csv'; a.style.visibility='hidden';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // Expose globally
  window.formatToUppercase = formatToUppercase;
  window.formatPhoneNumber = formatPhoneNumber;
  window.isValidDate       = isValidDate;
  window.showNotification  = showNotification;
  window.debounce          = debounce;
  window.formatNumber      = formatNumber;
  window.exportToCSV       = exportToCSV;
})();


/* ========== Loading Helpers ========== */

/**
 * Set tombol/link ke state loading + cegah double click.
 * @param {HTMLElement} el - tombol atau link
 * @param {boolean} isLoading
 * @param {{text?: string}} [opts]
 */
function setButtonLoading(el, isLoading, opts = {}) {
  if (!el) return;

  if (isLoading) {
    // simpan teks asli
    if (!el.dataset.originalText) {
      el.dataset.originalText = (el.textContent || '').trim();
    }
    // ganti teks bila diminta
    if (opts.text) el.textContent = opts.text;

    // state loading
    el.classList.add('is-loading');

    // disable kalau bisa (button/input)
    if ('disabled' in el) el.disabled = true;
    else el.classList.add('is-disabled'); // untuk <a>

    // beri aria
    el.setAttribute('aria-busy', 'true');
  } else {
    // pulihkan teks
    if (el.dataset.originalText) {
      el.textContent = el.dataset.originalText;
      delete el.dataset.originalText;
    }

    el.classList.remove('is-loading', 'is-disabled');
    if ('disabled' in el) el.disabled = false;
    el.removeAttribute('aria-busy');
  }
}

/**
 * Disable/enable semua kontrol dalam form.
 * @param {HTMLFormElement} form
 * @param {boolean} disabled
 */
function setFormDisabled(form, disabled) {
  if (!form) return;
  form.querySelectorAll('button, input, select, textarea, a.nav-link')
      .forEach(el => {
        if ('disabled' in el) el.disabled = disabled;
        else el.classList.toggle('is-disabled', disabled);
      });
}

/** Sleep util */
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/**
 * Pastikan proses tampil min. durasi tertentu agar spinner tidak “kedip”.
 * @param {Promise<any>} p
 * @param {number} ms
 */
async function atLeast(p, ms) {
  const [res] = await Promise.all([p, sleep(ms)]);
  return res;
}

/**
 * Jalankan aksi async dengan state loading pada tombol, aman dari double click.
 * @param {HTMLElement} btn
 * @param {Function} asyncFn  - fungsi async yang dikerjakan
 * @param {{form?: HTMLFormElement, text?: string, minDuration?: number}} [opts]
 */
async function withButtonLoading(btn, asyncFn, opts = {}) {
  const { form = btn && btn.closest('form'), text, minDuration = 600 } = opts;
  try {
    setFormDisabled(form, true);
    setButtonLoading(btn, true, { text });
    const result = await atLeast(Promise.resolve().then(asyncFn), minDuration);
    return result;
  } finally {
    setButtonLoading(btn, false);
    setFormDisabled(form, false);
  }
}
