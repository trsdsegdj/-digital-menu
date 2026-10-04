import { firebaseConfig } from './firebase-config.js';
import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
	getFirestore,
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

export const firebaseApp = getApps().find(existingApp=>existingApp.options.projectId === firebaseConfig.projectId)
	|| initializeApp(firebaseConfig);

let firestore;
try{
	firestore = initializeFirestore(firebaseApp,{
		localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})
	});
}catch(error){
	console.warn('Persistent Firestore cache is unavailable; using memory cache instead:',error);
	firestore = getFirestore(firebaseApp);
}

export const db = firestore;

if('serviceWorker' in navigator){
	navigator.serviceWorker.register('/service-worker.js').catch(error=>{
		console.error('Service worker registration failed:',error);
	});
}
