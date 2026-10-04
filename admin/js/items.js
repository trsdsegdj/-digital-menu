import { db, firebaseApp } from '../../shared/firebase.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getStorage, ref as storageRef, deleteObject } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

let storage = null;
try{
	storage = getStorage(firebaseApp);
}catch(e){ console.warn('Firestore/storage init failed', e); }

function ensureFirebaseReady() {
	if (!db) {
		alert('Firebase Firestore is not connected. Check Firebase config and project setup.');
		return false;
	}
	return true;
}

const form = document.getElementById('item-form');
const idInput = document.getElementById('item-id');
const nameInput = document.getElementById('item-name');
const descriptionInput = document.getElementById('item-description');
const catInput = document.getElementById('item-category');
const priceInput = document.getElementById('item-price');
const discountInput = document.getElementById('item-discount');
const popularInput = document.getElementById('item-popular');
const imageInput = document.getElementById('item-images');
const previews = document.getElementById('image-previews');
const list = document.getElementById('items-list');
const itemStatus = document.getElementById('item-status');
const resetButton = document.getElementById('reset-btn');
let selectedFiles = [];
let existingImages = [];
let previewUrls = [];
let removedImageIds = [];
let currentUser = null;
let isAdmin = false;

function setItemStatus(message, state='info'){
	if(!itemStatus) return;
	itemStatus.textContent = message;
	itemStatus.dataset.state = state;
}

function firebaseErrorMessage(action, error){
	const code = error && error.code ? error.code : 'unknown';
	const message = error && error.message ? error.message : 'Unknown error';
	return `${action} (${code}): ${message}`;
}

function getImageId(image){
	return image.public_id || image.path || image.url;
}

async function uploadImageToCloudinary(file){
	const token = await currentUser.getIdToken();
	const signatureResponse = await fetch('/api/cloudinary/sign',{
		method:'POST',
		headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
		body:JSON.stringify({})
	});
	const signature = await signatureResponse.json();
	if(!signatureResponse.ok) throw new Error(signature.error || `Could not sign Cloudinary upload (${signatureResponse.status}).`);

	const formData = new FormData();
	formData.append('file', file, file.name);
	formData.append('api_key', signature.apiKey);
	formData.append('timestamp', String(signature.timestamp));
	formData.append('folder', signature.folder);
	formData.append('signature', signature.signature);
	const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
		method: 'POST',
		body: formData
	});
	const result = await response.json();
	if(!response.ok) throw new Error(result.error?.message || `Cloudinary upload failed (${response.status}).`);
	return {url: result.secure_url, public_id: result.public_id};
}

async function deleteCloudinaryImage(publicId){
	if(!currentUser) throw new Error('Sign in with an admin account to delete images.');
	const token = await currentUser.getIdToken();
	const response = await fetch('/api/cloudinary/delete',{
		method:'POST',
		headers:{
			Authorization:`Bearer ${token}`,
			'Content-Type':'application/json'
		},
		body:JSON.stringify({public_id:publicId})
	});
	const result = await response.json();
	if(!response.ok) throw new Error(result.error || `Could not delete Cloudinary image (${response.status}).`);
}

async function deleteRemovedImages(images){
	const failures = [];
	for(const image of images){
		try{
			if(image.public_id){
				await deleteCloudinaryImage(image.public_id);
			}else if(image.path && storage){
				await deleteObject(storageRef(storage,image.path));
			}
		}catch(error){
			console.error('Could not delete removed catalog image:',error);
			failures.push(error.message);
		}
	}
	return failures;
}

function updateAdminStatus(){
	isAdmin = Boolean(currentUser);
	if(!isAdmin){
		if(form) Array.from(form.elements).forEach(el=>el.disabled = true);
		if(currentUser) setItemStatus('This account is not authorized to manage items.', 'error');
	}else{
		if(form) Array.from(form.elements).forEach(el=>el.disabled = false);
		setItemStatus('', 'info');
	}
}

function showPreviewsFromSelected(){
	previewUrls.forEach(url=>URL.revokeObjectURL(url));
	previewUrls = [];
	previews.innerHTML = '';
	existingImages.filter(image=>!removedImageIds.includes(getImageId(image))).forEach((image)=>{
		const wrap = document.createElement('div'); wrap.style.position='relative';
		const img = document.createElement('img'); img.src = image.url; img.alt = 'Existing item image';
		const btn = document.createElement('button'); btn.type='button'; btn.innerText='✕'; btn.style.position='absolute'; btn.style.right='-6px'; btn.style.top='-6px'; btn.dataset.imageId = getImageId(image); btn.title='Remove existing image';
		wrap.appendChild(img); wrap.appendChild(btn); previews.appendChild(wrap);
	});
	selectedFiles.slice(0,3).forEach((file, idx)=>{
		const url = URL.createObjectURL(file);
		previewUrls.push(url);
		const wrap = document.createElement('div'); wrap.style.position='relative';
		const img = document.createElement('img'); img.src = url; img.alt = file.name;
		const btn = document.createElement('button'); btn.type='button'; btn.innerText='✕'; btn.style.position='absolute'; btn.style.right='-6px'; btn.style.top='-6px'; btn.dataset.index = idx; btn.title='Remove';
		wrap.appendChild(img); wrap.appendChild(btn); previews.appendChild(wrap);
	});
}

function showExistingImages(images){
	existingImages = Array.isArray(images) ? images : [];
	showPreviewsFromSelected();
}

function loadCategoryOptions(){
	if (!db || !catInput) return;
	const col = collection(db, 'categories');
	onSnapshot(col, (snap) => {
		const currentValue = catInput.value || '';
		const categoryOptions = [];
		catInput.innerHTML = '<option value="">Select category</option>';
		snap.forEach((docSnap) => {
			const data = docSnap.data();
			const name = data.name;
			if (!name) return;
			categoryOptions.push(name);
			const option = document.createElement('option');
			option.value = name;
			option.textContent = name;
			if (currentValue && currentValue === name) option.selected = true;
			catInput.appendChild(option);
		});
		if (!currentValue && categoryOptions.length) {
			catInput.value = categoryOptions[0];
		}
	}, (error)=>{
		catInput.innerHTML = '<option value="">Unable to load categories</option>';
		setItemStatus(firebaseErrorMessage('Could not load categories', error), 'error');
	});
}

imageInput && imageInput.addEventListener('change', ()=>{
	selectedFiles = Array.from(imageInput.files);
	const remainingImageSlots = Math.max(0,3 - existingImages.filter(image=>!removedImageIds.includes(getImageId(image))).length);
	if(selectedFiles.length > remainingImageSlots){
		selectedFiles = selectedFiles.slice(0,remainingImageSlots);
		setItemStatus(`Only ${remainingImageSlots} additional image(s) can be added. Each item can have up to 3 images.`, 'error');
		if(remainingImageSlots === 0) imageInput.value = '';
	}
	showPreviewsFromSelected();
});
resetButton && resetButton.addEventListener('click', ()=>{
	form.reset();
	idInput.value = '';
	selectedFiles = [];
	existingImages = [];
	removedImageIds = [];
	imageInput.value = '';
	showPreviewsFromSelected();
	setItemStatus('Form reset.', 'info');
});

// remove handler for preview buttons
previews && previews.addEventListener('click', (e)=>{
	const btn = e.target;
	if(btn && btn.dataset){
		if(btn.dataset.index != null){
			const idx = Number(btn.dataset.index);
			selectedFiles.splice(idx,1);
			if(!selectedFiles.length) imageInput.value = '';
			showPreviewsFromSelected();
		}else if(btn.dataset.imageId){
			removedImageIds.push(btn.dataset.imageId);
			showPreviewsFromSelected();
		}
	}
});

async function renderItems(){
	list.innerHTML = 'Loading...';
	try{
		if(!db) throw new Error('No Firestore');
		const col = collection(db,'items');
		// realtime listener
		onSnapshot(col, snap=>{
			list.innerHTML = '';
			snap.forEach(docSnap=>{
				const data = docSnap.data();
				const el = document.createElement('div');
				el.className = 'grid-item';
				const imageUrl = data.images && data.images[0] && data.images[0].url;
				if(imageUrl){
					const thumb = document.createElement('img');
					thumb.src = imageUrl;
					thumb.alt = '';
					thumb.style.cssText = 'width:48px;height:32px;object-fit:cover;border-radius:4px;margin-right:8px';
					el.appendChild(thumb);
				}
				const details = document.createElement('span');
				details.textContent = `${data.name || 'Unnamed item'} — ${data.category || 'Uncategorized'} — ৳${Number(data.price) || 0}`;
				const actions = document.createElement('div');
				const editButton = document.createElement('button');
				editButton.dataset.id = docSnap.id;
				editButton.className = 'edit';
				editButton.textContent = 'Edit';
				const deleteButton = document.createElement('button');
				deleteButton.dataset.id = docSnap.id;
				deleteButton.className = 'del';
				deleteButton.textContent = 'Delete';
				actions.append(editButton, ' ', deleteButton);
				el.append(details, actions);
				list.appendChild(el);
			});
			if(snap.empty) list.innerHTML = '<em>No items yet</em>';
		}, error=>{
			list.textContent = firebaseErrorMessage('Could not load items', error);
			setItemStatus('Check Firestore setup and the signed-in account permissions.', 'error');
		});
	}catch(e){
		console.warn('Render items failed, falling back', e);
		list.innerHTML = '<em>Unable to load items from Firestore.</em>';
	}
}

 form.addEventListener('submit', async (ev)=>{
	ev.preventDefault();
	if (!ensureFirebaseReady()) return;
	if (!isAdmin) {
		setItemStatus('This account is not authorized to manage items.', 'error');
		return;
	}

	const payload = {
		name: nameInput.value.trim(),
		description: descriptionInput ? descriptionInput.value.trim() : '',
		category: catInput && catInput.value ? catInput.value.trim() : 'Uncategorized',
		price: Number(priceInput.value) || 0,
		discount: Number(discountInput ? discountInput.value : 0) || 0,
		popular: Boolean(popularInput?.checked),
		updatedAt: Date.now()
	};
	if (!payload.name) return alert('Please enter a product title.');
	if (!Number.isFinite(payload.price) || payload.price < 0) {
		setItemStatus('Enter a valid non-negative price.', 'error');
		return;
	}
	if (!Number.isFinite(payload.discount) || payload.discount < 0 || payload.discount > 100) {
		setItemStatus('Discount must be between 0 and 100 percent.', 'error');
		return;
	}
	const files = selectedFiles.length ? selectedFiles.slice(0,3) : (imageInput.files ? Array.from(imageInput.files).slice(0,3) : []);
	const retainedImageCount = existingImages.filter(image=>!removedImageIds.includes(getImageId(image))).length;
	if(retainedImageCount + files.length > 3){
		setItemStatus('Each item can have up to 3 images. Remove an existing image or choose fewer new images.', 'error');
		return;
	}
	const submitButton = form.querySelector('[type="submit"]');
	const originalButtonText = submitButton.textContent;
	const uploadedImages = [];
	submitButton.disabled = true;
	submitButton.textContent = 'Saving...';
		setItemStatus(files.length ? 'Uploading images to Cloudinary and saving item...' : 'Saving item...', 'info');
	try{
		const isEditing = Boolean(idInput.value);
		const docRef = isEditing ? doc(db,'items',idInput.value) : doc(collection(db,'items'));
		const existingSnap = isEditing ? await getDoc(docRef) : null;
		const existing = existingSnap && existingSnap.exists() ? (existingSnap.data().images || []) : [];
		if(files.length){
			for(const file of files) uploadedImages.push(await uploadImageToCloudinary(file));
		}
		const finalImages = existing.filter(image=>!removedImageIds.includes(getImageId(image))).concat(uploadedImages).slice(0,3);
		const itemData = {...payload, images: finalImages};
		if(isEditing) await setDoc(docRef, itemData, {merge:true});
		else await setDoc(docRef, itemData);
		const imageDeleteFailures = await deleteRemovedImages(
			existing.filter(image=>removedImageIds.includes(getImageId(image)))
		);

		form.reset(); idInput.value = '';
		existingImages = [];
		if (discountInput) discountInput.value = 0;
		if (imageInput) imageInput.value = '';
		selectedFiles = [];
		showPreviewsFromSelected();
		removedImageIds = [];
		setItemStatus(
			imageDeleteFailures.length
				? `Added. ${imageDeleteFailures.length} old image(s) could not be deleted from storage.`
				: 'Added',
			imageDeleteFailures.length ? 'error' : 'success'
		);
	}catch(e){
		console.error('Save item failed', e);
		const orphanNote = uploadedImages.length ? ' Uploaded image(s) remain in Cloudinary and may need manual cleanup.' : '';
		setItemStatus(`${firebaseErrorMessage('Save failed', e)}${orphanNote}`, 'error');
	}finally{
		submitButton.disabled = false;
		submitButton.textContent = originalButtonText;
	}
});

list.addEventListener('click', async (ev)=>{
	const id = ev.target.dataset.id;
	if(!id) return;
	if(ev.target.classList.contains('edit')){
		if (!ensureFirebaseReady()) return;
		if(!isAdmin) return alert('আপনি অনুমোদিত নন (Not authorized)');
		const dref = doc(db,'items',id);
		const single = await getDoc(dref);
		if(single.exists()){
			const data = single.data();
			idInput.value = id;
			nameInput.value = data.name || '';
			descriptionInput.value = data.description || '';
			catInput.value = data.category || '';
			priceInput.value = data.price || 0;
			discountInput.value = data.discount || 0;
			if(popularInput) popularInput.checked = typeof data.popular === 'boolean'
				? data.popular
				: Boolean(data.featured || data.isPopular);
			showExistingImages(data.images || []);
		}
	}
	if(ev.target.classList.contains('del')){
		if (!ensureFirebaseReady()) return;
		if(!isAdmin) return alert('আপনি অনুমোদিত নন (Not authorized)');
		if(confirm('Delete this item?')){
			try{
				const dref = doc(db,'items',id);
				const single = await getDoc(dref);
				const images = single.exists() ? (single.data().images || []) : [];
				await deleteDoc(dref);
				const failures = await deleteRemovedImages(images);
				setItemStatus(
					failures.length
						? `Item deleted. ${failures.length} image(s) could not be deleted from storage.`
						: 'Item deleted.',
					failures.length ? 'error' : 'success'
				);
			}catch(error){
				console.error('Delete item failed:',error);
				setItemStatus(firebaseErrorMessage('Delete failed',error),'error');
			}
		}
	}
});

// Protect: require signed-in user for admin actions
let auth = null;
try{
	auth = getAuth(firebaseApp);
	if (auth) {
		onAuthStateChanged(auth, user=>{
			currentUser = user;
			updateAdminStatus();
			if(!user){
				// redirect to login if not authenticated
				if(!location.pathname.toLowerCase().endsWith('login.html')) location.href = 'login.html';
			}else{
				loadCategoryOptions();
				renderItems();
			}
		});
	} else {
		loadCategoryOptions();
		renderItems();
	}
}catch(e){ console.warn('Auth check failed', e); loadCategoryOptions(); renderItems(); }
