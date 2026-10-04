// Restaurant/table URL helpers.
export function getUrlParams(){
  const p=new URLSearchParams(location.search);
  return {restaurantId:p.get('restaurant')||'demo',tableId:p.get('table')||''};
}
