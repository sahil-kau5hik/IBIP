/* ================================================================
   track.js — Application tracking with 5-step pipeline & PDF
   New Flow: Submitted → Documents Verified → Police Verified → Admin Approved → Passport Issued
   ================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const container = $('appListContainer');
  const noMsg = $('noAppsMsg');
  const printArea = $('printArea');

  // Updated status steps to match new workflow
  const STATUS_STEPS = [
    { key: 'Submitted', icon: '📄', label: 'Submitted' },
    { key: 'Documents Verified', icon: '📋', label: 'Docs Verified' },
    { key: 'Police Verified', icon: '🛡️', label: 'Police Verified' },
    { key: 'Admin Approved', icon: '✅', label: 'Admin Approved' },
    { key: 'Passport Issued', icon: '🛂', label: 'Passport Issued' },
  ];

  const STATUS_ORDER = {};
  STATUS_STEPS.forEach((s, i) => STATUS_ORDER[s.key] = i + 1);
  STATUS_ORDER['Rejected'] = -1;
  STATUS_ORDER['Documents Failed'] = 1; // Same level as submitted

  function getStepState(appStatus, stepKey) {
    if (appStatus === 'Rejected') {
      const rejIdx = STATUS_ORDER[stepKey];
      return rejIdx <= 1 ? 'completed' : '';
    }
    if (appStatus === 'Documents Failed') {
      return stepKey === 'Submitted' ? 'active' : '';
    }
    const appIdx = STATUS_ORDER[appStatus] || 1;
    const stepIdx = STATUS_ORDER[stepKey] || 1;
    if (stepIdx < appIdx) return 'completed';
    if (stepIdx === appIdx) return 'active';
    return '';
  }

  function init() {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    // Always sort by date newest first
    apps.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    
    container.innerHTML = '';
    if (apps.length === 0) { noMsg.classList.remove('hidden'); return; }
    noMsg.classList.add('hidden');

    // Doc name map — defined early so it can be used in docsFailedBanner and docBadges
    const docNames = {
      passportPhoto: '📷 Photo', aadhaarCard: '🢪 Aadhaar', panCard: '💳 PAN',
      birthCertificate: '📜 DOB Proof', addressProof: '🏠 Address', signature: '✍️ Signature'
    };

    apps.forEach(app => {
      const sc = getStatusClass(app.status);
      const card = document.createElement('div');
      card.className = 'section-card';

      // Tracker steps
      let stepsHTML = '';
      STATUS_STEPS.forEach(step => {
        const state = getStepState(app.status, step.key);
        stepsHTML += `<div class="tracker-step ${state}"><div class="step-circle">${step.icon}</div><div class="step-label">${step.label}</div></div>`;
      });

      let rejectedBanner = '';
      if (app.status === 'Rejected') {
        rejectedBanner = `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:var(--radius-sm);padding:12px 18px;margin-bottom:20px;color:var(--status-rejected);font-weight:600;display:flex;align-items:center;gap:8px;">❌ Application rejected — ${app.rejectionReason || 'Contact admin for details.'}</div>`;
      }

      // Documents Failed banner with re-upload
      let docsFailedBanner = '';
      if (app.status === 'Documents Failed' && app.docStatus) {
        const failedEntries = Object.entries(app.docStatus).filter(([,v]) => v.status === 'fail');
        let failList = '';
        failedEntries.forEach(([key, val]) => {
          failList += `
            <div class="doc-reupload-section">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
                <div>
                  <span class="doc-verify-badge fail">❌ ${docNames[key] || key}</span>
                  <div class="doc-fail-reason">Reason: ${val.reason}</div>
                </div>
                <label class="btn btn-primary btn-sm" for="reupload_track_${app.id}_${key}" style="cursor:pointer">📁 Re-upload</label>
                <input type="file" class="hidden" id="reupload_track_${app.id}_${key}" accept="image/jpeg,image/png,image/webp" data-appid="${app.id}" data-dockey="${key}" />
              </div>
            </div>
          `;
        });
        docsFailedBanner = `
          <div style="background:rgba(239,68,68,.06);border:1.5px solid rgba(239,68,68,.25);border-radius:var(--radius-md);padding:18px;margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <span style="font-size:22px">⚠️</span>
              <div>
                <div style="font-weight:700;color:var(--error);font-size:15px">Documents Failed Verification</div>
                <div style="font-size:12px;color:var(--text-muted)">Please re-upload the failed documents below. After re-upload, admin will re-verify.</div>
              </div>
            </div>
            ${failList}
          </div>
        `;
      }

      // Admin Approved banner
      let adminApprovedBanner = '';
      if (app.status === 'Admin Approved') {
        adminApprovedBanner = `<div style="background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.25);border-radius:var(--radius-sm);padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:24px">✅</span>
          <div>
            <div style="font-weight:700;color:var(--success);font-size:15px">Application Approved by Admin!</div>
            <div style="font-size:12px;color:var(--text-muted)">Your passport is being processed and will be issued shortly.</div>
          </div>
        </div>`;
      }

      let passportBanner = '';
      if (app.status === 'Passport Issued') {
        passportBanner = `<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:var(--radius-sm);padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:32px">🛂</span>
          <div>
            <div style="font-weight:700;color:var(--success);font-size:16px">Passport Issued Successfully!</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">Passport Number: <strong style="color:var(--accent);font-family:monospace">${app.passportNumber || 'N/A'}</strong></div>
          </div>
        </div>`;
      }

      // Renewal badge
      const renewalBadge = (app.applicationType === 'Renewal' || app.applicationType === 'Re-issue')
        ? `<span style="background:rgba(99,102,241,.12);color:var(--accent);font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;margin-left:8px">🔄 ${app.applicationType}</span>` : '';

      // Doc badges
      let docBadges = '';
      if (app.docs) {
        Object.keys(docNames).forEach(key => {
          if (app.docs[key]) docBadges += `<span class="status-badge approved" style="font-size:10px;padding:3px 10px">${docNames[key]} ✓</span>`;
        });
      }

      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div>
            <div class="app-id-display" style="margin-bottom:8px">${app.id}</div>
            <div style="font-size:18px;font-weight:700;">${app.fullName}${renewalBadge}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">
              ${app.applicationType || 'Fresh'} · ${app.passportType || 'Ordinary'} · PSK: ${app.pskCity || '-'}<br/>
              Submitted on ${app.dateFormatted}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="status-badge ${sc}"><span class="status-dot"></span>${app.status}</span>
            ${app.status === 'Passport Issued' ? `
              <button class="btn btn-primary btn-sm no-print" data-renew="${app.id}">🔄 Renew</button>
              <button class="btn btn-secondary btn-sm no-print" data-print="${app.id}">🖨️ E-Passport</button>
            ` : ''}
          </div>
        </div>
        ${rejectedBanner}${docsFailedBanner}${adminApprovedBanner}${passportBanner}
        <div class="tracker-steps">${stepsHTML}</div>
        <details style="margin-top:20px;">
          <summary style="cursor:pointer;font-weight:600;color:var(--accent);font-size:14px;">View Full Details & Documents</summary>
          <div style="margin-top:16px;">
            <div class="detail-grid">
              <div class="detail-item"><span class="detail-label">Name</span><span class="detail-value">${app.fullName || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">DOB</span><span class="detail-value">${app.dob || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Gender</span><span class="detail-value">${app.gender || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Father</span><span class="detail-value">${app.fatherName || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Mother</span><span class="detail-value">${app.motherName || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Mobile</span><span class="detail-value">${app.mobile || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Aadhaar</span><span class="detail-value">${app.aadhaarNumber || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">PSK City</span><span class="detail-value">${app.pskCity || '-'}</span></div>
              <div class="detail-item" style="grid-column:1/-1"><span class="detail-label">Address</span><span class="detail-value">${app.presentAddress || '-'}, ${app.presentCity || ''}, ${app.presentState || ''} - ${app.presentPincode || ''}</span></div>
              ${(app.applicationType === 'Renewal' || app.applicationType === 'Re-issue') ? `
              <div class="detail-item"><span class="detail-label">Old Passport</span><span class="detail-value" style="font-family:monospace;font-weight:700">${app.oldPassportNumber || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Old Issue Date</span><span class="detail-value">${app.oldPassportIssueDate || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Old Expiry Date</span><span class="detail-value">${app.oldPassportExpiryDate || '-'}</span></div>
              <div class="detail-item"><span class="detail-label">Renewal Reason</span><span class="detail-value">${app.renewalReason || '-'}</span></div>
              ` : ''}
            </div>
            <h4 style="margin-top:20px;margin-bottom:12px;font-size:14px;font-weight:700;">📎 Documents</h4>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">${docBadges || '<span style="color:var(--text-muted);font-size:13px;">No documents</span>'}</div>
          </div>
        </details>
      `;
      container.appendChild(card);
    });

    // Attach delegated listeners after every render
    attachDelegatedListeners();
  }

  // Event delegation — survives re-renders since container.innerHTML is cleared each time
  function attachDelegatedListeners() {
    // Remove old listener first to avoid duplicates
    container.removeEventListener('click', handleContainerClick);
    container.addEventListener('click', handleContainerClick);

    // Re-upload file inputs (need direct listeners since they're input[file])
    container.querySelectorAll('input[data-appid][data-dockey]').forEach(input => {
      input.addEventListener('change', function () {
        if (!this.files.length) return;
        const file = this.files[0];
        const appId = this.dataset.appid;
        const docKey = this.dataset.dockey;
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
          showToast('Invalid format. Only JPG, PNG, WebP.', 'error'); return;
        }
        if (file.size > 2 * 1024 * 1024) {
          showToast('File too large. Max 2MB.', 'error'); return;
        }
        const reader = new FileReader();
        reader.onload = ev => {
          const apps = lsGet(LS_KEYS.APPLICATIONS, []);
          const app = apps.find(a => a.id === appId);
          if (!app) return;
          app.docs[docKey] = ev.target.result;
          if (app.docStatus && app.docStatus[docKey]) {
            app.docStatus[docKey] = { status: 'pending', reason: '' };
          }
          const stillFailed = Object.entries(app.docStatus || {}).filter(([,v]) => v.status === 'fail');
          if (stillFailed.length === 0) {
            app.status = 'Submitted';
            delete app.failedDocsMessage;
          }
          lsSet(LS_KEYS.APPLICATIONS, apps);
          PE.saveApplication(app);
          showToast(`Re-uploaded! ${stillFailed.length === 0 ? 'Sent back to admin for verification.' : `${stillFailed.length} more needed.`}`, 'success');
          init();
        };
        reader.readAsDataURL(file);
      });
    });
  }

  function handleContainerClick(e) {
    const printBtn = e.target.closest('[data-print]');
    if (printBtn) { e.stopPropagation(); printApp(printBtn.dataset.print); return; }
    const renewBtn = e.target.closest('[data-renew]');
    if (renewBtn) {
      e.stopPropagation();
      localStorage.setItem('pe_renew_id', renewBtn.dataset.renew);
      window.location.href = 'apply.html';
    }
  }

  function printApp(appId) {
    const apps = lsGet(LS_KEYS.APPLICATIONS, []);
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    const html = `
      <div style="font-family:'Arial',sans-serif;max-width:600px;margin:0 auto;padding:30px;border:3px solid #1a56db;border-radius:12px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:28px;font-weight:900;color:#1a56db">🛂 PassportEase</div>
          <div style="font-size:13px;color:#666;margin-top:4px">Government of India — Ministry of External Affairs</div>
          <div style="background:#1a56db;color:#fff;padding:6px 20px;border-radius:20px;display:inline-block;margin-top:10px;font-size:12px;font-weight:700">E-PASSPORT ACKNOWLEDGEMENT</div>
        </div>
        <hr style="border:1px solid #e5e7eb;margin:20px 0">
        <table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:8px;color:#666;width:40%">Application ID</td><td style="padding:8px;font-weight:700;font-family:monospace">${app.id}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#666">Passport Number</td><td style="padding:8px;font-weight:700;color:#1a56db;font-family:monospace">${app.passportNumber || 'N/A'}</td></tr>
          <tr><td style="padding:8px;color:#666">Full Name</td><td style="padding:8px;font-weight:600">${app.fullName || '-'}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#666">Date of Birth</td><td style="padding:8px">${app.dob || '-'}</td></tr>
          <tr><td style="padding:8px;color:#666">Gender</td><td style="padding:8px">${app.gender || '-'}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#666">Place of Birth</td><td style="padding:8px">${app.placeOfBirth || '-'}</td></tr>
          <tr><td style="padding:8px;color:#666">Aadhaar</td><td style="padding:8px">${app.aadhaarNumber || '-'}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#666">PSK City</td><td style="padding:8px">${app.pskCity || '-'}</td></tr>
          <tr><td style="padding:8px;color:#666">Application Type</td><td style="padding:8px">${app.applicationType || 'Fresh'}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#666">Submitted On</td><td style="padding:8px">${app.dateFormatted || '-'}</td></tr>
          <tr><td style="padding:8px;color:#666">Status</td><td style="padding:8px"><strong style="color:green">✅ ${app.status}</strong></td></tr>
        </table>
        <hr style="border:1px solid #e5e7eb;margin:20px 0">
        <div style="text-align:center;font-size:11px;color:#999">This is a computer-generated acknowledgement. Printed on ${new Date().toLocaleDateString('en-IN')}</div>
      </div>
    `;
    const win = window.open('', '_blank', 'width=700,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>E-Passport - ${app.id}</title></head><body>${html}</body></html>`);
    win.document.close();
    win.print();
  }

  // Initial load
  if (window.DB_READY) init();
  else document.addEventListener('DBLoaded', init);
  // Listen for background sync updates
  document.addEventListener('DBLoaded', init);
})();
