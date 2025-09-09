// Google Apps Script code for backend operations
const SHEET_NAME = 'ParticipantData';
const AUDIT_SHEET_NAME = 'AuditLog';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    
    let result;
    
    switch(action) {
      case 'create':
        result = createRecord(requestData.data);
        break;
      case 'read':
        result = readRecords();
        break;
      case 'update':
        result = updateRecord(requestData.id, requestData.data);
        break;
      case 'delete':
        result = deleteRecord(requestData.id);
        break;
      default:
        throw new Error('Invalid action');
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // For CORS preflight requests
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function createRecord(data) {
  const ss = getOrCreateSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_NAME);
  const auditSheet = getOrCreateSheet(ss, AUDIT_SHEET_NAME);
  
  // Get headers
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Prepare row data according to headers
  const rowData = headers.map(header => data[header] || '');
  
  // Add timestamp
  const timestamp = new Date();
  rowData[headers.indexOf('Timestamp')] = timestamp;
  
  // Add ID
  const id = generateId();
  rowData[headers.indexOf('ID')] = id;
  
  // Append to sheet
  sheet.appendRow(rowData);
  
  // Log to audit sheet
  logAudit(auditSheet, 'CREATE', id, timestamp);
  
  // Send Telegram notification
  sendTelegramNotification(`New participant created: ${data.Nama} (ID: ${id})`);
  
  return { success: true, id: id };
}

function readRecords() {
  const ss = getOrCreateSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_NAME);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const result = rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
  
  return { success: true, data: result };
}

function updateRecord(id, data) {
  const ss = getOrCreateSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_NAME);
  const auditSheet = getOrCreateSheet(ss, AUDIT_SHEET_NAME);
  
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idColumn = headers.indexOf('ID');
  
  // Find row with matching ID
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idColumn] === id) {
      // Update row data
      headers.forEach((header, colIndex) => {
        if (data[header] !== undefined) {
          sheet.getRange(i + 1, colIndex + 1).setValue(data[header]);
        }
      });
      
      // Update timestamp
      const timestamp = new Date();
      sheet.getRange(i + 1, headers.indexOf('Timestamp') + 1).setValue(timestamp);
      
      // Log to audit sheet
      logAudit(auditSheet, 'UPDATE', id, timestamp);
      
      // Send Telegram notification
      sendTelegramNotification(`Participant updated: ID ${id}`);
      
      return { success: true };
    }
  }
  
  throw new Error('Record not found');
}

function deleteRecord(id) {
  const ss = getOrCreateSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_NAME);
  const auditSheet = getOrCreateSheet(ss, AUDIT_SHEET_NAME);
  
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idColumn = headers.indexOf('ID');
  
  // Find row with matching ID
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idColumn] === id) {
      // Delete row
      sheet.deleteRow(i + 1);
      
      // Log to audit sheet
      const timestamp = new Date();
      logAudit(auditSheet, 'DELETE', id, timestamp);
      
      // Send Telegram notification
      sendTelegramNotification(`Participant deleted: ID ${id}`);
      
      return { success: true };
    }
  }
  
  throw new Error('Record not found');
}

function getOrCreateSpreadsheet() {
  // Try to get existing spreadsheet by name
  const files = DriveApp.getFilesByName('TrainingParticipantDatabase');
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  
  // Create new spreadsheet if it doesn't exist
  const ss = SpreadsheetApp.create('TrainingParticipantDatabase');
  const sheet = ss.getActiveSheet();
  
  // Set up headers
  const headers = [
    'ID', 'Timestamp', 'NIK', 'Nama', 'Program', 'Batch', 'Tempat Lahir', 
    'Tanggal Lahir', 'Agama', 'POH', 'Pendidikan Terakhir', 'Asal Sekolah', 
    'Asal Daerah', 'No. HP', 'No. Kontak Darurat', 'Hub. Kontak Darurat', 
    'Tinggi Badan', 'Berat Badan', 'Ukuran Baju', 'Lokasi Penempatan', 
    'Region', 'Estate', 'Divisi', 'Nilai Program'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  return ss;
}

function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    
    // Set up headers based on sheet type
    if (sheetName === AUDIT_SHEET_NAME) {
      const headers = ['Timestamp', 'Action', 'Record ID', 'User', 'Details'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  
  return sheet;
}

function generateId() {
  return Utilities.getUuid();
}

function logAudit(auditSheet, action, recordId, timestamp) {
  const user = Session.getEffectiveUser().getEmail();
  auditSheet.appendRow([timestamp, action, recordId, user, '']);
}

function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  const payload = {
    method: 'sendMessage',
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  };
  
  const options = {
    method: 'POST',
    payload: payload,
    muteHttpExceptions: true
  };
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/`;
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}