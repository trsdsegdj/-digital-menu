const restaurantName = localStorage.getItem('restaurantName') || '';
const logoUrl = localStorage.getItem('siteLogoUrl') || '';
const topbarColor = localStorage.getItem('topbarColor') || '';
const buttonColor = localStorage.getItem('buttonColor') || '';
const validColor = value=>/^#[0-9a-fA-F]{6}$/.test(value);

if(validColor(topbarColor)) document.documentElement.style.setProperty('--topbar-color',topbarColor);
if(validColor(buttonColor)) document.documentElement.style.setProperty('--button-color',buttonColor);
if(['theme-teal','theme-dark','theme-pastel'].includes(localStorage.getItem('siteTheme'))){
	document.documentElement.classList.add(localStorage.getItem('siteTheme'));
}

window.initialRestaurantBranding = {restaurantName,logoUrl};
if(restaurantName) document.title = `${restaurantName} Catalog`;
