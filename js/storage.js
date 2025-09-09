// storage.js — localStorage wrapper
const Storage = (function(){
  'use strict';

  const STORAGE_KEYS = {
    PARTICIPANT_DATA     : 'participantFormData',
    PROGRAM_SUGGESTIONS  : 'programSuggestions',
    AGAMA_SUGGESTIONS    : 'agamaSuggestions',
    PENDIDIKAN_SUGGESTIONS: 'pendidikanSuggestions',
    HUBUNGAN_SUGGESTIONS : 'hubunganSuggestions',
    UKURAN_SUGGESTIONS   : 'ukuranSuggestions',
    ADMIN_AUTH           : 'adminAuthenticated',
    SYNC_STATUS          : 'dataSyncStatus',
    GAS_CACHE            : 'gasCache',
    GAS_CACHE_TS         : 'gasCacheTs',
    RECORDS_CACHE        : 'gasRecordsCache',
    KNOWN_NIKS           : 'knownNikPeserta'
  };

  const DEFAULT_SUGGESTIONS = {
    program    : ['KLP1 AGRO','KLP1 MILL','KLP1 ADMN'],
    agama      : ['ISLAM','KRISTEN PROTESTAN','KATHOLIK','HINDU','BUDHA'],
    pendidikan : ['SLTA','D1','D3','D4','S1'],
    hubungan   : ['AYAH','IBU','KAKAK','ADIK'],
    ukuran     : ['S','M','L','XL','XXL','XXXL']
  };

  function isLocalStorageAvailable(){
    try{
      const t = '__ls_test__';
      localStorage.setItem(t,'1');
      localStorage.removeItem(t);
      return true;
    }catch(e){
      console.error('LocalStorage tidak tersedia:', e);
      return false;
    }
  }

  function getParticipantData(){
    if(!isLocalStorageAvailable()) return {};
    try{
      const raw = localStorage.getItem(STORAGE_KEYS.PARTICIPANT_DATA);
      return raw ? JSON.parse(raw) : {};
    }catch(e){ console.error('getParticipantData error:', e); return {}; }
  }

  function saveParticipantData(data){
    if(!isLocalStorageAvailable()) return false;
    try{
      const merged = { ...getParticipantData(), ...(data||{}) };
      localStorage.setItem(STORAGE_KEYS.PARTICIPANT_DATA, JSON.stringify(merged));
      return true;
    }catch(e){ console.error('saveParticipantData error:', e); return false; }
  }

  function clearParticipantData(){
    if(!isLocalStorageAvailable()) return false;
    try{ localStorage.removeItem(STORAGE_KEYS.PARTICIPANT_DATA); return true; }
    catch(e){ console.error('clearParticipantData error:', e); return false; }
  }

  function _keyFor(type){
    const k = `${String(type||'').toUpperCase()}_SUGGESTIONS`;
    return STORAGE_KEYS[k];
  }

  function getSuggestions(type){
    if(!isLocalStorageAvailable()) return DEFAULT_SUGGESTIONS[type] || [];
    try{
      const key = _keyFor(type);
      if(!key) return [];
      const raw = localStorage.getItem(key);
      if(!raw){
        const def = DEFAULT_SUGGESTIONS[type] || [];
        localStorage.setItem(key, JSON.stringify(def));
        return def;
      }
      return JSON.parse(raw);
    }catch(e){
      console.error('getSuggestions error:', e);
      return DEFAULT_SUGGESTIONS[type] || [];
    }
  }

  function saveSuggestion(type, value){
    if(!isLocalStorageAvailable() || !value) return false;
    try{
      const key  = _keyFor(type);
      if(!key) return false;
      const v = String(value).toUpperCase().trim();
      if(!v) return false;
      const list = getSuggestions(type);
      if(!list.includes(v)){
        list.push(v);
        list.sort();
        localStorage.setItem(key, JSON.stringify(list));
      }
      return true;
    }catch(e){ console.error('saveSuggestion error:', e); return false; }
  }

  function addMultipleSuggestions(type, values){
    if(!isLocalStorageAvailable() || !Array.isArray(values)) return false;
    try{
      const key = _keyFor(type);
      if(!key) return false;
      const list = getSuggestions(type);
      let changed = false;
      values.forEach(val=>{
        const v = String(val||'').toUpperCase().trim();
        if(v && !list.includes(v)){ list.push(v); changed = true; }
      });
      if(changed){
        list.sort();
        localStorage.setItem(key, JSON.stringify(list));
      }
      return true;
    }catch(e){ console.error('addMultipleSuggestions error:', e); return false; }
  }

  function setAdminAuthenticated(status){
    if(!isLocalStorageAvailable()) return false;
    try{ localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, JSON.stringify(!!status)); return true; }
    catch(e){ console.error('setAdminAuthenticated error:', e); return false; }
  }

  function isAdminAuthenticated(){
    if(!isLocalStorageAvailable()) return false;
    try{
      const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH);
      return raw ? JSON.parse(raw) : false;
    }catch(e){ console.error('isAdminAuthenticated error:', e); return false; }
  }

  function setSyncStatus(status){
    if(!isLocalStorageAvailable()) return false;
    try{ localStorage.setItem(STORAGE_KEYS.SYNC_STATUS, JSON.stringify(status||{})); return true; }
    catch(e){ console.error('setSyncStatus error:', e); return false; }
  }

  function getSyncStatus(){
    if(!isLocalStorageAvailable()) return { synced:false, lastSync:null };
    try{
      const raw = localStorage.getItem(STORAGE_KEYS.SYNC_STATUS);
      return raw ? JSON.parse(raw) : { synced:false, lastSync:null };
    }catch(e){ console.error('getSyncStatus error:', e); return { synced:false, lastSync:null }; }
  }

  // ====== Normalizer NIK Peserta: hanya digit ======
function sanitizeNikPeserta(val){
  return String(val || '').replace(/\D/g, '');
}

// Ambil NIK dari satu record row (dari GAS)
function _extractNikFromRow(rec){
  // kolom yang mungkin: "NIK Peserta" / "NIK" / variasi case
  const raw = rec?.['NIK Peserta'] ?? rec?.['NIK'] ?? rec?.nik ?? rec?.Nik ?? '';
  return sanitizeNikPeserta(raw);
}

// ===== Cache data GAS (array of rows) =====
function getRecordsCache(){
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS_CACHE);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ console.error('getRecordsCache error:', e); return []; }
}

function setRecordsCache(list){
  if (!isLocalStorageAvailable()) return false;
  try {
    const arr = Array.isArray(list) ? list : [];
    localStorage.setItem(STORAGE_KEYS.RECORDS_CACHE, JSON.stringify(arr));

    // perbarui indeks NIK Peserta (hanya digit & unik)
    const nikSet = Array.from(new Set(arr.map(_extractNikFromRow).filter(Boolean)));
    localStorage.setItem(STORAGE_KEYS.KNOWN_NIKS, JSON.stringify(nikSet));
    return true;
  } catch(e){ console.error('setRecordsCache error:', e); return false; }
}

function clearRecordsCache(){
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.removeItem(STORAGE_KEYS.RECORDS_CACHE);
    localStorage.removeItem(STORAGE_KEYS.KNOWN_NIKS);
    return true;
  } catch(e){ console.error('clearRecordsCache error:', e); return false; }
}

// ===== Indeks NIK Peserta =====
function getKnownNIKs(){
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.KNOWN_NIKS);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ console.error('getKnownNIKs error:', e); return []; }
}

function upsertKnownNIK(nik){
  if (!isLocalStorageAvailable()) return false;
  try {
    const s = sanitizeNikPeserta(nik);
    if (!s) return false;
    const list = getKnownNIKs();
    if (!list.includes(s)){
      list.push(s);
      localStorage.setItem(STORAGE_KEYS.KNOWN_NIKS, JSON.stringify(list));
    }
    return true;
  } catch(e){ console.error('upsertKnownNIK error:', e); return false; }
}

// ===== Cari record by NIK (di cache) =====
function findRecordByNik(nik){
  const s = sanitizeNikPeserta(nik);
  if (!s) return null;
  const rows = getRecordsCache();
  for (let i=0;i<rows.length;i++){
    if (_extractNikFromRow(rows[i]) === s) return rows[i];
  }
  return null;
}

  function exportData(){
    try{
      const data = {
        participantData   : getParticipantData(),
        programSuggestions: getSuggestions('program'),
        agamaSuggestions  : getSuggestions('agama'),
        pendidikanSuggestions: getSuggestions('pendidikan'),
        hubunganSuggestions  : getSuggestions('hubungan'),
        ukuranSuggestions    : getSuggestions('ukuran'),
        adminAuth         : isAdminAuthenticated(),
        syncStatus        : getSyncStatus()
      };
      const dataStr = JSON.stringify(data, null, 2);
      return 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    }catch(e){ console.error('exportData error:', e); return null; }
  }

  function importData(jsonData){
    if(!jsonData || !isLocalStorageAvailable()) return false;
    try{
      const d = (typeof jsonData==='string') ? JSON.parse(jsonData) : jsonData;
      if (d.participantData) localStorage.setItem(STORAGE_KEYS.PARTICIPANT_DATA, JSON.stringify(d.participantData));
      if (d.programSuggestions) localStorage.setItem(STORAGE_KEYS.PROGRAM_SUGGESTIONS, JSON.stringify(d.programSuggestions));
      if (d.agamaSuggestions)   localStorage.setItem(STORAGE_KEYS.AGAMA_SUGGESTIONS, JSON.stringify(d.agamaSuggestions));
      if (d.pendidikanSuggestions) localStorage.setItem(STORAGE_KEYS.PENDIDIKAN_SUGGESTIONS, JSON.stringify(d.pendidikanSuggestions));
      if (d.hubunganSuggestions) localStorage.setItem(STORAGE_KEYS.HUBUNGAN_SUGGESTIONS, JSON.stringify(d.hubunganSuggestions));
      if (d.ukuranSuggestions)   localStorage.setItem(STORAGE_KEYS.UKURAN_SUGGESTIONS, JSON.stringify(d.ukuranSuggestions));
      if (typeof d.adminAuth!=='undefined') localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, JSON.stringify(!!d.adminAuth));
      if (d.syncStatus) localStorage.setItem(STORAGE_KEYS.SYNC_STATUS, JSON.stringify(d.syncStatus));
      return true;
    }catch(e){ console.error('importData error:', e); return false; }
  }

  function setGasCache(list){
  if (!isLocalStorageAvailable()) return false;
  try {
    const arr = Array.isArray(list) ? list : [];
    localStorage.setItem(STORAGE_KEYS.GAS_CACHE, JSON.stringify(arr));
    localStorage.setItem(STORAGE_KEYS.GAS_CACHE_TS, new Date().toISOString());
    return true;
  } catch (e) {
    console.error('setGasCache error:', e);
    return false;
  }
}

function getGasCache(){
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GAS_CACHE);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('getGasCache error:', e);
    return [];
  }
}

function getGasCacheMeta(){
  if (!isLocalStorageAvailable()) return { lastFetch: null, count: 0 };
  try {
    const ts = localStorage.getItem(STORAGE_KEYS.GAS_CACHE_TS);
    const count = getGasCache().length;
    return { lastFetch: ts || null, count };
  } catch (e) {
    console.error('getGasCacheMeta error:', e);
    return { lastFetch: null, count: 0 };
  }
}

function clearGasCache(){
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.removeItem(STORAGE_KEYS.GAS_CACHE);
    localStorage.removeItem(STORAGE_KEYS.GAS_CACHE_TS);
    return true;
  } catch (e) {
    console.error('clearGasCache error:', e);
    return false;
  }
}


  function clearAllData(){
    if(!isLocalStorageAvailable()) return false;
    try{
      Object.values(STORAGE_KEYS).forEach(k=>localStorage.removeItem(k));
      return true;
    }catch(e){ console.error('clearAllData error:', e); return false; }
  }

  const api = {
    getParticipantData, saveParticipantData, clearParticipantData, getSuggestions, saveSuggestion, addMultipleSuggestions,
    setAdminAuthenticated, isAdminAuthenticated, setSyncStatus, getSyncStatus, exportData, importData, clearAllData,
    isLocalStorageAvailable, setGasCache, getGasCache, getGasCacheMeta, clearGasCache, sanitizeNikPeserta,
    getRecordsCache, setRecordsCache, clearRecordsCache,
    getKnownNIKs, upsertKnownNIK, findRecordByNik
  };

  if (typeof module!=='undefined' && module.exports){ module.exports = api; }
  else { window.Storage = api; }

  return api;
})();
