// Settings persistence with Firestore + localStorage fallback.
import { db } from '../../shared/firebase.js';
import { doc, setDoc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const form = document.getElementById('settings-form');
const restaurantNameInput = document.getElementById('restaurant-name');
const logoFileInput = document.getElementById('restaurant-logo-file');
const logoPreview = document.getElementById('logo-preview');
const topbarColorInput = document.getElementById('topbar-color');
const topbarColorValue = document.getElementById('topbar-color-value');
const buttonColorInput = document.getElementById('button-color');
const buttonColorValue = document.getElementById('button-color-value');
const previewHeader = document.getElementById('settings-preview-header');
const previewName = document.getElementById('settings-preview-name');
const previewButton = document.getElementById('settings-preview-button');
const msg = document.getElementById('settings-msg');
const defaultTopbarColor = '#0a7660';
const defaultButtonColor = '#087f68';
let settingsDirty = false;
let pendingSettings = null;

function normalizeColor(value, fallback = defaultTopbarColor){
	const color = String(value || '').trim();
	return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}

function foregroundForColor(value){
	const color = normalizeColor(value).slice(1);
	const red = parseInt(color.slice(0,2),16);
	const green = parseInt(color.slice(2,4),16);
	const blue = parseInt(color.slice(4,6),16);
	return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#17221d' : '#ffffff';
}

function updateTopbarColor(value){
	const color = normalizeColor(value);
	if(topbarColorInput) topbarColorInput.value = color;
	if(topbarColorValue) topbarColorValue.value = color;
	if(previewHeader){
		previewHeader.style.backgroundColor = color;
		previewHeader.style.color = foregroundForColor(color);
	}
	localStorage.setItem('topbarColor', color);
}

function updateButtonColor(value){
	const color = normalizeColor(value, defaultButtonColor);
	if(buttonColorInput) buttonColorInput.value = color;
	if(buttonColorValue) buttonColorValue.value = color;
	if(previewButton){
		previewButton.style.backgroundColor = color;
		previewButton.style.color = foregroundForColor(color);
	}
	localStorage.setItem('buttonColor', color);
}

function updateNamePreview(){
	const name = restaurantNameInput.value.trim();
	if(previewName) previewName.textContent = name || 'Your Business';
	document.dispatchEvent(new CustomEvent('restaurant-name-updated',{detail:name || 'Your Business'}));
}

topbarColorInput && topbarColorInput.addEventListener('input', (event)=>{
	settingsDirty = true;
	updateTopbarColor(event.target.value);
});
topbarColorValue && topbarColorValue.addEventListener('input', (event)=>{
	settingsDirty = true;
	if(/^#[0-9a-fA-F]{6}$/.test(event.target.value.trim())) updateTopbarColor(event.target.value);
});
buttonColorInput && buttonColorInput.addEventListener('input', (event)=>{
	settingsDirty = true;
	updateButtonColor(event.target.value);
});
buttonColorValue && buttonColorValue.addEventListener('input', (event)=>{
	settingsDirty = true;
	if(/^#[0-9a-fA-F]{6}$/.test(event.target.value.trim())) updateButtonColor(event.target.value);
});
restaurantNameInput && restaurantNameInput.addEventListener('input',updateNamePreview);
form && form.addEventListener('input', ()=>{ settingsDirty = true; });
form && form.addEventListener('change', ()=>{ settingsDirty = true; });

function updateLogoPreview(url){
	if(!logoPreview) return;
	if(url){
		logoPreview.src = url;
		logoPreview.style.display = 'block';
	}else{
		logoPreview.removeAttribute('src');
		logoPreview.style.display = 'none';
	}
}

logoFileInput && logoFileInput.addEventListener('change', (event)=>{
	const file = event.target.files && event.target.files[0];
	if(!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		const result = typeof reader.result === 'string' ? reader.result : '';
		localStorage.setItem('siteLogoUrl', result);
		updateLogoPreview(result);
	};
	reader.readAsDataURL(file);
});

async function loadSettings(){
	if(settingsDirty) return;
	if(db){
		try{
			const snap = await getDoc(doc(db,'config','site'));
			if(snap.exists()){
				if(settingsDirty) return;
				const data = snap.data();
				restaurantNameInput.value = data.restaurantName || '';
				updateNamePreview();
				const savedLogo = data.logoUrl || '';
				updateTopbarColor(data.topbarColor || defaultTopbarColor);
				updateButtonColor(data.buttonColor || defaultButtonColor);
				updateLogoPreview(savedLogo);
				localStorage.setItem('restaurantName', restaurantNameInput.value || 'Your Business');
				localStorage.setItem('siteLogoUrl', savedLogo);
				return;
			}
		}catch(e){ console.warn('Error reading settings from Firestore', e); }
	}

	const restaurantName = localStorage.getItem('restaurantName') || 'Your Business';
	const logoUrl = localStorage.getItem('siteLogoUrl') || '';
	const topbarColor = normalizeColor(localStorage.getItem('topbarColor') || defaultTopbarColor);
	const buttonColor = normalizeColor(localStorage.getItem('buttonColor') || defaultButtonColor, defaultButtonColor);
	restaurantNameInput.value = restaurantName;
	updateNamePreview();
	updateLogoPreview(logoUrl);
	updateTopbarColor(topbarColor);
	updateButtonColor(buttonColor);
}

async function saveSettings(e){
	e && e.preventDefault();
	const restaurantName = restaurantNameInput.value.trim() || 'Your Business';
	updateNamePreview();
	const logoUrl = localStorage.getItem('siteLogoUrl') || '';
	const topbarColor = normalizeColor(topbarColorInput ? topbarColorInput.value : topbarColorValue.value);
	const buttonColor = normalizeColor(buttonColorInput ? buttonColorInput.value : buttonColorValue.value, defaultButtonColor);
	pendingSettings = { restaurantName, logoUrl, topbarColor, buttonColor };

	if(db){
		try{
			await setDoc(doc(db,'config','site'), { restaurantName, logoUrl, topbarColor, buttonColor }, { merge: true });
			localStorage.setItem('restaurantName', restaurantName);
			localStorage.setItem('siteLogoUrl', logoUrl);
			updateTopbarColor(topbarColor);
			updateButtonColor(buttonColor);
			msg.innerText = 'Added';
		}catch(err){
			console.warn('Failed to save to Firestore, saving locally', err);
			pendingSettings = null;
			localStorage.setItem('restaurantName', restaurantName);
			localStorage.setItem('siteLogoUrl', logoUrl);
			updateTopbarColor(topbarColor);
			updateButtonColor(buttonColor);
			msg.innerText = 'Saved locally (Firestore error).';
		}
	}else{
		pendingSettings = null;
		localStorage.setItem('restaurantName', restaurantName);
		localStorage.setItem('siteLogoUrl', logoUrl);
		updateTopbarColor(topbarColor);
		updateButtonColor(buttonColor);
		msg.innerText = 'Saved locally.';
	}

	updateLogoPreview(logoUrl);
	setTimeout(()=>{ settingsDirty = false; }, 3000);
	setTimeout(()=> msg.innerText = '', 2500);
}

form && form.addEventListener('submit', saveSettings);
loadSettings();

if(db){
	try{
		onSnapshot(doc(db,'config','site'), (snap)=>{
			if(snap.exists()){
				const data = snap.data();
				if(pendingSettings){
					const matchesPending = (data.restaurantName || 'Your Business') === pendingSettings.restaurantName
						&& (data.logoUrl || '') === pendingSettings.logoUrl
						&& (data.topbarColor || defaultTopbarColor) === pendingSettings.topbarColor
						&& (data.buttonColor || defaultButtonColor) === pendingSettings.buttonColor;
					if(!matchesPending) return;
					pendingSettings = null;
				}
				if(settingsDirty) return;
				restaurantNameInput.value = data.restaurantName || 'Your Business';
				updateNamePreview();
				const fireLogo = data.logoUrl || '';
				const fireTopbarColor = data.topbarColor || defaultTopbarColor;
				const fireButtonColor = data.buttonColor || defaultButtonColor;
				updateLogoPreview(fireLogo);
				updateTopbarColor(fireTopbarColor);
				updateButtonColor(fireButtonColor);
				localStorage.setItem('restaurantName', restaurantNameInput.value || 'Your Business');
				localStorage.setItem('siteLogoUrl', fireLogo);
			}
		});
	}catch(e){ console.warn('onSnapshot failed', e); }
}

window.addEventListener('storage', (e)=>{
	if(e.key === 'siteLogoUrl' || e.key === 'restaurantName' || e.key === 'topbarColor' || e.key === 'buttonColor') loadSettings();
});