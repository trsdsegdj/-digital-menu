import { db } from '../../shared/firebase.js';
import { collection, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const categoriesElement = document.getElementById('categories');
const itemsElement = document.getElementById('items');
const tablesElement = document.getElementById('tables');
const locationsLabel = document.getElementById('locations-label');

function showLoadError(element,message,error){
	console.error(message,error);
	element.textContent = '—';
}

if(!db){
	showLoadError(categoriesElement,'Dashboard could not connect to Firestore.');
	showLoadError(itemsElement,'Dashboard could not connect to Firestore.');
	showLoadError(tablesElement,'Dashboard could not connect to Firestore.');
}else{
	onSnapshot(collection(db,'categories'),snapshot=>{
		categoriesElement.textContent = snapshot.size.toLocaleString('en-BD');
	},error=>showLoadError(categoriesElement,'Could not load category count:',error));

	onSnapshot(collection(db,'items'),snapshot=>{
		itemsElement.textContent = snapshot.size.toLocaleString('en-BD');
	},error=>showLoadError(itemsElement,'Could not load item count:',error));

	onSnapshot(doc(db,'config','site'),snapshot=>{
		const settings = snapshot.exists() ? snapshot.data() : {};
		const isRoom = settings.locationType === 'room';
		const count = Number(settings.locationCount);
		tablesElement.textContent = String(Number.isInteger(count) && count >= 1 && count <= 20 ? count : 1);
		locationsLabel.textContent = isRoom ? 'Total Rooms' : 'Total Tables';
	},error=>showLoadError(tablesElement,'Could not load table/room count:',error));
}
