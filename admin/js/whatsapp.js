import { db } from '../../shared/firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const input = document.getElementById('whatsapp');
const form = document.getElementById('whatsapp-form');
const saveButton = document.getElementById('save');
const status = document.getElementById('whatsapp-status');
function setStatus(message, state='info'){
	status.textContent = message;
	status.dataset.state = state;
}

function storeLocally(number){
	localStorage.setItem('whatsappNumber', number);
	localStorage.setItem('siteWhatsApp', number);
	localStorage.setItem('whatsapp', number);
}

async function loadNumber(){
	if(db){
		try{
			const settings = await getDoc(doc(db,'config','site'));
			const number = settings.exists() ? settings.data().whatsapp : '';
			if(number){
				input.value = number;
				storeLocally(number);
				return;
			}
		}catch(error){
			console.error('Could not load WhatsApp number:', error);
			setStatus('Could not load the saved number from Firestore. Showing this browser\'s saved value.', 'error');
		}
	}
	input.value = localStorage.getItem('whatsappNumber') || localStorage.getItem('siteWhatsApp') || localStorage.getItem('whatsapp') || '';
}

form.addEventListener('submit', async (event)=>{
	event.preventDefault();
	const number = input.value.trim();
	if(number.replace(/\D/g,'').length < 7){
		setStatus('Enter a valid WhatsApp number with country code.', 'error');
		return;
	}

	saveButton.disabled = true;
	setStatus('Saving number...', 'info');
	try{
		if(!db) throw new Error('Firebase Firestore is not initialized.');
		await setDoc(doc(db,'config','site'), {whatsapp: number}, {merge:true});
		storeLocally(number);
		setStatus('Added', 'success');
	}catch(error){
		console.error('Could not save WhatsApp number:', error);
		storeLocally(number);
		setStatus(`Saved on this browser only. Firestore error: ${error.message}`, 'error');
	}finally{
		saveButton.disabled = false;
	}
});

loadNumber();