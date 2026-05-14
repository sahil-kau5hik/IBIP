/* ================================================================
   police.js — Police Verification Dashboard
   - Filters applications by PSK city (from police session)
   - Only shows "Documents Verified" status apps
   - Criminal database check via Aadhaar (simulated)
   - Approve → "Police Verified" (sent back to admin for final approval)
   - Reject → "Rejected" with reason
   ================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const LS_SESSION = 'pe_session';

  // ===== AUTH GUARD =====
  const session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  if (!session || session.role !== 'police') {
    window.location.href = 'police-login.html';
    return;
  }

  const assignedCity = session.city || 'Unknown';

  // Show police bar
  const userBar = $('userBar');
  if (userBar) {
    userBar.innerHTML = `
      <div class="user-avatar" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8)">🛡️</div>
      <span>${session.name || 'Police'}</span>
      <button class="btn btn-secondary btn-sm" id="btnPoliceLogout" style="padding:6px 12px;font-size:11px">Logout</button>
    `;
    $('btnPoliceLogout').addEventListener('click', () => {
      localStorage.removeItem(LS_SESSION);
      window.location.href = 'police-login.html';
    });
  }

  $('assignedCity').textContent = assignedCity;
  $('pageSubtitle').textContent = `Verify passport applicants assigned to ${assignedCity}`;

  // ===== SIMULATED CRIMINAL DATABASE =====
  // These Aadhaar numbers are "flagged" in the criminal database
  const CRIMINAL_DATABASE = {
    '111111111111': { name: 'Flagged Person A', offence: 'Fraud (Section 420 IPC)', fir: 'FIR-2024-1234', status: 'Wanted' },
    '222222222222': { name: 'Flagged Person B', offence: 'Forgery (Section 468 IPC)', fir: 'FIR-2023-5678', status: 'Under Investigation' },
    '333333333333': { name: 'Flagged Person C', offence: 'Identity Theft', fir: 'FIR-2025-0099', status: 'Absconding' },
    '999999999999': { name: 'Test Criminal', offence: 'Passport Fraud', fir: 'FIR-2026-TEST', status: 'Convicted' },
  };

  function checkCriminalDB(aadhaar) {
    const clean = (aadhaar || '').replace(/\s/g, '');
    if (CRIMINAL_DATABASE[clean]) {
      return { flagged: true, record: CRIMINAL_DATABASE[clean] };
    }
    return { flagged: false, record: null };
  }

  // ===== RENDERING =====
  function getAppsForCity() {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []).filter(a => a.pskCity === assignedCity);
    return apps.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  }

  function updateStats() {
    const apps = getAppsForCity();
    $('statPending').textContent = apps.filter(a => a.status === 'Documents Verified').length;
    $('statCleared').textContent = apps.filter(a => a.status === 'Police Verified' || a.status === 'Admin Approved' || a.status === 'Passport Issued').length;
    $('statFlagged').textContent = apps.filter(a => a.status === 'Rejected' && a.rejectionReason && a.rejectionReason.includes('Police')).length;
  }

  function renderPending() {
    const apps = getAppsForCity().filter(a => a.status === 'Documents Verified');
    const container = $('pendingList');
    container.innerHTML = '';

    if (apps.length === 0) { $('noPendingData').classList.remove('hidden'); return; }
    $('noPendingData').classList.add('hidden');

    apps.forEach(app => {
      // Renewal badge
      const renewalBadge = (app.applicationType === 'Renewal' || app.applicationType === 'Re-issue')
        ? `<span style="background:rgba(99,102,241,.12);color:var(--accent);font-size:10px;font-weight:600;padding:2px 8px;border-radius:12px;margin-left:8px">🔄 ${app.applicationType}</span>` : '';

      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg-input);border:1.5px solid var(--border-color);border-radius:var(--radius-md);padding:20px;margin-bottom:16px;transition:all .2s';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <div class="app-id-display" style="margin-bottom:6px;font-size:13px;padding:4px 12px">${app.id}</div>
            <div style="font-size:16px;font-weight:700;margin-top:4px">${app.fullName}${renewalBadge}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:2px">
              Aadhaar: <strong>${app.aadhaarNumber || '-'}</strong> · ${app.presentCity || '-'}, ${app.presentState || '-'}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              Police Station: ${app.policeStation || 'Not specified'} · Submitted: ${app.dateFormatted}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" data-verify="${app.id}">🛡️ Verify Candidate</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-verify]').forEach(btn => {
      btn.addEventListener('click', () => openVerification(btn.dataset.verify));
    });
  }

  function renderCompleted() {
    const apps = getAppsForCity().filter(a =>
      a.status === 'Police Verified' || a.status === 'Admin Approved' || a.status === 'Passport Issued' ||
      (a.status === 'Rejected' && a.rejectionReason && a.rejectionReason.includes('Police'))
    );
    const container = $('completedList');
    container.innerHTML = '';

    if (apps.length === 0) { $('noCompletedData').classList.remove('hidden'); return; }
    $('noCompletedData').classList.add('hidden');

    apps.forEach(app => {
      const sc = getStatusClass(app.status);
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px';
      card.innerHTML = `
        <div>
          <span style="font-family:monospace;color:var(--accent);font-size:13px;font-weight:700">${app.id}</span>
          <span style="margin-left:8px;font-weight:600">${app.fullName}</span>
          ${app.passportNumber ? `<span style="margin-left:8px;font-size:12px;color:var(--success);font-weight:600">Passport: ${app.passportNumber}</span>` : ''}
        </div>
        <span class="status-badge ${sc}"><span class="status-dot"></span>${app.status}</span>
      `;
      container.appendChild(card);
    });
  }

  // ===== VERIFICATION MODAL =====
  function openVerification(appId) {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    // Check criminal database
    const crimCheck = checkCriminalDB(app.aadhaarNumber);

    let criminalHtml;
    if (crimCheck.flagged) {
      const r = crimCheck.record;
      criminalHtml = `
        <div style="background:rgba(239,68,68,.08);border:2px solid rgba(239,68,68,.3);border-radius:var(--radius-md);padding:20px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:28px">🚨</span>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--error)">CRIMINAL RECORD FOUND</div>
              <div style="font-size:12px;color:var(--text-muted)">This Aadhaar number is flagged in the criminal database</div>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-label">Name on Record</span><span class="detail-value" style="color:var(--error)">${r.name}</span></div>
            <div class="detail-item"><span class="detail-label">Offence</span><span class="detail-value" style="color:var(--error)">${r.offence}</span></div>
            <div class="detail-item"><span class="detail-label">FIR Number</span><span class="detail-value">${r.fir}</span></div>
            <div class="detail-item"><span class="detail-label">Criminal Status</span><span class="detail-value" style="color:var(--error);font-weight:700">${r.status}</span></div>
          </div>
        </div>
      `;
    } else {
      criminalHtml = `
        <div style="background:rgba(34,197,94,.06);border:2px solid rgba(34,197,94,.25);border-radius:var(--radius-md);padding:20px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:28px">✅</span>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--success)">NO CRIMINAL RECORD</div>
              <div style="font-size:12px;color:var(--text-muted)">Aadhaar ${app.aadhaarNumber || '-'} not found in the national criminal database</div>
            </div>
          </div>
        </div>
      `;
    }

    // Doc previews
    const docNames = { passportPhoto:'📷 Photo', aadhaarCard:'🪪 Aadhaar', birthCertificate:'📜 DOB Proof', addressProof:'🏠 Address', signature:'✍️ Signature' };
    let docHtml = '';
    Object.keys(docNames).forEach(key => {
      if (app.docs && app.docs[key]) {
        docHtml += `<div style="text-align:center"><p style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${docNames[key]}</p><img src="${app.docs[key]}" alt="${key}" style="max-width:100px;max-height:80px;object-fit:cover;border-radius:6px;border:2px solid var(--border-color);cursor:pointer" onclick="window.open(this.src)" /></div>`;
      }
    });

    // Renewal info
    let renewalHtml = '';
    if (app.applicationType === 'Renewal' || app.applicationType === 'Re-issue') {
      renewalHtml = `
        <div style="background:rgba(99,102,241,.06);border:1.5px solid rgba(99,102,241,.2);border-radius:var(--radius-md);padding:16px;margin-bottom:20px">
          <div style="font-size:14px;font-weight:700;margin-bottom:8px">🔄 ${app.applicationType} Application</div>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-label">Old Passport</span><span class="detail-value" style="font-family:monospace;font-weight:700">${app.oldPassportNumber || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Issue Date</span><span class="detail-value">${app.oldPassportIssueDate || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Expiry Date</span><span class="detail-value">${app.oldPassportExpiryDate || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Reason</span><span class="detail-value">${app.renewalReason || '-'}</span></div>
          </div>
        </div>
      `;
    }

    $('verifyContent').innerHTML = `
      <div class="app-id-display" style="margin-bottom:16px">${app.id}</div>

      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px;padding:8px 14px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border-color)">
        <strong>Workflow:</strong> 📄 Submit → 📋 Doc Verify ✓ → <strong style="color:var(--accent)">🛡️ Police Verify (You are here)</strong> → ✅ Admin Approve → 🛂 Print Passport
      </p>

      ${renewalHtml}

      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">👤 Applicant Information</h3>
      <div class="detail-grid" style="margin-bottom:24px">
        <div class="detail-item"><span class="detail-label">Full Name</span><span class="detail-value">${app.fullName || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Father's Name</span><span class="detail-value">${app.fatherName || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">DOB</span><span class="detail-value">${app.dob || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Gender</span><span class="detail-value">${app.gender || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Aadhaar Number</span><span class="detail-value" style="font-weight:700;font-family:monospace;font-size:15px">${app.aadhaarNumber || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Mobile</span><span class="detail-value">${app.mobile || '-'}</span></div>
        <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">Address</span><span class="detail-value">${app.presentAddress || '-'}, ${app.presentCity || ''}, ${app.presentState || ''} — ${app.presentPincode || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Police Station</span><span class="detail-value">${app.policeStation || 'Not specified'}</span></div>
        <div class="detail-item"><span class="detail-label">PSK City</span><span class="detail-value">${app.pskCity || '-'}</span></div>
      </div>

      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">🔍 Criminal Database Check (Aadhaar: ${app.aadhaarNumber || '-'})</h3>
      ${criminalHtml}

      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">📎 Uploaded Documents</h3>
      <div class="detail-documents" style="margin-bottom:24px">${docHtml || '<p style="color:var(--text-muted);font-size:13px">No documents available</p>'}</div>

      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">📝 Verification Remarks</h3>
      <textarea class="form-textarea" id="policeRemarks" rows="3" placeholder="Enter verification remarks (optional)..." style="margin-bottom:20px"></textarea>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-success" id="btnPoliceApprove" data-id="${app.id}" ${crimCheck.flagged ? 'style="opacity:.5"' : ''}>
          ✅ Clear — Send to Admin for Final Approval
        </button>
        <button class="btn btn-danger" id="btnPoliceReject" data-id="${app.id}">
          ❌ Reject — Criminal Record / Suspicious
        </button>
      </div>
      ${crimCheck.flagged ? '<p style="margin-top:8px;font-size:12px;color:var(--error);font-weight:600">⚠️ Warning: Criminal record found. Proceed with caution.</p>' : ''}
    `;

    $('verifyOverlay').classList.remove('hidden');

    // Approve → Police Verified (NOT auto-issue passport anymore)
    $('btnPoliceApprove').addEventListener('click', () => {
      const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
      const a = allApps.find(x => x.id === appId);
      if (!a) return;

      const remarks = $('policeRemarks').value.trim();
      a.status = 'Police Verified';
      a.policeVerifiedAt = new Date().toISOString();
      a.policeRemarks = remarks || 'Cleared by police verification';
      a.verifiedByCity = assignedCity;

      lsSet(LS_KEYS.APPLICATIONS, allApps);
      PE.saveApplication(a);  // persist to Supabase
      $('verifyOverlay').classList.add('hidden');
      renderAll();
      showToast(`${appId} — Police Verified! ✅ Sent to Admin for final approval.`, 'success');
    });

    // Reject
    $('btnPoliceReject').addEventListener('click', () => {
      const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
      const a = allApps.find(x => x.id === appId);
      if (!a) return;

      const remarks = $('policeRemarks').value.trim();
      a.status = 'Rejected';
      a.rejectionReason = `Police Verification Failed: ${remarks || (crimCheck.flagged ? 'Criminal record found' : 'Rejected by police officer')}`;
      a.rejectedAt = new Date().toISOString();
      a.verifiedByCity = assignedCity;

      lsSet(LS_KEYS.APPLICATIONS, allApps);
      PE.saveApplication(a);  // persist to Supabase
      $('verifyOverlay').classList.add('hidden');
      renderAll();
      showToast(`${appId} rejected by police verification.`, 'error');
    });
  }

  function renderAll() {
    updateStats();
    renderPending();
    renderCompleted();
  }

  let isInitialized = false;
  function init() {
    renderAll();
    
    if (isInitialized) return;
    isInitialized = true;

    $('closeVerifyModal').addEventListener('click', () => $('verifyOverlay').classList.add('hidden'));
    $('verifyOverlay').addEventListener('click', e => { if (e.target === $('verifyOverlay')) $('verifyOverlay').classList.add('hidden'); });
  }

  // Initial load
  if (window.DB_READY) init();
  else document.addEventListener('DBLoaded', init);
  
  // Listen for background sync updates
  document.addEventListener('DBLoaded', init);
})();
