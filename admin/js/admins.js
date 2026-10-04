import { firebaseApp } from '../../shared/firebase.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

const auth = getAuth(firebaseApp);
const statusElement = document.getElementById('admins-status');
const content = document.getElementById('admins-content');
const accountList = document.getElementById('admin-account-list');
const accountCount = document.getElementById('admin-account-count');
const createForm = document.getElementById('admin-create-form');
let loading = false;

function setStatus(message,state='info'){
	statusElement.textContent = message;
	statusElement.dataset.state = state;
}

async function apiRequest(path,options={}){
	const user = auth.currentUser;
	if(!user) throw new Error('Sign in to manage admin accounts.');
	const token = await user.getIdToken();
	const response = await fetch(path,{
		...options,
		headers:{
			...(options.body ? {'Content-Type':'application/json'} : {}),
			Authorization:`Bearer ${token}`,
			...options.headers
		}
	});
	const result = await response.json().catch(()=>({}));
	if(!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
	return result;
}

function createAccountCard(admin){
	const card = document.createElement('article');
	card.className = 'admin-account-card';
	const identity = document.createElement('div');
	identity.className = 'admin-account-identity';
	const email = document.createElement('strong');
	email.textContent = admin.email || 'No email address';
	const badge = document.createElement('span');
	badge.className = `admin-account-badge${admin.primary ? ' primary' : ''}`;
	badge.textContent = admin.primary ? 'Primary account' : 'Admin';
	identity.append(email,badge);

	if(admin.disabled){
		const disabled = document.createElement('span');
		disabled.className = 'admin-account-disabled';
		disabled.textContent = 'Disabled';
		identity.appendChild(disabled);
	}
	card.appendChild(identity);

	const passwordForm = document.createElement('form');
	passwordForm.className = 'admin-account-password-form';
	const password = document.createElement('input');
	password.type = 'password';
	password.minLength = 8;
	password.maxLength = 128;
	password.autocomplete = 'new-password';
	password.placeholder = 'Set a new password';
	password.setAttribute('aria-label',`New password for ${admin.email || 'admin account'}`);
	password.required = true;
	const changePassword = document.createElement('button');
	changePassword.type = 'submit';
	changePassword.className = 'secondary-btn';
	changePassword.textContent = 'Change password';
	passwordForm.append(password,changePassword);
	passwordForm.addEventListener('submit',async event=>{
		event.preventDefault();
		changePassword.disabled = true;
		try{
			await apiRequest(`/api/admin/accounts/${encodeURIComponent(admin.uid)}/password`,{
				method:'PATCH',
				body:JSON.stringify({password:password.value})
			});
			passwordForm.reset();
			setStatus('Password changed.', 'success');
			if(admin.uid === auth.currentUser?.uid){
				setTimeout(async ()=>{
					await auth.signOut();
					window.location.href = 'login.html';
				},500);
			}
		}catch(error){
			setStatus(error.message,'error');
		}finally{
			changePassword.disabled = false;
		}
	});
	card.appendChild(passwordForm);

	if(!admin.primary){
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'admin-account-remove';
		remove.textContent = 'Remove account';
		remove.addEventListener('click',async ()=>{
			if(!window.confirm(`Remove ${admin.email || 'this admin'}? They will no longer be able to sign in.`)) return;
			remove.disabled = true;
			try{
				await apiRequest(`/api/admin/accounts/${encodeURIComponent(admin.uid)}`,{method:'DELETE'});
				setStatus('Admin removed.','success');
				await loadAccounts(false);
			}catch(error){
				setStatus(error.message,'error');
				remove.disabled = false;
			}
		});
		card.appendChild(remove);
	}
	return card;
}

async function loadAccounts(showLoading=true){
	if(loading) return;
	loading = true;
	if(showLoading) setStatus('Loading admin accounts...');
	try{
		const {admins=[]} = await apiRequest('/api/admin/accounts');
		accountList.replaceChildren(...admins.map(createAccountCard));
		accountCount.textContent = String(admins.length);
		content.hidden = false;
		statusElement.textContent = '';
		statusElement.dataset.state = '';
	}catch(error){
		content.hidden = true;
		setStatus(error.message,'error');
	}finally{
		loading = false;
	}
}

createForm.addEventListener('submit',async event=>{
	event.preventDefault();
	const submitButton = createForm.querySelector('[type="submit"]');
	const email = document.getElementById('new-admin-email').value.trim();
	const password = document.getElementById('new-admin-password').value;
	submitButton.disabled = true;
	try{
		await apiRequest('/api/admin/accounts',{
			method:'POST',
			body:JSON.stringify({email,password})
		});
		createForm.reset();
		setStatus('Added.','success');
		await loadAccounts(false);
	}catch(error){
		setStatus(error.message,'error');
	}finally{
		submitButton.disabled = false;
	}
});

onAuthStateChanged(auth,user=>{
	if(!user){
		window.location.href = 'login.html';
		return;
	}
	void loadAccounts();
});
