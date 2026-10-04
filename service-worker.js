const CACHE_VERSION = 'restaurant-menu-v4';
const APP_CACHE = `${CACHE_VERSION}-app`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

self.addEventListener('install',event=>{
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
	event.waitUntil(
		caches.keys()
			.then(keys=>Promise.all(keys
				.filter(key=>key.startsWith('restaurant-menu-') && key !== APP_CACHE && key !== ASSET_CACHE)
				.map(key=>caches.delete(key))))
			.then(()=>self.clients.claim())
	);
});

async function networkFirst(request,cacheName){
	const cache = await caches.open(cacheName);
	try{
		const response = await fetch(request);
		if(response.ok) await cache.put(request,response.clone());
		return response;
	}catch(error){
		const cached = await cache.match(request);
		if(cached) return cached;
		throw error;
	}
}

async function staleWhileRevalidate(request){
	const cache = await caches.open(ASSET_CACHE);
	const cached = await cache.match(request);
	const network = fetch(request).then(response=>{
		if(response.ok) cache.put(request,response.clone());
		return response;
	});
	if(cached){
		void network.catch(error=>console.warn('Asset cache refresh failed:',error));
		return cached;
	}
	return network;
}

self.addEventListener('fetch',event=>{
	const request = event.request;
	if(request.method !== 'GET') return;

	const url = new URL(request.url);
	if(url.origin !== self.location.origin) return;

	if(url.pathname === '/api/config' || url.pathname === '/shared/firebase-config.js'){
		event.respondWith(networkFirst(request,APP_CACHE));
		return;
	}

	if(request.mode === 'navigate'){
		event.respondWith(networkFirst(request,APP_CACHE).catch(async error=>{
			const cached = await caches.match(request,{cacheName:APP_CACHE});
			if(cached) return cached;
			const fallback = await caches.match('/',{cacheName:APP_CACHE});
			if(fallback) return fallback;
			throw error;
		}));
		return;
	}

	if(['style','script','image','font'].includes(request.destination)){
		event.respondWith(staleWhileRevalidate(request));
	}
});
