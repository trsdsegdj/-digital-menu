const navigationItems = [
	['Dashboard', 'dashboard.html'],
	['Categories', 'categories.html'],
	['Catalog Items', 'items.html'],
	['Tables', 'tables.html'],
	['WhatsApp', 'whatsapp.html'],
	['Settings', 'settings.html']
];

export function initializeAdminLayout(){
	const currentPage = window.location.pathname.split('/').pop() || 'index.html';
	if(currentPage === 'login.html' || currentPage === 'index.html') return;

	const main = document.querySelector('body > main');
	if(!main) return;

	let sidebar = document.querySelector('body > aside');
	if(!sidebar){
		sidebar = document.createElement('aside');
		sidebar.innerHTML = '<h2>Business Admin</h2><nav></nav>';
		document.body.insertBefore(sidebar,main);
	}
	sidebar.classList.add('admin-sidebar');
	sidebar.id = 'admin-navigation';
	sidebar.setAttribute('aria-label','Admin navigation');

	let navigation = sidebar.querySelector('nav');
	if(!navigation){
		navigation = document.createElement('nav');
		sidebar.appendChild(navigation);
	}
	navigation.setAttribute('aria-label','Admin sections');
	navigation.querySelectorAll('a[href="orders.html"]').forEach(link=>link.remove());
	if(!navigation.querySelector('a')){
		navigationItems.forEach(([label,href])=>{
			const link = document.createElement('a');
			link.href = href;
			link.textContent = label;
			navigation.appendChild(link);
		});
	}
	if(!navigation.querySelector('a[href="admins.html"]')){
		const accountsLink = document.createElement('a');
		accountsLink.href = 'admins.html';
		accountsLink.textContent = 'Admin Accounts';
		navigation.appendChild(accountsLink);
	}
	navigation.querySelectorAll('a').forEach(link=>{
		if(link.getAttribute('href') === 'tables.html') link.textContent = 'Tables';
		const active = link.getAttribute('href') === currentPage;
		link.classList.toggle('active',active);
		if(active) link.setAttribute('aria-current','page');
		else link.removeAttribute('aria-current');
	});

	const pageHeading = main.querySelector('h1')?.textContent.trim() || document.title;
	const topbar = document.createElement('header');
	topbar.className = 'admin-topbar';
	topbar.innerHTML = `
		<button class="admin-menu-toggle" type="button" aria-controls="admin-navigation" aria-expanded="true" aria-label="Close navigation">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
			<span>Menu</span>
		</button>
		<div class="admin-topbar-heading">
			<a href="dashboard.html" class="admin-topbar-brand">Your Business</a>
			<span>${pageHeading}</span>
		</div>
		<a class="admin-store-link" href="../customer/index.html">View customer catalog <span aria-hidden="true">&#8599;</span></a>
	`;
	const brandLink = topbar.querySelector('.admin-topbar-brand');
	const sidebarBrand = sidebar.querySelector('h2');
	const updateRestaurantBrand = name=>{
		const brand = String(name || localStorage.getItem('restaurantName') || 'Your Business').trim() || 'Your Business';
		brandLink.textContent = brand;
		if(sidebarBrand) sidebarBrand.textContent = brand;
	};
	updateRestaurantBrand();
	document.addEventListener('restaurant-name-updated',event=>updateRestaurantBrand(event.detail));
	window.addEventListener('storage',event=>{
		if(event.key === 'restaurantName') updateRestaurantBrand(event.newValue);
	});
	document.body.insertBefore(topbar,document.body.firstChild);

	const backdrop = document.createElement('button');
	backdrop.className = 'admin-menu-backdrop';
	backdrop.type = 'button';
	backdrop.setAttribute('aria-label','Close admin navigation');
	document.body.appendChild(backdrop);

	const toggle = topbar.querySelector('.admin-menu-toggle');
	const compactLayout = window.matchMedia('(max-width: 900px)');
	const syncToggleState = ()=>{
		const expanded = compactLayout.matches
			? document.body.classList.contains('admin-menu-open')
			: !document.body.classList.contains('admin-sidebar-collapsed');
		toggle.setAttribute('aria-expanded',String(expanded));
		toggle.setAttribute('aria-label',expanded ? 'Close navigation' : 'Open navigation');
		sidebar.setAttribute('aria-hidden',String(!expanded));
		sidebar.toggleAttribute('inert',!expanded);
	};
	const closeMenu = ()=>{
		document.body.classList.remove('admin-menu-open');
		syncToggleState();
		toggle.focus();
	};

	toggle.addEventListener('click',()=>{
		if(compactLayout.matches){
			document.body.classList.toggle('admin-menu-open');
		}else{
			document.body.classList.toggle('admin-sidebar-collapsed');
		}
		syncToggleState();
		if(compactLayout.matches && document.body.classList.contains('admin-menu-open')) navigation.querySelector('a')?.focus();
	});
	backdrop.addEventListener('click',closeMenu);
	navigation.addEventListener('click',event=>{
		if(event.target.closest('a')) closeMenu();
	});
	document.addEventListener('keydown',event=>{
		if(event.key === 'Escape' && document.body.classList.contains('admin-menu-open')) closeMenu();
	});
	compactLayout.addEventListener('change',()=>{
		document.body.classList.remove('admin-menu-open','admin-sidebar-collapsed');
		syncToggleState();
	});
	syncToggleState();
}