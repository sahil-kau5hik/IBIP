/* ================================================================
   apply.js — Multi-Step Passport Form + Auth Guard
   7 Steps: Type → Personal → Family → Contact → Docs → Appointment → Review
   Supports: Fresh, Renewal, Re-issue application types
   ================================================================ */
(function () {
  'use strict';

  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const DEBOUNCE_DELAY = 500;
  const TOTAL_STEPS = 6;
  const LS_SESSION = 'pe_session';

  const REQUIRED_DOCS = ['passportPhoto', 'aadhaarCard', 'birthCertificate', 'addressProof', 'signature'];
  const ALL_DOCS = ['passportPhoto', 'aadhaarCard', 'panCard', 'birthCertificate', 'addressProof', 'signature'];

  // Renewal-specific fields
  const RENEWAL_FIELDS = ['oldPassportNumber', 'oldPassportIssueDate', 'oldPassportExpiryDate', 'oldPassportPlaceOfIssue', 'renewalReason'];

  const $ = id => document.getElementById(id);

  // ===== AUTH GUARD =====
  const session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  if (!session || session.role !== 'user') {
    window.location.href = 'login.html';
    return;
  }

  // Show user bar
  const userBar = $('userBar');
  if (userBar) {
    const initials = (session.name || 'U').charAt(0).toUpperCase();
    userBar.innerHTML = `
      <div class="user-avatar">${initials}</div>
      <span>${session.name || 'User'}</span>
      <button class="btn btn-secondary btn-sm" id="btnLogout" style="margin-left:4px;padding:6px 12px;font-size:11px">Logout</button>
    `;
    $('btnLogout').addEventListener('click', () => {
      localStorage.removeItem(LS_SESSION);
      window.location.href = 'login.html';
    });
  }

  // ===== FIELD DEFINITIONS =====
  const STEP_FIELDS = {
    1: ['applicationType', 'passportType', 'bookletType'],
    2: ['surname', 'givenName', 'dob', 'placeOfBirth', 'gender', 'maritalStatus', 'citizenship', 'educationQualification', 'employmentType'],
    3: ['fatherName', 'motherName'],
    4: ['mobile', 'email', 'aadhaarNumber', 'presentAddress', 'presentCity', 'presentState', 'presentPincode', 'pskCity', 'emergencyName', 'emergencyPhone', 'emergencyRelation'],
    5: [],  // docs
    6: [],  // review
  };

  const ALL_TEXT_FIELDS = Object.values(STEP_FIELDS).flat();
  const OPTIONAL_FIELDS = ['organizationName', 'spouseName', 'panNumber', 'policeStation'];

  let currentStep = 1;
  let draft = {};
  let docs = {};
  let debounceTimer = null, draftTimer = null;

  // ===== RENEWAL FIELDS TOGGLE =====
  function isRenewalType() {
    const val = $('applicationType')?.value;
    return val === 'Renewal' || val === 'Re-issue';
  }

  function toggleRenewalFields() {
    const renewalSection = $('renewalFields');
    if (!renewalSection) return;
    if (isRenewalType()) {
      renewalSection.classList.remove('hidden');
      renewalSection.style.animation = 'fadeSlideIn 0.4s ease';
    } else {
      renewalSection.classList.add('hidden');
      // Clear renewal field values when switching away
      RENEWAL_FIELDS.forEach(f => { if ($(f)) $(f).value = ''; });
    }
  }

  // ===== STEP NAVIGATION =====
  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    currentStep = step;
    // Show/hide content
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    $(`step${step}`).classList.add('active');

    // Update wizard indicator
    document.querySelectorAll('.wizard-step').forEach(el => {
      const s = +el.dataset.step;
      el.classList.remove('active', 'completed');
      if (s === step) el.classList.add('active');
      else if (s < step) el.classList.add('completed');
    });

    // Update counter
    $('stepCounter').innerHTML = `Step <strong>${step}</strong> of <strong>${TOTAL_STEPS}</strong>`;

    // If step 6, render review
    if (step === 6) renderReview();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateStepFields(step) {
    const fields = STEP_FIELDS[step] || [];
    let ok = true;
    fields.forEach(f => {
      if (!validateField(f, $(f) ? $(f).value : '', false)) ok = false;
    });

    // Step 1: also validate renewal fields if applicable
    if (step === 1 && isRenewalType()) {
      RENEWAL_FIELDS.forEach(f => {
        if (!validateField(f, $(f) ? $(f).value : '', false)) ok = false;
      });
    }

    // Step 4 optional fields
    if (step === 4 && $('panNumber')?.value) {
      if (!validateOptionalField('panNumber', $('panNumber').value, false)) ok = false;
    }
    // Step 5: docs
    if (step === 5) {
      REQUIRED_DOCS.forEach(key => {
        if (!docs[key]) {
          showErr($(`error_${key}`), 'This document is required.');
          $(`doc_${key}`).classList.add('has-error');
          ok = false;
        }
      });
    }
    return ok;
  }

  // ===== DRAFT =====
  function collectDraft() {
    ALL_TEXT_FIELDS.forEach(f => { draft[f] = $(f) ? $(f).value : ''; });
    OPTIONAL_FIELDS.forEach(f => { draft[f] = $(f) ? $(f).value : ''; });
    // Collect renewal fields
    RENEWAL_FIELDS.forEach(f => { draft[f] = $(f) ? $(f).value : ''; });
    draft.declaration = $('declaration').checked;
    draft.currentStep = currentStep;
  }

  function saveDraft() {
    collectDraft();
    if (lsSet(LS_KEYS.DRAFT, draft)) {
      $('draftIndicator').classList.add('show');
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => $('draftIndicator').classList.remove('show'), 2000);
    }
    lsSet(LS_KEYS.DRAFT + '_docs', docs);
  }

  function debounceSave() { clearTimeout(debounceTimer); debounceTimer = setTimeout(saveDraft, DEBOUNCE_DELAY); }

  function loadDraft() {
    // Check if we are doing a renewal prepopulation
    const renewId = localStorage.getItem('pe_renew_id');
    if (renewId) {
      const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
      const oldApp = allApps.find(a => a.id === renewId);
      if (oldApp) {
        draft = { ...oldApp };
        draft.applicationType = 'Renewal';
        draft.oldPassportNumber = oldApp.passportNumber || '';
        draft.oldPassportIssueDate = oldApp.passportIssuedAt ? oldApp.passportIssuedAt.split('T')[0] : '';
        if (draft.oldPassportIssueDate) {
          const issue = new Date(draft.oldPassportIssueDate);
          draft.oldPassportExpiryDate = new Date(issue.setFullYear(issue.getFullYear() + 10)).toISOString().split('T')[0];
        }
        draft.renewalReason = 'Validity Expired within 3 years/Due to Expire';
        delete draft.id; delete draft.status; delete draft.docs; delete draft.docStatus; delete draft.dateFormatted; delete draft.currentStep; delete draft.declaration;
        
        localStorage.removeItem('pe_renew_id');
        showToast('Form pre-filled with data from previous Passport.', 'info');
      }
    }

    const saved = lsGet(LS_KEYS.DRAFT, null);
    const savedDocs = lsGet(LS_KEYS.DRAFT + '_docs', {});
    if (saved) {
      draft = { ...draft, ...saved };
    }
    ALL_TEXT_FIELDS.forEach(f => { if ($(f) && draft[f]) $(f).value = draft[f]; });
    OPTIONAL_FIELDS.forEach(f => { if ($(f) && draft[f]) $(f).value = draft[f]; });
    RENEWAL_FIELDS.forEach(f => { if ($(f) && draft[f]) $(f).value = draft[f]; });
    toggleRenewalFields();
    if (draft.declaration) $('declaration').checked = true;
    if (draft.currentStep && draft.currentStep > 1) goToStep(draft.currentStep);
    
    if (savedDocs && typeof savedDocs === 'object' && !renewId) {
      docs = savedDocs;
      ALL_DOCS.forEach(key => { if (docs[key]) showDocUploaded(key, docs[key]); });
    }
  }

  function clearDraftData() {
    draft = {}; docs = {};
    localStorage.removeItem(LS_KEYS.DRAFT);
    localStorage.removeItem(LS_KEYS.DRAFT + '_docs');
    $('passportForm').reset();
    ALL_DOCS.forEach(key => clearDocUpload(key));
    clearAllErrors();
    toggleRenewalFields();
    $('btnSubmit').disabled = true;
    goToStep(1);
    showToast('Draft cleared', 'info');
  }

  // ===== DOCUMENTS =====
  function initDocUploads() {
    ALL_DOCS.forEach(key => {
      $(`file_${key}`).addEventListener('change', function () { if (this.files.length) handleDocFile(key, this.files[0]); });
      $(`remove_${key}`).addEventListener('click', () => {
        clearDocUpload(key); delete docs[key]; $(`file_${key}`).value = ''; debounceSave();
      });
    });
  }

  function handleDocFile(key, file) {
    const errEl = $(`error_${key}`), item = $(`doc_${key}`);
    if (!ALLOWED_TYPES.includes(file.type)) {
      showErr(errEl, '❌ Invalid format. Only JPG, PNG, WebP.'); item.classList.add('has-error'); item.classList.remove('uploaded');
      updateDocStatus(key, 'error', `Wrong format: ${file.name}`); return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showErr(errEl, `❌ Too large (${(file.size/1024/1024).toFixed(1)}MB). Max 2MB.`); item.classList.add('has-error'); item.classList.remove('uploaded');
      updateDocStatus(key, 'error', `Too large: ${file.name}`); return;
    }
    clearErr(errEl); item.classList.remove('has-error');
    
    // Read and compress image to avoid blocking LocalStorage Quota
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width; let height = img.height;
        const MAX_DIM = 800;
        if (width > height && width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
        else if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        docs[key] = compressedBase64;
        showDocUploaded(key, compressedBase64, file.name);
        debounceSave();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function showDocUploaded(key, base64, fileName) {
    const item = $(`doc_${key}`); item.classList.add('uploaded'); item.classList.remove('has-error');
    $(`preview_${key}`).classList.remove('hidden'); $(`img_${key}`).src = base64;
    $(`remove_${key}`).classList.remove('hidden'); $(`reupload_${key}`).classList.remove('hidden');
    item.querySelector('.doc-choose-btn').classList.add('hidden');
    updateDocStatus(key, 'ok', `✅ ${fileName || 'Document'} uploaded`);
    clearErr($(`error_${key}`));
  }

  function clearDocUpload(key) {
    const item = $(`doc_${key}`); item.classList.remove('uploaded', 'has-error');
    $(`preview_${key}`).classList.add('hidden'); $(`img_${key}`).src = '';
    $(`remove_${key}`).classList.add('hidden'); $(`reupload_${key}`).classList.add('hidden');
    item.querySelector('.doc-choose-btn').classList.remove('hidden');
    updateDocStatus(key, 'none', 'Not Uploaded'); clearErr($(`error_${key}`));
  }

  function updateDocStatus(key, state, text) {
    const cls = { none: 'not-uploaded', ok: 'uploaded-ok', error: 'upload-error' };
    $(`status_${key}`).innerHTML = `<span class="doc-status-text ${cls[state] || 'not-uploaded'}">${text}</span>`;
  }

  // ===== VALIDATION =====
  const rules = {
    applicationType: v => !v ? 'Select application type.' : '',
    passportType: v => !v ? 'Select passport type.' : '',
    bookletType: v => !v ? 'Select booklet type.' : '',
    surname: v => !v.trim() ? 'Surname required.' : v.trim().length < 2 ? 'Min 2 chars.' : !/^[a-zA-Z\s.'-]+$/.test(v.trim()) ? 'Letters only.' : '',
    givenName: v => !v.trim() ? 'Given name required.' : v.trim().length < 2 ? 'Min 2 chars.' : !/^[a-zA-Z\s.'-]+$/.test(v.trim()) ? 'Letters only.' : '',
    dob: v => {
      if (!v) return 'DOB required.';
      const age = Math.floor((Date.now() - new Date(v)) / (365.25*24*60*60*1000));
      return age < 18 ? 'Must be 18+.' : age > 120 ? 'Invalid date.' : '';
    },
    placeOfBirth: v => !v.trim() ? 'Required.' : '',
    gender: v => !v ? 'Required.' : '',
    maritalStatus: v => !v ? 'Required.' : '',
    citizenship: v => !v ? 'Required.' : '',
    educationQualification: v => !v ? 'Required.' : '',
    employmentType: v => !v ? 'Required.' : '',
    fatherName: v => !v.trim() ? 'Required.' : v.trim().length < 3 ? 'Min 3 chars.' : '',
    motherName: v => !v.trim() ? 'Required.' : v.trim().length < 3 ? 'Min 3 chars.' : '',
    mobile: v => !v ? 'Required.' : !/^[6-9]\d{9}$/.test(v) ? 'Valid 10-digit Indian number.' : '',
    email: v => !v ? 'Required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Valid email.' : '',
    aadhaarNumber: v => { const d = v.replace(/\s/g, ''); return !d ? 'Required.' : !/^\d{12}$/.test(d) ? '12 digits.' : ''; },
    presentAddress: v => !v.trim() ? 'Required.' : v.trim().length < 10 ? 'Full address.' : '',
    presentCity: v => !v.trim() ? 'Required.' : '',
    presentState: v => !v ? 'Required.' : '',
    presentPincode: v => !v ? 'Required.' : !/^\d{6}$/.test(v) ? '6 digits.' : '',
    pskCity: v => !v ? 'Select nearest PSK city.' : '',
    emergencyName: v => !v.trim() ? 'Required.' : '',
    emergencyPhone: v => !v ? 'Required.' : !/^[6-9]\d{9}$/.test(v) ? 'Valid number.' : '',
    emergencyRelation: v => !v ? 'Required.' : '',
    // Renewal-specific rules
    oldPassportNumber: v => !v.trim() ? 'Passport number required.' : !/^[A-Z]\d{7}$/i.test(v.trim()) ? 'Format: A1234567 (1 letter + 7 digits).' : '',
    oldPassportIssueDate: v => !v ? 'Issue date required.' : '',
    oldPassportExpiryDate: v => !v ? 'Expiry date required.' : '',
    oldPassportPlaceOfIssue: v => !v.trim() ? 'Place of issue required.' : '',
    renewalReason: v => !v ? 'Select a reason.' : '',
  };
  const optionalRules = {
    panNumber: v => !v ? '' : !/^[A-Z]{5}\d{4}[A-Z]$/.test(v.toUpperCase()) ? 'Invalid PAN.' : '',
  };

  function showErr(el, msg) { if (el) { el.textContent = msg; el.classList.add('visible'); } }
  function clearErr(el) { if (el) { el.textContent = ''; el.classList.remove('visible'); } }
  function clearAllErrors() {
    document.querySelectorAll('.error-message').forEach(e => { e.textContent = ''; e.classList.remove('visible'); });
    document.querySelectorAll('.form-input,.form-select,.form-textarea').forEach(e => e.classList.remove('error', 'valid'));
  }

  function validateField(name, value, silent) {
    const fn = rules[name]; if (!fn) return true;
    const msg = fn(value), errEl = $(`${name}Error`), inp = $(name);
    if (!errEl || !inp) return !msg;
    if (msg) { if (!silent) { showErr(errEl, msg); inp.classList.add('error'); inp.classList.remove('valid'); } return false; }
    clearErr(errEl); if (value) { inp.classList.add('valid'); inp.classList.remove('error'); }
    return true;
  }

  function validateOptionalField(name, value, silent) {
    const fn = optionalRules[name]; if (!fn) return true;
    const msg = fn(value), errEl = $(`${name}Error`), inp = $(name);
    if (!errEl || !inp) return !msg;
    if (msg) { if (!silent) { showErr(errEl, msg); inp.classList.add('error'); inp.classList.remove('valid'); } return false; }
    clearErr(errEl); if (value) inp.classList.add('valid');
    return true;
  }

  function validateAllForSubmit() {
    let ok = true;
    ALL_TEXT_FIELDS.forEach(f => { if (!validateField(f, $(f) ? $(f).value : '', true)) ok = false; });
    // Validate renewal fields if applicable
    if (isRenewalType()) {
      RENEWAL_FIELDS.forEach(f => { if (!validateField(f, $(f) ? $(f).value : '', true)) ok = false; });
    }
    REQUIRED_DOCS.forEach(k => { if (!docs[k]) ok = false; });
    if (!$('declaration').checked) ok = false;
    $('btnSubmit').disabled = !ok;
    return ok;
  }

  // ===== AADHAAR FORMAT =====
  function formatAadhaar(e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 12);
    const p = []; for (let i = 0; i < v.length; i += 4) p.push(v.slice(i, i + 4));
    e.target.value = p.join(' ');
  }

  // ===== REVIEW =====
  function renderReview() {
    collectDraft();
    const docNames = { passportPhoto:'📷 Photo', aadhaarCard:'🪪 Aadhaar', panCard:'💳 PAN', birthCertificate:'📜 DOB Proof', addressProof:'🏠 Address', signature:'✍️ Signature' };
    let docBadges = '';
    Object.keys(docNames).forEach(k => {
      docBadges += `<span class="status-badge ${docs[k] ? 'approved' : 'rejected'}" style="font-size:10px;padding:3px 10px;margin:2px">${docNames[k]} ${docs[k] ? '✓' : '✗'}</span>`;
    });

    // Renewal info section
    let renewalHtml = '';
    if (isRenewalType()) {
      renewalHtml = `
        <h4 style="font-size:14px;font-weight:700;margin:20px 0 8px">🔄 Renewal / Re-issue Details</h4>
        <div class="detail-grid" style="margin-bottom:16px">
          <div class="detail-item"><span class="detail-label">Old Passport No.</span><span class="detail-value" style="font-family:monospace;font-weight:700">${(draft.oldPassportNumber || '-').toUpperCase()}</span></div>
          <div class="detail-item"><span class="detail-label">Issue Date</span><span class="detail-value">${draft.oldPassportIssueDate || '-'}</span></div>
          <div class="detail-item"><span class="detail-label">Expiry Date</span><span class="detail-value">${draft.oldPassportExpiryDate || '-'}</span></div>
          <div class="detail-item"><span class="detail-label">Place of Issue</span><span class="detail-value">${draft.oldPassportPlaceOfIssue || '-'}</span></div>
          <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">Reason</span><span class="detail-value">${draft.renewalReason || '-'}</span></div>
        </div>
      `;
    }

    $('reviewSummary').innerHTML = `
      <div class="detail-grid" style="margin-bottom:20px">
        <div class="detail-item"><span class="detail-label">Application</span><span class="detail-value">${draft.applicationType || '-'} · ${draft.passportType || '-'} · ${draft.bookletType || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Name</span><span class="detail-value">${(draft.givenName || '') + ' ' + (draft.surname || '')}</span></div>
        <div class="detail-item"><span class="detail-label">DOB</span><span class="detail-value">${draft.dob || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Place of Birth</span><span class="detail-value">${draft.placeOfBirth || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Gender</span><span class="detail-value">${draft.gender || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Marital Status</span><span class="detail-value">${draft.maritalStatus || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Father</span><span class="detail-value">${draft.fatherName || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Mother</span><span class="detail-value">${draft.motherName || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Mobile</span><span class="detail-value">${draft.mobile || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${draft.email || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Aadhaar</span><span class="detail-value">${draft.aadhaarNumber || '-'}</span></div>
        <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">Address</span><span class="detail-value">${draft.presentAddress || '-'}, ${draft.presentCity || ''}, ${draft.presentState || ''} — ${draft.presentPincode || ''}</span></div>
        <div class="detail-item"><span class="detail-label">PSK City</span><span class="detail-value">${draft.pskCity || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Emergency</span><span class="detail-value">${draft.emergencyName || '-'} (${draft.emergencyRelation || '-'}) — ${draft.emergencyPhone || '-'}</span></div>
      </div>
      ${renewalHtml}
      <h4 style="font-size:14px;font-weight:700;margin-bottom:8px">📎 Documents</h4>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">${docBadges}</div>
    `;
    validateAllForSubmit();
  }

  // ===== SUBMIT =====
  function submit(e) {
    e.preventDefault();
    collectDraft();
    if (!validateAllForSubmit()) { showToast('Please complete all required fields.', 'error'); return; }
    if (!$('declaration').checked) { showErr($('declarationError'), 'Accept the declaration.'); return; }

    const appId = generateApplicationId();
    const now = new Date();
    const app = {
      id: appId,
      fullName: ((draft.givenName || '') + ' ' + (draft.surname || '')).trim(),
      surname: draft.surname, givenName: draft.givenName,
      applicationType: draft.applicationType, passportType: draft.passportType, bookletType: draft.bookletType,
      dob: draft.dob, placeOfBirth: draft.placeOfBirth, gender: draft.gender,
      maritalStatus: draft.maritalStatus, citizenship: draft.citizenship,
      educationQualification: draft.educationQualification, employmentType: draft.employmentType,
      organizationName: draft.organizationName || '',
      fatherName: draft.fatherName, motherName: draft.motherName, spouseName: draft.spouseName || '',
      mobile: draft.mobile, email: draft.email,
      aadhaarNumber: draft.aadhaarNumber, panNumber: draft.panNumber || '',
      presentAddress: draft.presentAddress, presentCity: draft.presentCity,
      presentState: draft.presentState, presentPincode: draft.presentPincode,
      pskCity: draft.pskCity, policeStation: draft.policeStation || '',
      emergencyName: draft.emergencyName, emergencyPhone: draft.emergencyPhone, emergencyRelation: draft.emergencyRelation,
      docs: { ...docs },
      status: 'Submitted',
      submittedAt: now.toISOString(),
      dateFormatted: now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
      userId: session.email || session.phone || 'unknown',
    };

    // Add renewal data if applicable
    if (isRenewalType()) {
      app.oldPassportNumber = (draft.oldPassportNumber || '').toUpperCase();
      app.oldPassportIssueDate = draft.oldPassportIssueDate || '';
      app.oldPassportExpiryDate = draft.oldPassportExpiryDate || '';
      app.oldPassportPlaceOfIssue = draft.oldPassportPlaceOfIssue || '';
      app.renewalReason = draft.renewalReason || '';
    }

    // STEP 1: Immediately save to localStorage so it shows everywhere even before Supabase responds
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    apps.push(app);
    window.DB_CACHE[LS_KEYS.APPLICATIONS] = apps;
    // Always persist to localStorage as primary fallback
    try { localStorage.setItem(LS_KEYS.APPLICATIONS, JSON.stringify(apps)); } catch (_) {}

    // STEP 2: Clear draft BEFORE redirect
    localStorage.removeItem(LS_KEYS.DRAFT);
    localStorage.removeItem(LS_KEYS.DRAFT + '_docs');

    // STEP 3: Background sync to Supabase (non-blocking)
    PE.saveApplication(app);

    showToast(`Application ${appId} submitted! 🎉`, 'success');
    setTimeout(() => window.location.href = 'track.html', 1500);
  }

  // ===== INIT =====
  function init() {
    initDocUploads();
    loadDraft();

    // Application type change → toggle renewal fields
    $('applicationType').addEventListener('change', () => {
      toggleRenewalFields();
      debounceSave();
    });

    // Step navigation buttons
    document.querySelectorAll('.step-next').forEach(btn => {
      btn.addEventListener('click', () => {
        if (validateStepFields(currentStep)) {
          saveDraft();
          goToStep(+btn.dataset.to);
        } else {
          showToast('Please fill all required fields in this step.', 'error');
        }
      });
    });
    document.querySelectorAll('.step-prev').forEach(btn => {
      btn.addEventListener('click', () => { saveDraft(); goToStep(+btn.dataset.to); });
    });

    // Click on wizard step circles (only go back or to completed)
    document.querySelectorAll('.wizard-step').forEach(el => {
      el.addEventListener('click', () => {
        const s = +el.dataset.step;
        if (s < currentStep) { saveDraft(); goToStep(s); }
      });
    });

    // Field events
    const allFieldsForEvents = [...ALL_TEXT_FIELDS, ...OPTIONAL_FIELDS, ...RENEWAL_FIELDS];
    allFieldsForEvents.forEach(f => {
      const el = $(f); if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (f === 'aadhaarNumber') formatAadhaar({ target: el });
        if (f === 'panNumber') el.value = el.value.toUpperCase();
        if (f === 'oldPassportNumber') el.value = el.value.toUpperCase();
        debounceSave();
        if (rules[f]) validateField(f, el.value, false);
        if (optionalRules[f]) validateOptionalField(f, el.value, false);
      });
    });

    $('declaration').addEventListener('change', () => { debounceSave(); validateAllForSubmit(); });
    $('passportForm').addEventListener('submit', submit);
  }

window.onDBReady ? window.onDBReady(init) : document.addEventListener('DOMContentLoaded', init);
})();
