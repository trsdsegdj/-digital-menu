import {getUrlParams} from './restaurant.js';
import { db } from '../../shared/firebase.js';
import { doc, onSnapshot, collection } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

let categoriesData = [];
let itemsData = [];
let activeCategory = null;

const c = document.getElementById('categories');
const categoryList = c.querySelector('.categories-list');
const categoryPrevious = document.getElementById('categories-prev');
const categoryNext = document.getElementById('categories-next');
const m = document.getElementById('menu');
const menuItemCount = document.getElementById('menu-item-count');
const langToggle = document.getElementById('lang-toggle');
const themeToggle = document.getElementById('theme-toggle');
const quickNav = document.getElementById('quick-nav');
const confirmOrder = document.getElementById('confirm-order');
const searchToggle = document.getElementById('search-toggle');
const searchPanel = document.getElementById('search-panel');
const menuSearch = document.getElementById('menu-search');
let quickFilter = 'all';
let searchTerm = '';

const cartUrl = location.pathname === '/'
	? new URL('/cart.html', location.origin)
	: new URL('cart.html', document.baseURI);
cartUrl.search = location.search;
document.querySelectorAll('a[href="cart.html"]').forEach(link=>{ link.href = cartUrl.href; });

function applyTheme(name){
	document.documentElement.classList.remove('theme-teal','theme-dark','theme-pastel');
	document.documentElement.classList.add(name);
	if(themeToggle){
		themeToggle.classList.toggle('dark-mode', name === 'theme-dark');
		themeToggle.setAttribute('aria-pressed', String(name === 'theme-dark'));
	}
}

function applyTopbarColor(value){
	const color = String(value || '').trim();
	if(!/^#[0-9a-fA-F]{6}$/.test(color)) return;
	document.documentElement.style.setProperty('--topbar-color', color);
	document.documentElement.style.setProperty('--topbar-foreground', getColorForeground(color));
	localStorage.setItem('topbarColor', color);
}

function applyButtonColor(value){
	const color = String(value || '').trim();
	if(!/^#[0-9a-fA-F]{6}$/.test(color)) return;
	document.documentElement.style.setProperty('--button-color', color);
	document.documentElement.style.setProperty('--button-foreground', getColorForeground(color));
	localStorage.setItem('buttonColor', color);
}

function getColorForeground(value){
	const color = value.slice(1);
	const red = parseInt(color.slice(0,2),16);
	const green = parseInt(color.slice(2,4),16);
	const blue = parseInt(color.slice(4,6),16);
	return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#17221d' : '#ffffff';
}

function updateBranding(){
	const name = localStorage.getItem('restaurantName') || 'Your Business';
	const logo = localStorage.getItem('siteLogoUrl') || '';
	const titleEl = document.getElementById('restaurantName');
	const markEl = document.getElementById('brand-mark');
	if(titleEl) titleEl.textContent = name;
	if(markEl){
		if(logo){
			const image = document.createElement('img');
			image.src = logo;
			image.alt = `${name} logo`;
			markEl.replaceChildren(image);
			markEl.classList.add('has-logo');
		}else{
			markEl.textContent = name.trim().slice(0,2).toUpperCase() || 'RM';
			markEl.classList.remove('has-logo');
		}
	}
	document.title = `${name} Catalog`;
}

const savedTheme = ['theme-teal','theme-dark','theme-pastel'].includes(localStorage.getItem('siteTheme'))
	? localStorage.getItem('siteTheme')
	: 'theme-teal';
applyTheme(savedTheme);
applyTopbarColor(localStorage.getItem('topbarColor') || '#0d7b62');
applyButtonColor(localStorage.getItem('buttonColor') || '#087f68');
updateBranding();

window.addEventListener('storage',(event)=>{
	if(event.key === 'topbarColor' && event.newValue) applyTopbarColor(event.newValue);
	if(event.key === 'buttonColor' && event.newValue) applyButtonColor(event.newValue);
	if(event.key === 'siteTheme' && event.newValue){ applyTheme(event.newValue); updateThemeToggleState(); }
	if(event.key === 'restaurantName' || event.key === 'siteLogoUrl') updateBranding();
});

function updateLangToggleState(){
	if(!langToggle) return;
	langToggle.classList.toggle('bn-mode', lang === 'bn');
	langToggle.setAttribute('aria-pressed', String(lang === 'bn'));
	document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
}

function updateThemeToggleState(){
	if(!themeToggle) return;
	const currentTheme = localStorage.getItem('siteTheme') || 'theme-teal';
	themeToggle.classList.toggle('dark-mode', currentTheme === 'theme-dark');
	themeToggle.setAttribute('aria-pressed', String(currentTheme === 'theme-dark'));
}

// Subscribe to Firestore settings if available
if(db){
	try{
		const docRef = doc(db,'config','site');
		onSnapshot(docRef, (snap)=>{
			if(snap.exists()){
				const data = snap.data();
				if(data.theme) { applyTheme(data.theme); localStorage.setItem('siteTheme', data.theme); }
				if(data.topbarColor) applyTopbarColor(data.topbarColor);
				if(data.buttonColor) applyButtonColor(data.buttonColor);
				if(data.whatsapp) { localStorage.setItem('whatsappNumber', data.whatsapp); attachWhatsApp(data.whatsapp); }
				if(data.restaurantName) { localStorage.setItem('restaurantName', data.restaurantName); }
				if(data.logoUrl) { localStorage.setItem('siteLogoUrl', data.logoUrl); }
				updateBranding();
			}
		}, error=>{
			console.error('Business settings could not be loaded:', error);
		});
	}catch(e){ console.warn('Firestore listen failed', e); }
}else{
	// attach WhatsApp from localStorage if any
	const w = localStorage.getItem('whatsappNumber');
	if(w) attachWhatsApp(w);
}

if(db){
	try{
		onSnapshot(collection(db,'categories'), snap=>{
			categoriesData = snap.docs.map(categoryDoc=>({id: categoryDoc.id, ...categoryDoc.data()}));
			if(activeCategory && !categoriesData.some(category=>category.name === activeCategory)) activeCategory = null;
			renderCategories();
		}, error=>{
			console.error('Menu categories could not be loaded:', error);
			c.textContent = 'Categories could not be loaded. Check Firestore read permissions.';
		});

		onSnapshot(collection(db,'items'), snap=>{
			itemsData = snap.docs.map(itemDoc=>({id: itemDoc.id, ...itemDoc.data()}));
			applyLang();
		}, error=>{
			console.error('Menu items could not be loaded:', error);
			m.textContent = 'Menu could not be loaded. Check Firestore read permissions and try again.';
		});
	}catch(e){ console.warn('Menu data listeners failed', e); }
}

// Translations
const translations = {
	en: { title: 'Browse catalog', categories: 'Categories', all: 'All', home: 'Home', popular: 'Popular', new: 'New', deals: 'Deals', quickNav: 'Quick menu filters', add: 'Add', decrease: 'Decrease', increase: 'Increase', viewCart: 'View cart', item: 'item', items: 'items', itemCountOne: 'item', itemCountMany: 'items', noItems: 'No items match this filter yet.', pricePrefix: '৳' },
	bn: { title: 'ক্যাটালগ দেখুন', categories: 'ক্যাটাগরি', all: 'সব', home: 'হোম', popular: 'জনপ্রিয়', new: 'নতুন', deals: 'ছাড়', quickNav: 'দ্রুত মেনু ফিল্টার', add: 'যোগ করুন', decrease: 'কম', increase: 'বাড়ান', viewCart: 'কার্ট দেখুন', item: 'টি আইটেম', items: 'টি আইটেম', itemCountOne: 'টি আইটেম', itemCountMany: 'টি আইটেম', noItems: 'এই ফিল্টারে কোনো আইটেম নেই।', pricePrefix: '৳' }
};

let lang = localStorage.getItem('lang') || 'en';

function optimizeImageUrl(url){
	return typeof url === 'string' ? url : '';
}

function escapeHTML(value){
	return String(value ?? '').replace(/[&<>"']/g, character=>({
		'&':'&amp;',
		'<':'&lt;',
		'>':'&gt;',
		'"':'&quot;',
		"'":'&#39;'
	})[character]);
}

function getCloudinaryImageUrl(url, transformation){
	const uploadPath = '/image/upload/';
	if(!url || !url.includes('res.cloudinary.com/') || !url.includes(uploadPath)) return url;
	return url.replace(uploadPath,`${uploadPath}${transformation}/`);
}

function getMenuImageSrcset(url){
	if(!url || !url.includes('res.cloudinary.com/')) return '';
	return [240,360,480,720,960].map(width=>
		`${getCloudinaryImageUrl(url,`f_auto,q_auto:good,c_fill,g_auto,w_${width},h_${width}`)} ${width}w`
	).join(', ');
}

function updateCategoryScrollControls(){
	const hasOverflow = categoryList.scrollWidth > categoryList.clientWidth + 1;
	categoryPrevious.hidden = !hasOverflow || categoryList.scrollLeft <= 1;
	categoryNext.hidden = !hasOverflow || categoryList.scrollLeft + categoryList.clientWidth >= categoryList.scrollWidth - 1;
}

categoryPrevious.addEventListener('click',()=>categoryList.scrollBy({left:-Math.max(180,categoryList.clientWidth * .7),behavior:'smooth'}));
categoryNext.addEventListener('click',()=>categoryList.scrollBy({left:Math.max(180,categoryList.clientWidth * .7),behavior:'smooth'}));
categoryList.addEventListener('scroll',updateCategoryScrollControls,{passive:true});
window.addEventListener('resize',updateCategoryScrollControls);

function renderCategories(){
	const allSelected = activeCategory === null;
	categoryList.innerHTML = `<button class="category${allSelected ? ' active' : ''}" data-cat="" aria-pressed="${allSelected}">${escapeHTML(translations[lang].all)}</button>` + categoriesData.map(category=>{
		const name = String(category.name || '');
		const active = activeCategory === name;
		return `<button class="category${active ? ' active' : ''}" data-cat="${escapeHTML(name)}" aria-pressed="${active}">${escapeHTML(name)}</button>`;
	}).join('');
	categoryList.querySelectorAll('.category').forEach(btn=>btn.addEventListener('click', ()=>{
		activeCategory = btn.dataset.cat || null;
		renderCategories();
		renderMenu();
	}));
	requestAnimationFrame(updateCategoryScrollControls);
}

function readCart(){
	try{
		const cart = JSON.parse(localStorage.getItem('cart') || '[]');
		return Array.isArray(cart) ? cart : [];
	}catch(e){
		return [];
	}
}

function matchesCartItem(entry,item){
	return item.id && entry.id ? entry.id === item.id : entry.name === item.name && entry.category === item.category;
}

function getCartQuantity(item){
	const entry = readCart().find(cartItem=>matchesCartItem(cartItem,item));
	return entry ? Math.max(1,Number(entry.quantity) || 1) : 0;
}

function adjustCartQuantity(key,delta){
	const item = itemsData.find(entry=>String(entry.id) === String(key)) || itemsData[Number(key)];
	if(!item) return;
	const cart = readCart();
	const existingIndex = cart.findIndex(entry=>matchesCartItem(entry,item));
	if(existingIndex < 0){
		if(delta > 0) cart.push({...item,quantity:delta});
	}else{
		const nextQuantity = (Number(cart[existingIndex].quantity) || 1) + delta;
		if(nextQuantity < 1) cart.splice(existingIndex,1);
		else cart[existingIndex].quantity = nextQuantity;
	}
	localStorage.setItem('cart',JSON.stringify(cart));
	updateCartCount();
	renderMenu();
}

function getItemImageUrls(item){
	const urls = [];
	if(Array.isArray(item && item.images)){
		item.images.forEach((img)=>{
			if(img && typeof img.url === 'string' && img.url && !urls.includes(img.url)) urls.push(img.url);
		});
	}
	if(item && typeof item.image === 'string' && item.image && !urls.includes(item.image)) urls.push(item.image);
	if(!urls.length) urls.push('../assets/images/food/placeholder.svg');
	return urls;
}

function ensureItemDetailModal(){
	let modal = document.getElementById('item-detail-modal');
	if(modal) return modal;
	modal = document.createElement('div');
	modal.id = 'item-detail-modal';
	modal.className = 'item-detail-modal hidden';
	modal.setAttribute('aria-hidden', 'true');
	modal.innerHTML = `
		<div class="item-detail-overlay"></div>
		<div class="item-detail-panel" role="dialog" aria-modal="true" aria-labelledby="item-detail-title">
			<button type="button" class="item-detail-close" aria-label="Close">×</button>
			<div class="item-detail-gallery">
				<img id="item-detail-main-image" src="" alt="">
				<button type="button" class="item-detail-prev" aria-label="Previous item image">&#8249;</button>
					<button type="button" class="item-detail-next" aria-label="Next item image">&#8250;</button>
				<span id="item-detail-slide-count" class="item-detail-slide-count" aria-live="polite"></span>
				<div id="item-detail-thumbs" class="item-detail-thumbs"></div>
			</div>
			<div class="item-detail-content">
				<div class="item-detail-meta">
					<span id="item-detail-category" class="item-detail-category"></span>
					<span id="item-detail-price" class="item-detail-price"></span>
				</div>
				<h3 id="item-detail-title"></h3>
				<p id="item-detail-description"></p>
				<div id="item-detail-extra" class="item-detail-extra"></div>
				<button type="button" id="item-detail-add" class="item-detail-add">${translations[lang].add}</button>
			</div>
		</div>
	`;
	document.body.appendChild(modal);
	const mainImage = modal.querySelector('#item-detail-main-image');
	let touchStartX = null;
	mainImage.addEventListener('touchstart', event=>{ touchStartX = event.changedTouches[0].clientX; },{passive:true});
	mainImage.addEventListener('touchend', event=>{
		if(touchStartX === null) return;
		const delta = event.changedTouches[0].clientX - touchStartX;
		touchStartX = null;
		if(Math.abs(delta) < 45) return;
		modal.querySelector(delta < 0 ? '.item-detail-next' : '.item-detail-prev').click();
	},{passive:true});
	modal.addEventListener('click', (event) => {
		if(event.target.classList.contains('item-detail-overlay') || event.target.classList.contains('item-detail-close')) {
			modal.classList.add('hidden');
			modal.setAttribute('aria-hidden','true');
		}
	});
	document.addEventListener('keydown', (event) => {
		if(modal.classList.contains('hidden')) return;
		if(event.key === 'ArrowRight' && modal.querySelector('.item-detail-gallery').classList.contains('has-multiple-images')) {
			modal.querySelector('.item-detail-next').click();
		}else if(event.key === 'ArrowLeft' && modal.querySelector('.item-detail-gallery').classList.contains('has-multiple-images')) {
			modal.querySelector('.item-detail-prev').click();
		}else if(event.key === 'Escape') {
			modal.classList.add('hidden');
			modal.setAttribute('aria-hidden','true');
		}
	});
	return modal;
}

function openItemDetailModal(itemId){
	const modal = ensureItemDetailModal();
	const item = itemsData.find(entry => String(entry.id) === String(itemId)) || itemsData[Number(itemId)];
	if(!item) return;
	const title = (lang === 'bn' && item.bnName) ? item.bnName : item.name;
	const imageUrls = getItemImageUrls(item);
	const mainImage = document.getElementById('item-detail-main-image');
	const thumbs = document.getElementById('item-detail-thumbs');
	const gallery = modal.querySelector('.item-detail-gallery');
	const previousImage = modal.querySelector('.item-detail-prev');
	const nextImage = modal.querySelector('.item-detail-next');
	const slideCount = document.getElementById('item-detail-slide-count');
	const titleEl = document.getElementById('item-detail-title');
	const descriptionEl = document.getElementById('item-detail-description');
	const categoryEl = document.getElementById('item-detail-category');
	const priceEl = document.getElementById('item-detail-price');
	const addBtn = document.getElementById('item-detail-add');
	const extraEl = document.getElementById('item-detail-extra');
	const discount = Number(item.discount || 0);
	const finalPrice = discount > 0 ? Math.max(0, Number(item.price || 0) - (Number(item.price || 0) * discount) / 100) : Number(item.price || 0);
	let activeIndex = 0;
	const showImage = index=>{
		activeIndex = (index + imageUrls.length) % imageUrls.length;
		mainImage.src = getCloudinaryImageUrl(imageUrls[activeIndex],'f_auto,q_auto:good,c_limit,w_1600,h_1200');
		mainImage.alt = `${title}, image ${activeIndex + 1} of ${imageUrls.length}`;
		if(slideCount) slideCount.textContent = `${activeIndex + 1} / ${imageUrls.length}`;
		thumbs.querySelectorAll('.item-detail-thumb').forEach((button,buttonIndex)=>{
			const active = buttonIndex === activeIndex;
			button.classList.toggle('active',active);
			button.setAttribute('aria-pressed',String(active));
		});
	};
	gallery.classList.toggle('has-multiple-images',imageUrls.length > 1);
	previousImage.onclick = ()=>showImage(activeIndex - 1);
	nextImage.onclick = ()=>showImage(activeIndex + 1);
	categoryEl.textContent = item.category || 'Item';
	priceEl.textContent = `${translations[lang].pricePrefix}${finalPrice}`;
	titleEl.textContent = title;
	descriptionEl.textContent = item.description || 'No description available.';
	if(item.ingredients && item.ingredients.length) {
		const label = document.createElement('strong');
		label.textContent = 'Ingredients: ';
		extraEl.replaceChildren(label, document.createTextNode(item.ingredients.join(', ')));
	} else if(item.shortDescription) {
		const label = document.createElement('strong');
		label.textContent = 'Details: ';
		extraEl.replaceChildren(label, document.createTextNode(item.shortDescription));
	} else {
		extraEl.innerHTML = '';
	}
	addBtn.onclick = () => {
		addToCart(item.id || itemId);
		modal.classList.add('hidden');
		modal.setAttribute('aria-hidden', 'true');
	};
	thumbs.innerHTML = imageUrls.map((url, index) => {
		const thumbnail = getCloudinaryImageUrl(url,'f_auto,q_auto:good,c_fill,g_auto,w_96,h_96');
		return `<button type="button" class="item-detail-thumb${index === activeIndex ? ' active' : ''}" data-index="${index}" aria-label="View image ${index + 1}" aria-pressed="${index === activeIndex}"><img src="${escapeHTML(thumbnail)}" alt=""></button>`;
	}).join('');
	thumbs.querySelectorAll('.item-detail-thumb').forEach((thumb) => {
		thumb.addEventListener('click', () => {
			showImage(Number(thumb.dataset.index));
		});
	});
	showImage(0);
	modal.classList.remove('hidden');
	modal.setAttribute('aria-hidden', 'false');
}

function renderMenu(){
	const categoryItems = activeCategory ? itemsData.filter(item=>String(item.category || '').trim().toLowerCase() === activeCategory.trim().toLowerCase()) : itemsData;
	const items = categoryItems.filter((item)=>{
		const text = `${item.name || ''} ${item.bnName || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
		const matchesSearch = !searchTerm || text.includes(searchTerm);
		const matchesQuick = quickFilter === 'all'
			|| (quickFilter === 'deals' && Number(item.discount || 0) > 0)
			|| (quickFilter === 'popular' && (item.popular || item.featured || item.isPopular))
			|| (quickFilter === 'new' && (item.isNew || item.new || item.newItem));
		return matchesSearch && matchesQuick;
	});
	if(menuItemCount) menuItemCount.textContent = `${items.length} ${items.length === 1 ? translations[lang].itemCountOne : translations[lang].itemCountMany}`;
	if(!items.length){
		m.textContent = '';
		const emptyMessage = document.createElement('p');
		emptyMessage.className = 'menu-empty';
		emptyMessage.textContent = translations[lang].noItems;
		m.appendChild(emptyMessage);
		return;
	}
	m.innerHTML = items.map((x,i)=>{
		const title = escapeHTML((lang==='bn' && x.bnName) ? x.bnName : x.name);
		const originalImageUrl = optimizeImageUrl((x.images && x.images[0] && x.images[0].url) ? x.images[0].url : x.image)
			|| '../assets/images/food/placeholder.svg';
		const imageUrl = getCloudinaryImageUrl(originalImageUrl,'f_auto,q_auto:good,c_fill,g_auto,w_480,h_480');
		const img = escapeHTML(imageUrl);
		const imageSrcset = escapeHTML(getMenuImageSrcset(originalImageUrl));
		const discount = Number(x.discount || 0);
		const finalPrice = discount > 0 ? Math.max(0, Number(x.price || 0) - (Number(x.price || 0) * discount) / 100) : Number(x.price || 0);
		const description = x.description ? escapeHTML(x.description) : '';
		const itemId = escapeHTML(x.id || i);
		const quantity = getCartQuantity(x);
		const imageLoading = i < 2 ? 'eager' : 'lazy';
		const imagePriority = i === 0 ? ' fetchpriority="high"' : '';
		const actions = quantity
			? `<div class="card-quantity-controls" aria-label="${title} quantity"><button type="button" data-cart-delta="-1" data-item-id="${itemId}" aria-label="${translations[lang].decrease} ${title}">−</button><span aria-live="polite">${quantity}</span><button type="button" data-cart-delta="1" data-item-id="${itemId}" aria-label="${translations[lang].increase} ${title}">+</button></div>`
			: `<button type="button" class="add-to-cart-btn" data-item-id="${itemId}" aria-label="${translations[lang].add} ${title}">+ ${translations[lang].add}</button>`;
		return `<article class="food-card"><button type="button" class="food-card-media item-detail-trigger" data-item-id="${itemId}" aria-label="View details for ${title}"><img src="${img}"${imageSrcset ? ` srcset="${imageSrcset}" sizes="120px"` : ''} alt="${title}" loading="${imageLoading}"${imagePriority} decoding="async"></button><div class="food-card-body"><h3>${title}</h3>${description ? `<p class="food-description">${description}</p>` : ''}<div class="food-price-row"><span class="food-price">${translations[lang].pricePrefix}${finalPrice}</span>${discount > 0 ? `<span class="food-discount">-${discount}%</span>` : ''}</div><div class="food-card-actions">${actions}</div></div></article>`;
	}).join('');

	m.querySelectorAll('.item-detail-trigger').forEach((button) => {
		button.addEventListener('click', () => openItemDetailModal(button.dataset.itemId));
	});
	m.querySelectorAll('.add-to-cart-btn').forEach((button) => {
		button.addEventListener('click', () => addToCart(button.dataset.itemId));
	});
	m.querySelectorAll('[data-cart-delta]').forEach((button) => {
		button.addEventListener('click', () => adjustCartQuantity(button.dataset.itemId,Number(button.dataset.cartDelta)));
	});
}

function setQuickFilter(value){
	quickFilter = value;
	document.querySelectorAll('[data-quick-filter]').forEach((button)=>{
		const active = button.dataset.quickFilter === value;
		button.classList.toggle('active', active);
		button.setAttribute('aria-pressed', String(active));
	});
	renderMenu();
}

window.addToCart = (key) => {
	const cart = readCart();
	let item = null;
	if(typeof key === 'string') item = itemsData.find(it=>it.id===key) || itemsData[Number(key)];
	else item = itemsData[key];
	if(!item) return alert('Item not found');
	const existing = cart.find(entry=>matchesCartItem(entry,item));
	if(existing) existing.quantity = (Number(existing.quantity) || 1) + 1;
	else cart.push({...item, quantity: 1});
	localStorage.setItem('cart', JSON.stringify(cart));
	updateCartCount();
	renderMenu();
};

function applyLang(){
	const brandTitle = document.getElementById('restaurantName');
	const pageTitle = document.getElementById('page-title');
	const categoriesTitle = document.getElementById('categories-title');
	const confirmLabel = document.getElementById('confirm-order-label');
	const stickyCartAction = document.getElementById('sticky-cart-action');

	if(brandTitle){
		brandTitle.textContent = localStorage.getItem('restaurantName') || 'Your Business';
	}
	if(pageTitle){
		pageTitle.innerText = translations[lang].title || pageTitle.innerText;
	}
	if(quickNav){
		quickNav.setAttribute('aria-label', translations[lang].quickNav);
		quickNav.querySelectorAll('[data-quick-label]').forEach(label=>{
			label.textContent = translations[lang][label.dataset.quickLabel] || label.textContent;
		});
	}
	if(categoriesTitle) categoriesTitle.innerText = translations[lang].categories;
	if(confirmLabel) confirmLabel.innerText = translations[lang].viewCart;
	if(stickyCartAction) stickyCartAction.textContent = `${translations[lang].viewCart} →`;
	if(menuSearch) menuSearch.placeholder = lang === 'bn' ? 'আইটেম খুঁজুন...' : 'Search items...';
	renderCategories();
	renderMenu();
}

function updateCartCount(){
	try{
		const cart = readCart();
		const badge = document.getElementById('cart-count');
		const bottomBadge = document.getElementById('bottom-cart-count');
		const count = cart.reduce((total,item)=>total + (Number(item.quantity) || 1),0);
		const subtotal = cart.reduce((total,item)=>{
			const price = Number(item.price) || 0;
			const discount = Number(item.discount) || 0;
			const finalPrice = discount > 0 ? Math.max(0,price - price * discount / 100) : price;
			return total + finalPrice * (Number(item.quantity) || 1);
		},0);
		if(badge) badge.innerText = String(count);
		if(bottomBadge){ bottomBadge.innerText = String(count); bottomBadge.hidden = count === 0; }
		if(confirmOrder){
			confirmOrder.hidden = count === 0;
			const formattedSubtotal = subtotal.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-BD',{maximumFractionDigits:2});
			confirmOrder.setAttribute('aria-label', `${translations[lang].viewCart}: ${count} ${count === 1 ? translations[lang].item : translations[lang].items}, ${translations[lang].pricePrefix}${formattedSubtotal}`);
			const confirmCount = document.getElementById('confirm-order-count');
			if(confirmCount) confirmCount.textContent = String(count);
			const confirmItems = document.getElementById('confirm-order-items');
			if(confirmItems) confirmItems.textContent = count === 1 ? translations[lang].item : translations[lang].items;
			const confirmTotal = document.getElementById('confirm-order-total');
			if(confirmTotal) confirmTotal.textContent = `${translations[lang].pricePrefix}${formattedSubtotal}`;
		}
		document.body.classList.toggle('has-cart-items', count > 0);
	}catch(e){ }
}

// update cart badge now
updateCartCount();

langToggle && langToggle.addEventListener('click', ()=>{
	lang = (lang === 'en') ? 'bn' : 'en';
	localStorage.setItem('lang', lang);
	updateLangToggleState();
	applyLang();
	updateCartCount();
});

themeToggle && themeToggle.addEventListener('click', ()=>{
	const nextTheme = localStorage.getItem('siteTheme') === 'theme-dark' ? 'theme-teal' : 'theme-dark';
	localStorage.setItem('siteTheme', nextTheme);
	applyTheme(nextTheme);
	updateThemeToggleState();
});

document.querySelectorAll('[data-quick-filter]').forEach((button)=>{
	button.addEventListener('click',()=>setQuickFilter(button.dataset.quickFilter || 'all'));
});

searchToggle && searchToggle.addEventListener('click',()=>{
	const open = searchPanel ? searchPanel.hidden : true;
	if(searchPanel) searchPanel.hidden = !open;
	searchToggle.setAttribute('aria-expanded', String(open));
	if(open && menuSearch) menuSearch.focus();
});

menuSearch && menuSearch.addEventListener('input',()=>{
	searchTerm = menuSearch.value.trim().toLowerCase();
	renderMenu();
});

// Init
updateLangToggleState();
updateThemeToggleState();
applyLang();

// WhatsApp floating button
function attachWhatsApp(number){
	if(!number) return;
	const container = document.getElementById('whatsapp-fab');
	if(!container) return;
	container.innerHTML = '';
	const a = document.createElement('a');
	a.href = `https://wa.me/${number.replace(/\D/g,'')}`;
	a.target = '_blank';
	a.rel = 'noopener';
	a.className = 'whatsapp-fab-link';
	a.setAttribute('aria-label',`Chat with ${localStorage.getItem('restaurantName') || 'the business'} on WhatsApp`);
	a.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L4 20l1.1-3.7A8.5 8.5 0 1 1 20.5 11.5Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 8.4c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.2.1.4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1 1.3 1.8 1.7.2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.6-.1l1.5.7c.3.1.4.3.4.5 0 .4-.2 1-.6 1.3-.4.4-1.1.6-1.7.5-1-.2-2.2-.8-3.3-1.8-1-.9-1.7-2.1-1.9-3-.2-.8.1-1.6.5-2Z" fill="currentColor"/></svg><span>Chat with us</span>`;
	container.appendChild(a);
}
