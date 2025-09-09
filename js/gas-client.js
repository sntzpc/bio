// gas-client.js — CORS simple request (tanpa preflight), aman dibaca balik
// Pastikan gunakan URL /exec dari deployment terbaru (Execute as: Me, Access: Anyone)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbziA7QfSC-frIMvL_5r6J_BMHLVcCsDbHXyts0pJLIHEJiT3wUXwTTgT85s_kMAAufq/exec';

// --- Util sederhana untuk bikin body form-encoded (URLSearchParams) ---
function toFormBody(params = {}) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    body.append(k, (v !== null && typeof v === 'object') ? JSON.stringify(v) : v);
  });
  return body;
}

// --- Versi A: kirim form-encoded (simple request, tidak preflight) ---
async function postForm(params) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: toFormBody(params) // JANGAN set Content-Type sendiri
  });
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('GAS returned non-JSON'); }
  if (json.success === false) throw new Error(json.error || 'GAS error');
  return json;
}

// --- Versi B (opsional): kirim text/plain JSON (juga simple request) ---
async function postTextJSON(params) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(params) // JANGAN set Content-Type (biarkan browser pakai text/plain)
  });
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('GAS returned non-JSON'); }
  if (json.success === false) throw new Error(json.error || 'GAS error');
  return json;
}

// Pilih salah satu metode (Form atau TextJSON). Default: Form
const postToGAS = postForm;

// --- API wrapper yang dipakai aplikasi ---
async function submitToGoogleSheets(data) {
  return postToGAS({ action: 'create', data });
}
async function updateInGoogleSheets(id, data) {
  return postToGAS({ action: 'update', id, data });
}
async function deleteFromGoogleSheets(id) {
  return postToGAS({ action: 'delete', id });
}
async function fetchFromGoogleSheets() {
  const res = await postToGAS({ action: 'read' });
  const list = Array.isArray(res?.data) ? res.data : [];

  // Simpan ke localStorage (overwrite setiap kali muat)
  if (window.Storage && typeof Storage.setRecordsCache === 'function') {
    try { Storage.setRecordsCache(list); }
    catch (e) { console.warn('Cache GAS gagal:', e); }
  }

  return list;
}


// Health-check: cek koneksi & buat file kalau belum ada
async function pingGAS() {
  const res = await fetch(`${GAS_URL}?action=info`);
  if (!res.ok) throw new Error(`Ping HTTP ${res.status}`);
  return res.json();
}

// Contoh penggunaan (opsional):
// pingGAS().then(console.log).catch(console.error);
// submitToGoogleSheets({ nama: 'Budi', nik: '123' }).then(console.log).catch(console.error);
