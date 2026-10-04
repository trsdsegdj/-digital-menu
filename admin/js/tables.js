import { db } from '../../shared/firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const form = document.getElementById('table-settings-form');
const locationTypeInput = document.getElementById('location-type');
const locationCountInput = document.getElementById('location-count');
const status = document.getElementById('table-settings-status');
const saveButton = document.getElementById('save-table-settings');
const defaultSettings = {locationType:'table',locationCount:1};

function normalizeSettings(data={}){
	const locationType = data.locationType === 'room' ? 'room' : 'table';
	const locationCount = Number(data.locationCount);
	return {
		locationType,
		locationCount:Number.isInteger(locationCount) && locationCount >= 1 && locationCount <= 20
			? locationCount
			: defaultSettings.locationCount
	};
}

function displaySettings(settings){
	locationTypeInput.value = settings.locationType;
	locationCountInput.value = String(settings.locationCount);
	localStorage.setItem('checkoutLocationType',settings.locationType);
	localStorage.setItem('checkoutLocationCount',String(settings.locationCount));
}

function setStatus(message,state='info'){
	status.textContent = message;
	status.dataset.state = state;
}

async function loadSettings(){
	if(!db){
		setStatus('Firebase Firestore is not connected. Settings cannot be loaded or saved.','error');
		saveButton.disabled = true;
		return;
	}
	try{
		const saved = await getDoc(doc(db,'config','site'));
		const cached = {
			locationType:localStorage.getItem('checkoutLocationType'),
			locationCount:localStorage.getItem('checkoutLocationCount')
		};
		displaySettings(normalizeSettings(saved.exists() ? saved.data() : cached));
	}catch(error){
		console.error('Could not load checkout table settings:',error);
		setStatus('Could not load settings from Firebase. Check your connection and permissions.','error');
	}
}

form.addEventListener('submit',async event=>{
	event.preventDefault();
	const locationCount = Number(locationCountInput.value);
	if(!Number.isInteger(locationCount) || locationCount < 1 || locationCount > 20){
		locationCountInput.setCustomValidity('Enter a whole number from 1 to 20.');
		locationCountInput.reportValidity();
		locationCountInput.focus();
		return;
	}
	locationCountInput.setCustomValidity('');
	if(!db){
		setStatus('Firebase Firestore is not connected. Settings were not saved.','error');
		return;
	}
	saveButton.disabled = true;
	const settings = {locationType:locationTypeInput.value,locationCount};
	try{
		await setDoc(doc(db,'config','site'),settings,{merge:true});
		displaySettings(settings);
		setStatus('Added','success');
	}catch(error){
		console.error('Could not save checkout table settings:',error);
		setStatus('Could not save to Firebase. Check your connection and permissions.','error');
	}finally{
		saveButton.disabled = false;
	}
});

locationCountInput.addEventListener('input',()=>locationCountInput.setCustomValidity(''));
loadSettings();