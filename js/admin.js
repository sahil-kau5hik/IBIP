/* ================================================================
   admin.js — Admin dashboard: Document Verification & Final Approval
   New Flow: Submitted → Documents Verified → Police Verified → Admin Approved → Passport Issued
   ================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const LS_SESSION = 'pe_session';

  // Auth guard
  const session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  if (!session || session.role !== 'admin') {
    window.location.href = 'admin-login.html';
    return;
  }

  // Show admin bar
  const userBar = document.getElementById('userBar');
  if (userBar) {
    userBar.innerHTML = `
      <div class="user-avatar" style="background:linear-gradient(135deg,#ef4444,#dc2626)">A</div>
      <span>${session.name || 'Admin'}</span>
      <button class="btn btn-secondary btn-sm" id="btnAdminLogout" style="padding:6px 12px;font-size:11px">Logout</button>
    `;
    document.getElementById('btnAdminLogout').addEventListener('click', () => {
      localStorage.removeItem(LS_SESSION);
      window.location.href = 'admin-login.html';
    });
  }

  const els = {
    search: $('adminSearch'),
    filter: $('adminFilter'),
    tbody: $('adminTableBody'),
    tableWrapper: $('tableWrapper'),
    noData: $('noAdminData'),
    statTotal: $('statTotal'),
    statSubmitted: $('statSubmitted'),
    statDocVerified: $('statDocVerified'),
    statPoliceVerified: $('statPoliceVerified'),
    statApproved: $('statApproved'),
    statRejected: $('statRejected'),
    detailOverlay: $('detailOverlay'),
    detailContent: $('detailContent'),
    closeDetailModal: $('closeDetailModal'),
  };

  const DOC_NAMES = {
    passportPhoto: '📷 Photo', aadhaarCard: '🪪 Aadhaar', panCard: '💳 PAN',
    birthCertificate: '📜 DOB Proof', addressProof: '🏠 Address', signature: '✍️ Signature',
  };

  function updateStats() {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    els.statTotal.textContent = apps.length;
    els.statSubmitted.textContent = apps.filter(a => a.status === 'Submitted' || a.status === 'Documents Failed').length;
    els.statDocVerified.textContent = apps.filter(a => a.status === 'Documents Verified').length;
    els.statPoliceVerified.textContent = apps.filter(a => a.status === 'Police Verified').length;
    els.statApproved.textContent = apps.filter(a => a.status === 'Admin Approved' || a.status === 'Passport Issued').length;
    els.statRejected.textContent = apps.filter(a => a.status === 'Rejected').length;
  }

  function getDocCount(app) {
    if (!app.docs) return 0;
    return Object.keys(app.docs).filter(k => app.docs[k]).length;
  }

  function renderTable() {
    let apps = lsGet(LS_KEYS.APPLICATIONS, []);
    
    // Always sort by date newest first
    apps.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    const query = els.search.value.trim().toLowerCase();
    const statusFilter = els.filter.value;

    if (statusFilter !== 'all') apps = apps.filter(a => a.status === statusFilter);
    if (query) {
      apps = apps.filter(a =>
        (a.fullName || '').toLowerCase().includes(query) ||
        (a.id || '').toLowerCase().includes(query)
      );
    }

    els.tbody.innerHTML = '';
    if (apps.length === 0) {
      els.noData.classList.remove('hidden');
      els.tableWrapper.classList.add('hidden');
      return;
    }
    els.noData.classList.add('hidden');
    els.tableWrapper.classList.remove('hidden');

    apps.forEach(app => {
      const sc = getStatusClass(app.status);
      const docCount = getDocCount(app);
      const row = document.createElement('tr');

      let actions = '';

      // Submitted → Admin verifies documents first
      if (app.status === 'Submitted') {
        actions += `<button class="btn btn-primary btn-sm" data-action="verifyDocs" data-id="${app.id}">📋 Verify Docs</button>`;
        actions += `<button class="btn btn-danger btn-sm" data-action="reject" data-id="${app.id}">❌ Reject</button>`;
      }

      // Documents Failed → Admin can re-verify docs after user re-uploads
      if (app.status === 'Documents Failed') {
        actions += `<button class="btn btn-primary btn-sm" data-action="verifyDocs" data-id="${app.id}">📋 Re-verify Docs</button>`;
      }

      // Police Verified → Admin gives FINAL approval
      if (app.status === 'Police Verified') {
        actions += `<button class="btn btn-success btn-sm" data-action="finalApprove" data-id="${app.id}">✅ Final Approve</button>`;
        actions += `<button class="btn btn-danger btn-sm" data-action="reject" data-id="${app.id}">❌ Reject</button>`;
      }

      // Admin Approved → Issue passport (Print)
      if (app.status === 'Admin Approved') {
        actions += `<button class="btn btn-success btn-sm" data-action="issuePassport" data-id="${app.id}">🛂 Issue Passport</button>`;
      }

      actions += `<button class="btn btn-secondary btn-sm" data-action="view" data-id="${app.id}">👁️ View</button>`;

      // Renewal badge
      const renewalBadge = (app.applicationType === 'Renewal' || app.applicationType === 'Re-issue')
        ? `<span class="status-badge under-review" style="font-size:9px;padding:2px 8px;margin-left:4px">🔄 ${app.applicationType}</span>` : '';

      row.innerHTML = `
        <td><strong style="font-family:monospace;color:var(--accent)">${app.id}</strong></td>
        <td><strong>${app.fullName || '-'}</strong>${renewalBadge}<br><span style="font-size:11px;color:var(--text-muted)">${app.pskCity || ''}</span></td>
        <td><span style="font-size:12px">${app.applicationType || 'Fresh'}</span></td>
        <td>${app.mobile || '-'}</td>
        <td>${app.dateFormatted || '-'}</td>
        <td><span style="font-size:12px;font-weight:600;color:${docCount >= 5 ? 'var(--success)' : 'var(--status-submitted)'}">${docCount}/6</span></td>
        <td><span class="status-badge ${sc}"><span class="status-dot"></span>${app.status}</span></td>
        <td><div class="table-actions">${actions}</div></td>
      `;
      els.tbody.appendChild(row);
    });

    els.tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'view') showDetail(id);
        else if (action === 'verifyDocs') showDocVerification(id);
        else handleAction(action, id);
      });
    });
  }

  function handleAction(action, appId) {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    if (action === 'finalApprove') {
      app.status = 'Admin Approved';
      app.adminApprovedAt = new Date().toISOString();
      lsSet(LS_KEYS.APPLICATIONS, apps);
      PE.saveApplication(app);
      renderTable();
      updateStats();
      showToast(`${appId} → Admin Approved! ✅ Ready for passport issuance.`, 'success');
      return;
    }

    if (action === 'issuePassport') {
      app.status = 'Passport Issued';
      app.passportIssuedAt = new Date().toISOString();
      app.passportNumber = generatePassportNumber();
      lsSet(LS_KEYS.APPLICATIONS, apps);
      PE.saveApplication(app);
      renderTable();
      updateStats();
      showToast(`${appId} → Passport Issued! 🛂 #${app.passportNumber}`, 'success');
      return;
    }

    if (action === 'reject') {
      const reason = prompt('Rejection reason (optional):');
      app.status = 'Rejected';
      app.rejectionReason = reason || 'Rejected by Admin';
      app.rejectedAt = new Date().toISOString();
    }

    lsSet(LS_KEYS.APPLICATIONS, apps);
    PE.saveApplication(app);
    renderTable();
    updateStats();
    showToast(`${appId} → "${app.status}"`, 'success');
  }

  // Generate passport number: J1234567
  function generatePassportNumber() {
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const num = String(Math.floor(1000000 + Math.random() * 9000000));
    return letter + num;
  }

  // ===== DOC VERIFICATION MODAL =====
  const FAIL_REASONS = ['Blurry / Unclear Image', 'Wrong Document Uploaded', 'Expired Document', 'Name Mismatch', 'File Corrupted / Unreadable', 'Information Not Visible', 'Other'];

  function showDocVerification(appId) {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    // Initialize doc verification state if not present
    if (!app.docStatus) app.docStatus = {};

    let docsHtml = '';
    const docKeys = Object.keys(DOC_NAMES);
    docKeys.forEach(key => {
      const uploaded = app.docs && app.docs[key];
      const ds = app.docStatus[key] || { status: 'pending', reason: '' };

      const statusBadge = ds.status === 'pass' ? '<span class="doc-verify-badge pass">✅ Verified</span>'
        : ds.status === 'fail' ? `<span class="doc-verify-badge fail">❌ Failed</span><div class="doc-fail-reason">Reason: ${ds.reason}</div>`
        : '<span class="doc-verify-badge pending">⏳ Pending</span>';

      const failReasonOptions = FAIL_REASONS.map(r => `<option value="${r}">${r}</option>`).join('');

      docsHtml += `
        <div style="background:var(--bg-input);border:1.5px solid ${ds.status === 'fail' ? 'rgba(239,68,68,.4)' : ds.status === 'pass' ? 'rgba(34,197,94,.3)' : 'var(--border-color)'};border-radius:var(--radius-sm);padding:16px;transition:all .2s">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:140px">
              <div style="font-size:14px;font-weight:700">${DOC_NAMES[key]}</div>
              <div style="font-size:12px;color:${uploaded ? 'var(--success)' : 'var(--error)'};margin-top:2px">${uploaded ? '✅ Uploaded' : '❌ Not Uploaded'}</div>
              <div style="margin-top:6px">${statusBadge}</div>
            </div>
            ${uploaded ? `<img src="${app.docs[key]}" alt="${key}" style="max-width:140px;max-height:100px;object-fit:cover;border-radius:8px;border:2px solid var(--border-color);cursor:pointer" onclick="window.open(this.src)" />` : ''}
          </div>
          ${uploaded && ds.status !== 'pass' ? `
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
              <button class="btn btn-success btn-sm" data-doc-pass="${key}" data-appid="${app.id}">✅ Pass</button>
              <select class="form-select" data-doc-reason="${key}" style="font-size:12px;padding:6px 10px;max-width:240px">
                <option value="">-- Fail Reason --</option>
                ${failReasonOptions}
              </select>
              <button class="btn btn-danger btn-sm" data-doc-fail="${key}" data-appid="${app.id}">❌ Fail</button>
            </div>
          ` : ''}
        </div>
      `;
    });

    // Count verified docs
    const verified = docKeys.filter(k => app.docStatus[k]?.status === 'pass').length;
    const failed = docKeys.filter(k => app.docStatus[k]?.status === 'fail').length;
    const uploaded = docKeys.filter(k => app.docs && app.docs[k]).length;

    // Renewal info
    let renewalInfo = '';
    if (app.applicationType === 'Renewal' || app.applicationType === 'Re-issue') {
      renewalInfo = `
        <div style="background:rgba(99,102,241,.06);border:1.5px solid rgba(99,102,241,.2);border-radius:var(--radius-md);padding:16px;margin-bottom:20px">
          <div style="font-size:14px;font-weight:700;margin-bottom:8px">🔄 ${app.applicationType} Application</div>
          <div class="detail-grid">
            <div class="detail-item"><span class="detail-label">Old Passport</span><span class="detail-value" style="font-family:monospace;font-weight:700">${app.oldPassportNumber || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Issue Date</span><span class="detail-value">${app.oldPassportIssueDate || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Expiry Date</span><span class="detail-value">${app.oldPassportExpiryDate || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Place</span><span class="detail-value">${app.oldPassportPlaceOfIssue || '-'}</span></div>
            <div class="detail-item"><span class="detail-label">Reason</span><span class="detail-value">${app.renewalReason || '-'}</span></div>
          </div>
        </div>
      `;
    }

    els.detailContent.innerHTML = `
      <div class="app-id-display">${app.id}</div>
      <span class="status-badge ${getStatusClass(app.status)}" style="margin-left:12px"><span class="status-dot"></span>${app.status}</span>
      <p style="font-size:15px;font-weight:700;margin:16px 0 4px">Applicant: ${app.fullName}</p>
      <p style="font-size:13px;color:var(--text-muted)">Aadhaar: ${app.aadhaarNumber || '-'} · PSK: ${app.pskCity || '-'}</p>

      ${renewalInfo}

      <h3 style="font-size:16px;font-weight:700;margin:24px 0 14px">📋 Document Verification — Verify Each Document</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
        <strong>Workflow:</strong> Submit → <strong style="color:var(--accent)">📋 Document Verification (You are here)</strong> → 🛡️ Police Verification → ✅ Admin Final Approval → 🛂 Print Passport
      </p>
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <span class="doc-verify-badge pass">✅ Passed: ${verified}</span>
        <span class="doc-verify-badge fail">❌ Failed: ${failed}</span>
        <span class="doc-verify-badge pending">⏳ Pending: ${uploaded - verified - failed}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px">${docsHtml}</div>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-success" id="btnFinalizeVerify" data-id="${app.id}" ${verified < uploaded ? 'disabled style="opacity:.5"' : ''}>
          📋 Finalize — All Documents Verified (${verified}/${uploaded})
        </button>
        <button class="btn btn-danger" id="btnRejectDocs" data-id="${app.id}" ${failed === 0 ? 'disabled style="opacity:.5"' : ''}>
          ❌ Send Back — Failed Documents Need Re-upload
        </button>
      </div>
      ${verified < uploaded ? '<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">⚠️ Verify all documents individually to enable finalization.</p>' : ''}
    `;

    els.detailOverlay.classList.remove('hidden');

    // Per-doc pass handlers
    els.detailContent.querySelectorAll('[data-doc-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.docPass;
        const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
        const a = allApps.find(x => x.id === appId);
        if (!a.docStatus) a.docStatus = {};
        a.docStatus[key] = { status: 'pass', reason: '' };
        lsSet(LS_KEYS.APPLICATIONS, allApps);
        PE.saveApplication(a);
        showDocVerification(appId);
        showToast(`${DOC_NAMES[key]} → ✅ Passed`, 'success');
      });
    });

    // Per-doc fail handlers
    els.detailContent.querySelectorAll('[data-doc-fail]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.docFail;
        const reasonSel = els.detailContent.querySelector(`[data-doc-reason="${key}"]`);
        const reason = reasonSel ? reasonSel.value : '';
        if (!reason) { showToast('Select a failure reason first.', 'error'); return; }

        const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
        const a = allApps.find(x => x.id === appId);
        if (!a.docStatus) a.docStatus = {};
        a.docStatus[key] = { status: 'fail', reason: reason };
        lsSet(LS_KEYS.APPLICATIONS, allApps);
        PE.saveApplication(a);
        showDocVerification(appId);
        showToast(`${DOC_NAMES[key]} → ❌ Failed: ${reason}`, 'error');
      });
    });

    // Finalize all verified → Documents Verified → sent to Police
    document.getElementById('btnFinalizeVerify')?.addEventListener('click', () => {
      const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
      const a = allApps.find(x => x.id === appId);
      if (a) {
        a.status = 'Documents Verified';
        a.docsVerifiedAt = new Date().toISOString();
        lsSet(LS_KEYS.APPLICATIONS, allApps);
        PE.saveApplication(a);
        els.detailOverlay.classList.add('hidden');
        renderTable(); updateStats();
        showToast(`${appId} — All documents verified! ✅ Sent to Police for verification.`, 'success');
      }
    });

    document.getElementById('btnRejectDocs')?.addEventListener('click', () => {
      const allApps = lsGet(LS_KEYS.APPLICATIONS, []);
      const a = allApps.find(x => x.id === appId);
      if (a) {
        a.status = 'Documents Failed';
        a.docsFailedAt = new Date().toISOString();
        const failedDocs = Object.entries(a.docStatus || {}).filter(([,v]) => v.status === 'fail').map(([k,v]) => `${DOC_NAMES[k]}: ${v.reason}`);
        a.failedDocsMessage = failedDocs.join('; ');
        lsSet(LS_KEYS.APPLICATIONS, allApps);
        PE.saveApplication(a);
        els.detailOverlay.classList.add('hidden');
        renderTable(); updateStats();
        showToast(`${appId} — Sent back to user for document re-upload.`, 'info');
      }
    });
  }

  // ===== DETAIL VIEW =====
  function showDetail(appId) {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    let docBadges = '';
    Object.keys(DOC_NAMES).forEach(key => {
      const uploaded = app.docs && app.docs[key];
      docBadges += `<span class="status-badge ${uploaded ? 'approved' : 'rejected'}" style="font-size:10px;padding:3px 10px;margin:2px">${DOC_NAMES[key]} ${uploaded ? '✓' : '✗'}</span>`;
    });

    // Renewal info
    let renewalInfo = '';
    if (app.applicationType === 'Renewal' || app.applicationType === 'Re-issue') {
      renewalInfo = `
        <h4 style="font-size:14px;font-weight:700;margin:20px 0 8px">🔄 ${app.applicationType} Details</h4>
        <div class="detail-grid" style="margin-bottom:12px">
          <div class="detail-item"><span class="detail-label">Old Passport</span><span class="detail-value" style="font-family:monospace;font-weight:700">${app.oldPassportNumber || '-'}</span></div>
          <div class="detail-item"><span class="detail-label">Issue Date</span><span class="detail-value">${app.oldPassportIssueDate || '-'}</span></div>
          <div class="detail-item"><span class="detail-label">Expiry Date</span><span class="detail-value">${app.oldPassportExpiryDate || '-'}</span></div>
          <div class="detail-item"><span class="detail-label">Place</span><span class="detail-value">${app.oldPassportPlaceOfIssue || '-'}</span></div>
          <div class="detail-item"><span class="detail-label">Reason</span><span class="detail-value">${app.renewalReason || '-'}</span></div>
        </div>
      `;
    }

    // Workflow progress
    const workflowSteps = [
      { key: 'Submitted', label: 'Submitted', icon: '📄' },
      { key: 'Documents Verified', label: 'Docs Verified', icon: '📋' },
      { key: 'Police Verified', label: 'Police Verified', icon: '🛡️' },
      { key: 'Admin Approved', label: 'Admin Approved', icon: '✅' },
      { key: 'Passport Issued', label: 'Passport Issued', icon: '🛂' },
    ];
    const STATUS_ORDER = {};
    workflowSteps.forEach((s, i) => STATUS_ORDER[s.key] = i + 1);
    const appIdx = STATUS_ORDER[app.status] || 0;

    let workflowHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px">';
    workflowSteps.forEach((step, i) => {
      const stepIdx = i + 1;
      let bgColor = 'var(--bg-input)';
      let textColor = 'var(--text-muted)';
      if (stepIdx < appIdx) { bgColor = 'rgba(34,197,94,.12)'; textColor = 'var(--success)'; }
      else if (stepIdx === appIdx) { bgColor = 'rgba(99,102,241,.12)'; textColor = 'var(--accent)'; }
      workflowHtml += `<span style="background:${bgColor};color:${textColor};font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px">${step.icon} ${step.label}</span>`;
    });
    workflowHtml += '</div>';

    els.detailContent.innerHTML = `
      <div class="app-id-display">${app.id}</div>
      <span class="status-badge ${getStatusClass(app.status)}" style="margin-left:12px"><span class="status-dot"></span>${app.status}</span>
      ${workflowHtml}
      <div class="detail-grid" style="margin:20px 0">
        <div class="detail-item"><span class="detail-label">Name</span><span class="detail-value">${app.fullName || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Type</span><span class="detail-value">${app.applicationType || 'Fresh'}</span></div>
        <div class="detail-item"><span class="detail-label">DOB</span><span class="detail-value">${app.dob || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Gender</span><span class="detail-value">${app.gender || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Mobile</span><span class="detail-value">${app.mobile || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${app.email || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">Aadhaar</span><span class="detail-value">${app.aadhaarNumber || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">PSK City</span><span class="detail-value">${app.pskCity || '-'}</span></div>
        <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">Address</span><span class="detail-value">${app.presentAddress || '-'}, ${app.presentCity || ''}, ${app.presentState || ''}</span></div>
        ${app.passportNumber ? `<div class="detail-item"><span class="detail-label">Passport #</span><span class="detail-value" style="color:var(--success);font-weight:700;font-family:monospace">${app.passportNumber}</span></div>` : ''}
      </div>
      ${renewalInfo}
      <h4 style="font-size:14px;font-weight:700;margin-bottom:8px">📎 Documents</h4>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">${docBadges}</div>
    `;
    els.detailOverlay.classList.remove('hidden');
  }

  // ===== REGISTERED USERS LIST =====
  function showRegisteredUsers() {
    const defaultUsers = [
      { name: 'Rahul Sharma', email: 'rahul.s@example.com', registeredAt: '12 Apr 2026' },
      { name: 'Priya Patel', email: 'priya99@gmail.com', registeredAt: '14 Apr 2026' }
    ];
    let users = lsGet('pe_users', []);
    
    // Default mock data if no real registered users yet
    if (users.length === 0) users = defaultUsers;

    let usersHtml = `
      <div style="max-height: 400px; overflow-y: auto;">
        <table style="width:100%; border-collapse:collapse; background:var(--bg-card); font-size:14px; text-align:left;">
          <thead>
            <tr style="background:var(--bg-secondary); color:var(--text-secondary); border-bottom:1px solid var(--border-color);">
              <th style="padding:12px;">Name</th>
              <th style="padding:12px;">Email / Username</th>
              <th style="padding:12px;">Auth Mode</th>
              <th style="padding:12px;">Registered On</th>
            </tr>
          </thead>
          <tbody>
    `;

    users.forEach(user => {
      const mode = user.method === 'google' ? '🟢 Google' : (user.method === 'phone' ? '📱 Mobile' : '✉️ Custom');
      const emailDisp = user.email || user.phone || 'N/A';
      const dateDisp = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : (user.registeredAt || '-');
      
      usersHtml += `
        <tr style="border-bottom:1px solid var(--bg-primary);">
          <td style="padding:12px; font-weight:600; color:var(--text-primary);">${user.name || '-'}</td>
          <td style="padding:12px; color:var(--accent); font-family:monospace;">${emailDisp}</td>
          <td style="padding:12px;">${mode}</td>
          <td style="padding:12px; color:var(--text-muted);">${dateDisp}</td>
        </tr>
      `;
    });

    usersHtml += `
          </tbody>
        </table>
      </div>
      <p style="font-size:11px; color:var(--text-muted); margin-top:16px; text-align:right;">
        🔒 Security Policy enforced: Passwords are not visible.
      </p>
    `;

    document.getElementById('detailModalTitle').textContent = `👥 Registered Users (${users.length})`;
    els.detailContent.innerHTML = usersHtml;
    els.detailOverlay.classList.remove('hidden');
  }

  let isInitialized = false;
  function init() {
    updateStats();
    renderTable();

    if (isInitialized) return;
    isInitialized = true;

    els.search.addEventListener('input', renderTable);
    els.filter.addEventListener('change', renderTable);
    els.closeDetailModal.addEventListener('click', () => {
      els.detailOverlay.classList.add('hidden');
      document.getElementById('detailModalTitle').textContent = '📋 Application Details';
    });
    els.detailOverlay.addEventListener('click', e => { 
      if (e.target === els.detailOverlay) {
        els.detailOverlay.classList.add('hidden');
        document.getElementById('detailModalTitle').textContent = '📋 Application Details';
      }
    });

    const btnViewUsers = document.getElementById('btnViewUsers');
    if (btnViewUsers) {
      btnViewUsers.addEventListener('click', showRegisteredUsers);
    }
  }

  // Initial load
  if (window.DB_READY) init();
  else document.addEventListener('DBLoaded', init);
  
  // Listen for background sync updates
  document.addEventListener('DBLoaded', init);
})();
