/* ================================================================
   login.js — User login / signup logic (Supabase-backed)
   ================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const LS_SESSION = 'pe_session';

  // If already logged in, redirect to correct portal
  const session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
  if (session) {
    if (session.role === 'admin') {
      window.location.href = 'admin.html';
      return;
    } else if (session.role === 'police') {
      window.location.href = 'police.html';
      return;
    } else {
      window.location.href = '../index.html';
      return;
    }
  }

  // ===== TAB SWITCHING =====
  $('tabLogin').addEventListener('click', () => switchTab('login'));
  $('tabSignup').addEventListener('click', () => switchTab('signup'));
  $('switchToSignup').addEventListener('click', e => { e.preventDefault(); switchTab('signup'); });
  $('switchToLogin').addEventListener('click', e => { e.preventDefault(); switchTab('login'); });

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    if (tab === 'login') {
      $('tabLogin').classList.add('active');
      $('formLogin').classList.add('active');
    } else {
      $('tabSignup').classList.add('active');
      $('formSignup').classList.add('active');
    }
  }

  // ===== METHOD TOGGLE =====
  function setupMethodToggle(prefix, emailFormId, phoneFormId) {
    const emailBtn = $(`${prefix}MethodEmail`);
    const phoneBtn = $(`${prefix}MethodPhone`);
    emailBtn.addEventListener('click', () => {
      emailBtn.classList.add('active'); phoneBtn.classList.remove('active');
      $(emailFormId).classList.add('active'); $(phoneFormId).classList.remove('active');
    });
    phoneBtn.addEventListener('click', () => {
      phoneBtn.classList.add('active'); emailBtn.classList.remove('active');
      $(phoneFormId).classList.add('active'); $(emailFormId).classList.remove('active');
    });
  }
  setupMethodToggle('login', 'loginEmailForm', 'loginPhoneForm');
  setupMethodToggle('signup', 'signupEmailForm', 'signupPhoneForm');

  // ===== HELPERS =====
  function getUsers() { return lsGet('pe_users', []); }
  function showE(id, msg) { $(id).textContent = msg; $(id).classList.add('visible'); }
  function clearE(id) { $(id).textContent = ''; $(id).classList.remove('visible'); }
  function clearErrors() { document.querySelectorAll('.error-message').forEach(e => { e.textContent = ''; e.classList.remove('visible'); }); }

  function createSession(user) {
    localStorage.setItem(LS_SESSION, JSON.stringify({
      role: user.role || 'user',
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
      city: user.city || '',
      loginAt: new Date().toISOString()
    }));
  }

  function redirectBasedOnRole(role) {
    let target = '../index.html';
    if (role === 'admin') target = 'admin.html';
    else if (role === 'police') target = 'police.html';
    
    showToast('Login successful! Redirecting...', 'success');
    setTimeout(() => window.location.href = target, 1000);
  }

  // ===== OTP SIMULATION =====
  let generatedOtp = '';
  function simulateOtp(btnId) {
    generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
    showToast(`OTP sent! (Demo OTP: ${generatedOtp})`, 'info');
    const btn = $(btnId);
    btn.disabled = true;
    btn.textContent = 'Resend (30s)';
    let t = 30;
    const timer = setInterval(() => {
      t--;
      btn.textContent = `Resend (${t}s)`;
      if (t <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = 'Send OTP'; }
    }, 1000);
  }

  $('sendLoginOtp').addEventListener('click', () => {
    const phone = $('loginPhone').value.trim();
    if (!/^[6-9]\d{9}$/.test(phone)) { showE('loginPhoneError', 'Enter valid 10-digit number'); return; }
    clearE('loginPhoneError');
    simulateOtp('sendLoginOtp');
  });

  $('sendSignupOtp').addEventListener('click', () => {
    const phone = $('signupPhone').value.trim();
    if (!/^[6-9]\d{9}$/.test(phone)) { showE('signupPhoneError', 'Enter valid 10-digit number'); return; }
    clearE('signupPhoneError');
    simulateOtp('sendSignupOtp');
  });

  // ===== LOGIN =====
  $('btnLogin').addEventListener('click', () => {
    clearErrors();
    const isPhone = $('loginMethodPhone').classList.contains('active');
    const users = getUsers();
    let user;

    if (isPhone) {
      const phone = $('loginPhone').value.trim();
      const otp = $('loginOtp').value.trim();
      if (!/^[6-9]\d{9}$/.test(phone) && phone !== 'admin' && phone !== 'police') { showE('loginPhoneError', 'Enter valid 10-digit number'); return; }
      if (!otp || otp.length !== 6) { showE('loginOtpError', 'Enter 6-digit OTP'); return; }
      if (otp !== generatedOtp) { showE('loginOtpError', 'Invalid OTP. Try again.'); return; }
      
      // Check for demo admin/police first
      if (phone === 'admin') {
         user = { name: 'Administrator', role: 'admin', phone: 'admin' };
      } else if (phone === 'police') {
         user = { name: 'Police Officer', role: 'police', phone: 'police', city: 'Delhi' };
      } else {
         user = users.find(u => u.phone === phone);
      }
      
      if (!user) { showE('loginPhoneError', 'No account with this number. Please sign up.'); return; }
    } else {
      const email = $('loginEmail').value.trim().toLowerCase();
      const pass = $('loginPassword').value;
      if (!email) { showE('loginEmailError', 'Enter email'); return; }
      if (!pass) { showE('loginPasswordError', 'Enter password'); return; }

      // Check for demo admin/police
      if (email === 'admin' && pass === 'admin123') {
        user = { name: 'Administrator', role: 'admin', email: 'admin' };
      } else if (email === 'police' && pass === 'police123') {
        user = { name: 'Police Officer', role: 'police', email: 'police', city: 'Delhi' };
      } else {
        user = users.find(u => u.email === email && u.password === pass);
      }
      
      if (!user) { showE('loginPasswordError', 'Invalid email or password'); return; }
    }

    createSession(user);
    redirectBasedOnRole(user.role);
  });

  // ===== SIGNUP =====
  $('btnSignup').addEventListener('click', () => {
    clearErrors();
    const isPhone = $('signupMethodPhone').classList.contains('active');
    const users = getUsers();

    if (isPhone) {
      const name = $('signupPhoneName').value.trim();
      const phone = $('signupPhone').value.trim();
      const otp = $('signupPhoneOtp').value.trim();
      if (!name || name.length < 3) { showE('signupPhoneNameError', 'Name must be at least 3 characters'); return; }
      if (!/^[6-9]\d{9}$/.test(phone)) { showE('signupPhoneError', 'Enter valid 10-digit number'); return; }
      if (!otp || otp.length !== 6) { showE('signupPhoneOtpError', 'Enter 6-digit OTP'); return; }
      if (otp !== generatedOtp) { showE('signupPhoneOtpError', 'Invalid OTP'); return; }
      if (users.find(u => u.phone === phone)) { showE('signupPhoneError', 'Number already registered. Login instead.'); return; }
      const newUser = { name, phone, email: '', password: '', method: 'phone', role: 'user', createdAt: new Date().toISOString() };
      users.push(newUser);
      lsSet('pe_users', users);
      PE.saveUser(newUser);   // persist to Supabase
      createSession(newUser);
    } else {
      const name = $('signupName').value.trim();
      const email = $('signupEmail').value.trim().toLowerCase();
      const pass = $('signupPassword').value;
      const confirm = $('signupConfirm').value;
      if (!name || name.length < 3) { showE('signupNameError', 'Name must be at least 3 characters'); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showE('signupEmailError', 'Enter valid email'); return; }
      if (!pass || pass.length < 6) { showE('signupPasswordError', 'Min 6 characters'); return; }
      if (pass !== confirm) { showE('signupConfirmError', 'Passwords do not match'); return; }
      if (users.find(u => u.email === email)) { showE('signupEmailError', 'Email already registered. Login instead.'); return; }
      const newUser = { name, email, password: pass, phone: '', method: 'email', role: 'user', createdAt: new Date().toISOString() };
      users.push(newUser);
      lsSet('pe_users', users);
      PE.saveUser(newUser);   // persist to Supabase
      createSession(newUser);
    }

    showToast('Account created! Redirecting...', 'success');
    setTimeout(() => window.location.href = '../index.html', 1000);
  });

  // ===== GOOGLE (Simulation) =====
  $('btnGoogleLogin').addEventListener('click', () => {
    const users = getUsers();
    const gUser = { name: 'Google User', email: 'user@gmail.com', password: '', phone: '', method: 'google', role: 'user', createdAt: new Date().toISOString() };
    if (!users.find(u => u.email === gUser.email)) {
      users.push(gUser);
      lsSet('pe_users', users);
      PE.saveUser(gUser);
    }
    createSession(gUser);
    showToast('Signed in with Google! Redirecting...', 'success');
    setTimeout(() => window.location.href = '../index.html', 1000);
  });
  $('btnGoogleSignup').addEventListener('click', () => $('btnGoogleLogin').click());

})();
