import { initializeAdminLayout } from './layout.js?v=7';
import { firebaseApp } from '../../shared/firebase.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

initializeAdminLayout();

let auth = null;
try {
  auth = getAuth(firebaseApp);
} catch (e) {
  console.warn('Firebase init failed in auth.js', e);
}

const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const signOutBtn = document.getElementById('signout');
const authMsg = document.getElementById('auth-msg');
const authForm = document.querySelector('.auth-form');

function setLoginFormVisible(visible) {
  if (!authForm) return;
  authForm.style.display = visible ? 'block' : 'none';
}

function goToDashboard() {
  window.location.href = 'dashboard.html';
}

function isAdminLoginPage() {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith('/admin/') || path.endsWith('/admin') || path.endsWith('/admin/index.html') || path.endsWith('/admin/login.html');
}

function redirectToLogin() {
  window.location.href = 'login.html';
}

function getSignInErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect. Check the credentials in Firebase Authentication.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/user-disabled':
      return 'This Firebase account is disabled. Enable it in Firebase Authentication.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a while and try again.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Email/password sign-in is disabled. Enable the Email/Password provider in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase Authentication. Check the network and try again.';
    case 'auth/unauthorized-domain':
      return 'This website domain is not authorized in Firebase Authentication settings.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Firebase Authentication configuration is invalid. Check the deployed Firebase API key.';
    default:
      return error?.code
        ? `Sign-in failed (${error.code}). Check Firebase Authentication settings and try again.`
        : 'Sign-in failed. Check Firebase Authentication settings and try again.';
  }
}

async function verifyAdminAccess(user,refreshToken=false){
  const token = await user.getIdToken(refreshToken);
  const response = await fetch('/api/admin/access',{
    headers:{Authorization:`Bearer ${token}`}
  });
  const result = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error || 'This account is not authorized for admin access.');
  if(result.refreshToken) return verifyAdminAccess(user,true);
  return result;
}

async function handleAuthState(user){
  const isLoginPage = isAdminLoginPage();
  if(!user){
    if(!isLoginPage){
      redirectToLogin();
      return;
    }
    if(loginBtn) loginBtn.style.display = 'inline-block';
    if(signOutBtn) signOutBtn.style.display = 'none';
    setLoginFormVisible(true);
    if(authMsg) authMsg.innerText = sessionStorage.getItem('admin-auth-message') || '';
    sessionStorage.removeItem('admin-auth-message');
    return;
  }

  try{
    await verifyAdminAccess(user);
    if(isLoginPage){
      goToDashboard();
      return;
    }
    if(loginBtn) loginBtn.style.display = 'none';
    if(signOutBtn) signOutBtn.style.display = 'inline-block';
    setLoginFormVisible(false);
    if(authMsg) authMsg.innerText = `Signed in as ${user.email}`;
  }catch(error){
    console.error('Admin access verification failed:',error);
    if(isLoginPage){
      setLoginFormVisible(true);
      if(authMsg) authMsg.innerText = error.message;
      return;
    }
    sessionStorage.setItem('admin-auth-message',error.message);
    await signOut(auth);
  }
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    if (!auth) {
      if (authMsg) authMsg.innerText = 'Firebase not configured.';
      return;
    }

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      if (authMsg) authMsg.innerText = 'Please enter email and password.';
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (authMsg) authMsg.innerText = 'Checking admin access...';
    } catch (err) {
      console.warn(err);
      if (authMsg) authMsg.innerText = getSignInErrorMessage(err);
    }
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    if (!auth) return;
    await signOut(auth);
    if (authMsg) authMsg.innerText = 'Signed out.';
    if (window.location.pathname.toLowerCase().endsWith('dashboard.html')) {
      redirectToLogin();
    }
  });
}

if (auth) {
  onAuthStateChanged(auth, user=>{ void handleAuthState(user); });
} else {
  setLoginFormVisible(true);
  if (loginBtn) loginBtn.style.display = 'inline-block';
  if (signOutBtn) signOutBtn.style.display = 'none';
  if (authMsg) authMsg.innerText = 'Firebase is not configured. Add your Firebase credentials to continue.';
}
