import { getUrlParams } from './restaurant.js';
import { db } from '../../shared/firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

let storedCart = [];
try{
	const parsedCart = JSON.parse(localStorage.getItem('cart') || '[]');
	if(Array.isArray(parsedCart)) storedCart = parsedCart.filter(item=>item && typeof item === 'object' && (item.id || item.name));
}catch(error){
	console.error('Saved cart data could not be read:', error);
	localStorage.removeItem('cart');
}

const cart = [];
const el = document.getElementById('cart');
const checkoutBtn = document.getElementById('checkout');
const cartItemsCount = document.getElementById('cart-items-count');
const tableNumberInput = document.getElementById('table-number');
const locationNumberLabel = document.getElementById('location-number-label');
let checkoutLocationType = localStorage.getItem('checkoutLocationType') === 'room' ? 'room' : 'table';
let checkoutLocationCount = Number(localStorage.getItem('checkoutLocationCount'));
let checkoutSettingsReady = false;
if(!Number.isInteger(checkoutLocationCount) || checkoutLocationCount < 1 || checkoutLocationCount > 20) checkoutLocationCount = 1;
const { tableId } = getUrlParams();
if(tableId && /^\d+$/.test(tableId)) tableNumberInput.value = tableId;
const catalogUrl = location.pathname === '/cart.html'
	? new URL('/', location.origin)
	: new URL('index.html', document.baseURI);
catalogUrl.search = location.search;
document.querySelectorAll('a[href="index.html"]').forEach(link=>{ link.href = catalogUrl.href; });

function updateRestaurantName(value){
	const name = value || 'Your Business';
	document.querySelectorAll('[data-restaurant-name]').forEach(element=>{ element.textContent = name; });
	document.title = `${name} | Your Cart`;
}

updateRestaurantName(localStorage.getItem('restaurantName'));

function applyButtonColor(value){
	const color = String(value || '').trim();
	if(!/^#[0-9a-fA-F]{6}$/.test(color)) return;
	const red = parseInt(color.slice(1,3),16);
	const green = parseInt(color.slice(3,5),16);
	const blue = parseInt(color.slice(5,7),16);
	const foreground = (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#17221d' : '#ffffff';
	document.documentElement.style.setProperty('--button-color',color);
	document.documentElement.style.setProperty('--button-foreground',foreground);
}

function getCartImageUrl(url){
	const uploadPath = '/image/upload/';
	if(typeof url !== 'string' || !url.includes('res.cloudinary.com/') || !url.includes(uploadPath)) return url;
	return url.replace(uploadPath,`${uploadPath}f_auto,q_auto:good,c_fill,g_auto,w_336,h_336/`);
}

function applyCheckoutLocation(settings){
	checkoutLocationType = settings.locationType === 'room' ? 'room' : 'table';
	const count = Number(settings.locationCount);
	checkoutLocationCount = Number.isInteger(count) && count >= 1 && count <= 20 ? count : 1;
	const isRoom = checkoutLocationType === 'room';
	const label = isRoom ? 'Room number' : 'Table number';
	const placeholder = isRoom ? 'Enter your room number' : 'Enter your table number';
	const lang = localStorage.getItem('lang') || 'en';
	const translatedLabel = lang === 'bn'
		? (isRoom ? 'রুম নম্বর' : 'টেবিল নম্বর')
		: label;
	locationNumberLabel.firstChild.textContent = `${translatedLabel} `;
	tableNumberInput.placeholder = lang === 'bn'
		? (isRoom ? 'আপনার রুম নম্বর লিখুন' : 'আপনার টেবিল নম্বর লিখুন')
		: placeholder;
	tableNumberInput.max = String(checkoutLocationCount);
	tableNumberInput.setCustomValidity('');
	tableNumberInput.removeAttribute('aria-invalid');
	localStorage.setItem('checkoutLocationType',checkoutLocationType);
	localStorage.setItem('checkoutLocationCount',String(checkoutLocationCount));
}

applyCheckoutLocation({locationType:checkoutLocationType,locationCount:checkoutLocationCount});

applyButtonColor(localStorage.getItem('buttonColor'));
window.addEventListener('storage',event=>{
	if(event.key === 'buttonColor') applyButtonColor(event.newValue);
	if(event.key === 'checkoutLocationType' || event.key === 'checkoutLocationCount'){
		applyCheckoutLocation({
			locationType:localStorage.getItem('checkoutLocationType'),
			locationCount:localStorage.getItem('checkoutLocationCount')
		});
	}
});

function productKey(item){
	return item.id ? `id:${item.id}` : `name:${item.name || ''}|${item.category || ''}`;
}

if(Array.isArray(storedCart)){
	storedCart.forEach(item=>{
		const savedQuantity = Number(item.quantity);
		const quantity = Number.isFinite(savedQuantity) && savedQuantity > 0 ? Math.floor(savedQuantity) : 1;
		const existing = cart.find(entry=>productKey(entry) === productKey(item));
		if(existing) existing.quantity += quantity;
		else cart.push({...item,quantity});
	});
}

function saveCart(){
	localStorage.setItem('cart',JSON.stringify(cart));
}

async function loadBusinessSettings(){
	if(!db){
		checkoutSettingsReady = true;
		checkoutBtn.disabled = cart.length === 0;
		return;
	}
	try{
		const settings = await getDoc(doc(db,'config','site'));
		if(!settings.exists()) return;
		const data = settings.data();
		if(data.restaurantName){
			localStorage.setItem('restaurantName', data.restaurantName);
			updateRestaurantName(data.restaurantName);
		}
		if(data.whatsapp){
			localStorage.setItem('whatsappNumber', data.whatsapp);
			localStorage.setItem('siteWhatsApp', data.whatsapp);
		}
		if(data.buttonColor) applyButtonColor(data.buttonColor);
		applyCheckoutLocation(data);
	}catch(error){
		console.error('Business settings could not be loaded for checkout:', error);
	}finally{
		checkoutSettingsReady = true;
		checkoutBtn.disabled = cart.length === 0;
	}
}

const businessSettingsPromise = loadBusinessSettings();

function itemPrice(item){
	const savedPrice = Number(item.price);
	const price = Number.isFinite(savedPrice) ? Math.max(0,savedPrice) : 0;
	const savedDiscount = Number(item.discount);
	const discount = Number.isFinite(savedDiscount) ? Math.min(100,Math.max(0,savedDiscount)) : 0;
	return price - price * discount / 100;
}

function renderCart(){
	let total = 0;
	const itemCount = cart.reduce((sum,item)=>sum + item.quantity,0);
	if(cartItemsCount) cartItemsCount.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
	if(!cart.length){
		el.innerHTML = '<div class="cart-empty"><span class="cart-empty-icon" aria-hidden="true">&#128722;</span><h3>Your cart is empty</h3><p>Choose an item from the catalog to get started.</p><a class="cart-empty-link" href="index.html">Browse the catalog <span aria-hidden="true">&#8594;</span></a></div>';
		el.querySelector('.cart-empty-link').href = catalogUrl.href;
		checkoutBtn.disabled = true;
		return;
	}
	el.replaceChildren();
	const list = document.createElement('div');
	list.className = 'cart-list';
	cart.forEach((item,index)=>{
		const unitPrice = itemPrice(item);
		const lineTotal = unitPrice * item.quantity;
		total += lineTotal;
		const row = document.createElement('article');
		row.className = 'cart-item';
		row.dataset.index = String(index);
		const imageUrl = item.images && item.images[0] && item.images[0].url ? item.images[0].url : item.image;
		if(imageUrl){
			const image = document.createElement('img');
			image.className = 'cart-item-image';
			image.src = getCartImageUrl(imageUrl);
			image.alt = item.name || 'Product';
			image.loading = 'lazy';
			row.appendChild(image);
		}else{
			const placeholder = document.createElement('div');
			placeholder.className = 'cart-item-image cart-item-placeholder';
			placeholder.textContent = 'No image';
			row.appendChild(placeholder);
		}

		const details = document.createElement('div');
		details.className = 'cart-item-details';
		const title = document.createElement('h2');
		title.className = 'cart-item-title';
		title.textContent = item.name || 'Product';
		const price = document.createElement('p');
		price.className = 'cart-item-price';
		price.textContent = `৳${unitPrice} each`;
		const itemTotal = document.createElement('p');
		itemTotal.className = 'cart-item-line-total';
		itemTotal.textContent = `৳${lineTotal}`;
		details.append(title,price,itemTotal);

		const controls = document.createElement('div');
		controls.className = 'cart-item-controls';
		const quantity = document.createElement('div');
		quantity.className = 'cart-quantity-controls';
		const decrease = document.createElement('button');
		decrease.type = 'button';
		decrease.className = 'quantity-button';
		decrease.dataset.action = 'decrease';
		decrease.dataset.index = String(index);
		decrease.setAttribute('aria-label',`Decrease ${item.name || 'product'} quantity`);
		decrease.textContent = '−';
		const quantityLabel = document.createElement('span');
		quantityLabel.className = 'quantity-value';
		quantityLabel.textContent = String(item.quantity);
		const increase = document.createElement('button');
		increase.type = 'button';
		increase.className = 'quantity-button';
		increase.dataset.action = 'increase';
		increase.dataset.index = String(index);
		increase.setAttribute('aria-label',`Increase ${item.name || 'product'} quantity`);
		increase.textContent = '+';
		quantity.append(decrease,quantityLabel,increase);
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'remove-cart-item';
		remove.dataset.action = 'remove';
		remove.dataset.index = String(index);
		remove.textContent = 'Remove';
		controls.append(quantity,remove);
		row.append(details,controls);
		list.appendChild(row);
	});
	el.appendChild(list);
	const summary = document.createElement('div');
	summary.className = 'cart-summary';
	const summaryLabel = document.createElement('span');
	summaryLabel.textContent = 'Total';
	const summaryTotal = document.createElement('strong');
	summaryTotal.textContent = `৳${total}`;
	summary.append(summaryLabel,summaryTotal);
	el.appendChild(summary);
	checkoutBtn.disabled = !checkoutSettingsReady;
}

el.addEventListener('click',(event)=>{
	const button = event.target.closest('button[data-action]');
	if(!button) return;
	const index = Number(button.dataset.index);
	const item = cart[index];
	if(!item) return;
	if(button.dataset.action === 'increase') item.quantity += 1;
	if(button.dataset.action === 'decrease' && item.quantity > 1) item.quantity -= 1;
	if(button.dataset.action === 'remove') cart.splice(index,1);
	saveCart();
	renderCart();
});

renderCart();
saveCart();

checkoutBtn.addEventListener('click', async ()=>{
	tableNumberInput.value = tableNumberInput.value.trim();
	if(!tableNumberInput.value){
		tableNumberInput.setAttribute('aria-invalid','true');
		const isRoom = checkoutLocationType === 'room';
		tableNumberInput.setCustomValidity(localStorage.getItem('lang') === 'bn'
			? (isRoom ? 'আপনার রুম নম্বর লিখুন।' : 'আপনার টেবিল নম্বর লিখুন।')
			: `Please enter your ${isRoom ? 'room' : 'table'} number.`);
		tableNumberInput.reportValidity();
		tableNumberInput.focus();
		return;
	}
	const enteredNumber = Number(tableNumberInput.value);
	if(!Number.isInteger(enteredNumber) || enteredNumber < 1 || enteredNumber > checkoutLocationCount){
		tableNumberInput.setAttribute('aria-invalid','true');
		tableNumberInput.setCustomValidity(localStorage.getItem('lang') === 'bn'
			? `নম্বরটি ১ থেকে ${checkoutLocationCount}-এর মধ্যে হতে হবে।`
			: `Enter a number from 1 to ${checkoutLocationCount}.`);
		tableNumberInput.reportValidity();
		tableNumberInput.focus();
		return;
	}
	tableNumberInput.removeAttribute('aria-invalid');
	tableNumberInput.setCustomValidity('');
	checkoutBtn.disabled = true;
	try{
		await sendWhatsApp();
	}finally{
		checkoutBtn.disabled = cart.length === 0;
	}
});

tableNumberInput.addEventListener('input',()=>{
	tableNumberInput.setCustomValidity('');
	const value = Number(tableNumberInput.value);
	if(Number.isInteger(value) && value >= 1 && value <= checkoutLocationCount) tableNumberInput.removeAttribute('aria-invalid');
});

function buildMessage(lang='en'){
	const lines = [];
	const restaurantName = localStorage.getItem('restaurantName') || 'Your Business';
	if(lang === 'bn') {
		lines.push(`${restaurantName} - নতুন অর্ডার`);
		lines.push(`${checkoutLocationType === 'room' ? 'রুম' : 'টেবিল'} নম্বর: ${tableNumberInput.value.trim()}`);
	} else {
		lines.push(`${restaurantName} - New order`);
		lines.push(`${checkoutLocationType === 'room' ? 'Room' : 'Table'} No: ${tableNumberInput.value.trim()}`);
	}
	lines.push('');
	let sum = 0;
	cart.forEach((item, index) => {
		const name = item.bnName && lang === 'bn' ? item.bnName : item.name;
		const lineTotal = itemPrice(item) * item.quantity;
		lines.push(`${index + 1}. ${item.quantity} x ${name} — ৳${lineTotal}`);
		sum += lineTotal;
	});
	lines.push('');
	lines.push(lang === 'bn' ? `মোট: ৳${sum}` : `Total: ৳${sum}`);
	return lines.join('\n');
}

async function sendWhatsApp(){
	const popup = window.open('about:blank', '_blank');
	await businessSettingsPromise;
	const number = localStorage.getItem('whatsappNumber') || localStorage.getItem('siteWhatsApp') || '';
	if(!number){
		if(popup) popup.close();
		alert('WhatsApp number not set for this business.');
		return;
	}
	const lang = localStorage.getItem('lang') || 'en';
	const msg = buildMessage(lang);
	const encoded = encodeURIComponent(msg);
	const clean = number.replace(/\D/g, '');
	if(clean.length < 7){
		if(popup) popup.close();
		alert('The saved WhatsApp number is invalid. Update it in the admin settings.');
		return;
	}
	const waUrl = `https://wa.me/${clean}?text=${encoded}`;
	if(popup){
		popup.opener = null;
		popup.location.href = waUrl;
	}else{
		window.location.assign(waUrl);
		return;
	}
	try { localStorage.removeItem('cart'); } catch (e) {}
	location.href = catalogUrl.href;
}
