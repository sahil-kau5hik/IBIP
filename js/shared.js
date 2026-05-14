/* ================================================================
   shared.js — Utility functions shared across all pages
   Backend: Supabase (real-time database)
   Project: ycpivhefrggsjrpdmfxe
   ================================================================ */

const SUPABASE_URL = 'https://ycpivhefrggsjrpdmfxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KGS_gOQ8gYLeAOnE97J0fw_hnRtrNwR';

const LS_KEYS = {
  THEME:        'pe_theme',
  DRAFT:        'pe_draft',
  APPLICATIONS: 'pe_applications',
  BOOKED_SLOTS: 'pe_booked_slots',
  COUNTER:      'pe_id_counter',
};

/* ─── In-memory cache ────────────────────────────────────────── */
window.DB_CACHE = {};
window.DB_READY = false;

window.onDBReady = function (cb) {
  if (window.DB_READY) cb();
  else document.addEventListener('DBLoaded', cb);
};

/* ─── Supabase REST helpers ──────────────────────────────────── */
function sbHeaders(extras = {}) {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extras
  };
}

async function sbFetch(path, opts = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: sbHeaders(opts.headers || {}),
      method: opts.method || 'GET',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Supabase [${res.status}] ${path}: ${err}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

/* ─── KV Store (pe_store) ────────────────────────────────────── */
async function loadKVStore() {
  try {
    const rows = await sbFetch('pe_store?select=key,data');
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        // Skip applications — they are managed by pe_applications table, not KV store.
        // Loading them from KV store would overwrite fresh status changes with stale data.
        if (r.key === LS_KEYS.APPLICATIONS) return;
        window.DB_CACHE[r.key] = r.data;
      });
    }
  } catch (e) {
    console.warn('loadKVStore failed:', e.message);
  }
}

function lsGet(key, fallback) {
  return window.DB_CACHE[key] !== undefined ? window.DB_CACHE[key] : fallback;
}

function lsSet(key, value) {
  window.DB_CACHE[key] = value;
  // ALWAYS write to localStorage (primary source of truth across pages)
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  // Applications have a dedicated Supabase table (pe_applications), skip pe_store for them
  // to prevent stale KV data from overwriting fresh application statuses on page load
  if (key === LS_KEYS.APPLICATIONS) return true;
  // Background sync to Supabase KV store for other keys (theme, counters, etc.)
  sbFetch('pe_store', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: { key, data: value }
  }).catch(e => console.warn('KV write failed:', e.message));
  return true;
}

/* ─── Applications (pe_applications) ────────────────────────── */
window.PE = {};

/**
 * Save/upsert a full application object into pe_applications.
 */
PE.saveApplication = async function (app) {
  // ALWAYS update cache + localStorage immediately (source of truth)
  const apps = lsGet(LS_KEYS.APPLICATIONS, []);
  const idx = apps.findIndex(a => a.id === app.id);
  if (idx >= 0) apps[idx] = app; else apps.push(app);
  window.DB_CACHE[LS_KEYS.APPLICATIONS] = apps;
  try { localStorage.setItem(LS_KEYS.APPLICATIONS, JSON.stringify(apps)); } catch (_) {}

  // Background sync to Supabase
  const row = {
    id:               app.id,
    full_name:        app.fullName || '',
    application_type: app.applicationType || 'Fresh',
    status:           app.status || 'Submitted',
    user_id:          app.userId || null,
    psk_city:         app.pskCity || null,
    mobile:           app.mobile || null,
    aadhaar_number:   app.aadhaarNumber || null,
    appointment_date: app.appointmentDate || null,
    appointment_slot: app.appointmentSlot || null,
    submitted_at:     app.submittedAt || new Date().toISOString(),
    date_formatted:   app.dateFormatted || null,
    passport_number:  app.passportNumber || null,
    rejection_reason: app.rejectionReason || null,
    doc_data:         app
  };
  sbFetch('pe_applications', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: row
  }).catch(e => console.warn('PE.saveApplication DB failed (data already in localStorage):', e.message));
};

/**
 * Load all applications.
 */
PE.loadApplications = async function () {
  try {
    const rows = await sbFetch('pe_applications?select=doc_data&order=submitted_at.desc');
    if (Array.isArray(rows) && rows.length > 0) {
      const apps = rows.map(r => r.doc_data).filter(Boolean);
      window.DB_CACHE[LS_KEYS.APPLICATIONS] = apps;
      return apps;
    }
  } catch (e) {
    console.warn('PE.loadApplications DB failed:', e.message);
  }
  return lsGet(LS_KEYS.APPLICATIONS, []);
};

/**
 * Patch specific fields on an existing application.
 */
PE.patchApplication = async function (appId, fields) {
  const apps = lsGet(LS_KEYS.APPLICATIONS, []);
  const app = apps.find(a => a.id === appId);
  if (app) Object.assign(app, fields);
  // ALWAYS persist to cache + localStorage immediately
  window.DB_CACHE[LS_KEYS.APPLICATIONS] = apps;
  try { localStorage.setItem(LS_KEYS.APPLICATIONS, JSON.stringify(apps)); } catch (_) {}

  // Background sync to Supabase
  const colUpdate = {};
  if (fields.status)          colUpdate.status          = fields.status;
  if (fields.passportNumber)  colUpdate.passport_number = fields.passportNumber;
  if (fields.rejectionReason) colUpdate.rejection_reason = fields.rejectionReason;
  colUpdate.doc_data = app;
  sbFetch(`pe_applications?id=eq.${encodeURIComponent(appId)}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: colUpdate
  }).catch(e => console.warn('PE.patchApplication DB failed (data already in localStorage):', e.message));
};

/* ─── Users (pe_users) ───────────────────────────────────────── */
PE.saveUser = async function (user) {
  const row = {
    name:       user.name  || null,
    email:      user.email || null,
    phone:      user.phone || null,
    password:   user.password || null,
    method:     user.method || 'email',
    created_at: user.createdAt || new Date().toISOString()
  };
  try {
    await sbFetch('pe_users', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: row
    });
    // update local cache
    const users = lsGet('pe_users', []);
    const idx = users.findIndex(u => (u.email === user.email && user.email) || (u.phone === user.phone && user.phone));
    if (idx >= 0) users[idx] = user; else users.push(user);
    window.DB_CACHE['pe_users'] = users;
  } catch (e) {
    console.warn('PE.saveUser DB failed:', e.message);
    const users = lsGet('pe_users', []);
    const idx = users.findIndex(u => u.email === user.email || u.phone === user.phone);
    if (idx >= 0) users[idx] = user; else users.push(user);
    lsSet('pe_users', users);
  }
};

PE.loadUsers = async function () {
  try {
    const rows = await sbFetch('pe_users?select=*&order=created_at.desc');
    if (Array.isArray(rows)) {
      window.DB_CACHE['pe_users'] = rows;
      return rows;
    }
  } catch (e) {
    console.warn('PE.loadUsers DB failed:', e.message);
  }
  return lsGet('pe_users', []);
};

/* ─── Complaints (pe_complaints) ─────────────────────────────── */
PE.saveComplaint = async function (complaint) {
  const row = {
    type:       complaint.type,
    name:       complaint.name,
    msg:        complaint.msg,
    created_at: complaint.date || new Date().toISOString()
  };
  try {
    await sbFetch('pe_complaints', { method: 'POST', body: row });
  } catch (e) {
    console.warn('PE.saveComplaint DB failed:', e.message);
    const items = lsGet('pe_complaints', []);
    items.push(complaint);
    lsSet('pe_complaints', items);
  }
};

/* ─── Boot ───────────────────────────────────────────────────── */
async function initBackendCache() {
  // STEP 1: Load from localStorage immediately (offline-first, fastest)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pe_')) {
        try { window.DB_CACHE[k] = JSON.parse(localStorage.getItem(k)); } catch (_) {}
      }
    }
  } catch (e) {}

  // STEP 2: Signal UI — data is ready (from localStorage)
  window.DB_READY = true;
  document.dispatchEvent(new Event('DBLoaded'));

  // STEP 3: Background sync from Supabase (non-blocking)
  // NOTE: PE.loadApplications has priority over loadKVStore for the applications key
  // to avoid race condition where stale KV data overwrites fresh pe_applications data
  try {
    // Load applications from dedicated table (most reliable, newest data)
    const appsFromDB = await Promise.race([
      PE.loadApplications(),
      new Promise(r => setTimeout(() => r(null), 5000)) // 5s timeout
    ]);

    // Merge: local data takes precedence for status (local is always most up-to-date)
    if (Array.isArray(appsFromDB) && appsFromDB.length > 0) {
      const localApps = JSON.parse(localStorage.getItem(LS_KEYS.APPLICATIONS) || '[]');
      const STATUS_RANK = {
        'Submitted': 1, 'Documents Failed': 1,
        'Documents Verified': 2,
        'Police Verified': 3,
        'Admin Approved': 4,
        'Passport Issued': 5,
        'Rejected': 6
      };
      // For each Supabase app, prefer local if local has equal or more advanced status
      const merged = appsFromDB.map(dbApp => {
        const localApp = localApps.find(a => a.id === dbApp.id);
        if (!localApp) return dbApp;
        const localRank = STATUS_RANK[localApp.status] || 0;
        const dbRank = STATUS_RANK[dbApp.status] || 0;
        return localRank >= dbRank ? localApp : dbApp; // local wins on tie or more advanced
      });
      // Add local-only apps not yet in Supabase
      const dbIds = new Set(appsFromDB.map(a => a.id));
      const localOnly = localApps.filter(a => !dbIds.has(a.id));
      const finalMerged = [...localOnly, ...merged];
      window.DB_CACHE[LS_KEYS.APPLICATIONS] = finalMerged;
      try { localStorage.setItem(LS_KEYS.APPLICATIONS, JSON.stringify(finalMerged)); } catch (_) {}
    }

    // Snapshot merged apps before loading KV (KV must not overwrite applications)
    const protectedApps = window.DB_CACHE[LS_KEYS.APPLICATIONS];
    // Load other KV data (theme, counters, users) — applications are skipped inside loadKVStore
    await Promise.allSettled([loadKVStore(), PE.loadUsers()]);
    // ALWAYS restore protectedApps — belt-and-suspenders in case something went wrong
    if (protectedApps !== undefined) {
      window.DB_CACHE[LS_KEYS.APPLICATIONS] = protectedApps;
    }

    // Refresh UI with synced data
    document.dispatchEvent(new Event('DBLoaded'));
  } catch (e) {
    console.warn('Boot: Background sync error.', e.message);
  }

  // Finalize UI state
  initTheme();
  setActiveNav();
  initFontSize();
  initFontSizeControls();
  initAccessibilityDate();
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
}

document.addEventListener('DOMContentLoaded', initBackendCache);

/* ─── Theme ──────────────────────────────────────────────────── */
function initTheme() {
  const saved = lsGet(LS_KEYS.THEME, 'light');
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  lsSet(LS_KEYS.THEME, next);
}

/* ─── Toast ──────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.classList.add('toast-exit'); setTimeout(() => t.remove(), 300); }, 3500);
}

/* ─── Helpers ────────────────────────────────────────────────── */
function getStatusClass(status) {
  const map = {
    'Submitted':          'submitted',
    'Documents Verified': 'docs-verified',
    'Documents Failed':   'rejected',
    'Police Verified':    'police-verified',
    'Admin Approved':     'approved',
    'Passport Issued':    'passport-issued',
    'Rejected':           'rejected',
  };
  return map[status] || 'submitted';
}

function generateApplicationId() {
  const year = new Date().getFullYear();
  let counter = lsGet(LS_KEYS.COUNTER, 0);
  counter++;
  const apps = lsGet(LS_KEYS.APPLICATIONS, []);
  let id;
  do {
    id = `PASS-${year}-${String(counter).padStart(5, '0')}`;
    counter++;
  } while (apps.some(a => a.id === id));
  lsSet(LS_KEYS.COUNTER, counter - 1);
  return id;
}

/* ─── Active Nav ─────────────────────────────────────────────── */
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === path);
  });
}

/* ─── Font Size ──────────────────────────────────────────────── */
function initFontSize() {
  const saved = lsGet('pe_fontsize', 'normal');
  applyFontSize(saved);
}

function applyFontSize(size) {
  const html = document.documentElement;
  html.classList.remove('font-small', 'font-normal', 'font-large');
  html.classList.add(`font-${size}`);
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fontsize === size);
  });
  lsSet('pe_fontsize', size);
}

function initFontSizeControls() {
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFontSize(btn.dataset.fontsize));
  });
}

/* ─── Accessibility Bar Date ─────────────────────────────────── */
function initAccessibilityDate() {
  const el = document.getElementById('accessDate');
  if (!el) return;
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  el.textContent = `${now.toLocaleDateString('en-IN', opts)} | ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}
