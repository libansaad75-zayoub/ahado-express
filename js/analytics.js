// Analytics Plausible : fonctionne seulement si le script Plausible est ajouté côté Netlify/site
export function trackEvent(name, props={}){
  if(window.plausible){window.plausible(name,{props});}
}
export function bindTrackedLinks(){
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-track]');
    if(target) trackEvent(target.dataset.track,{href:target.href || ''});
  });
}
