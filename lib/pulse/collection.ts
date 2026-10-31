/**
 * Browser bootstrap for the site-specific script. Automatic pageviews are
 * the sole producer; there is deliberately no manual pageview call.
 * ADR 0011 holds installation off until the supplied script applies this
 * documented transform to engagement as well as ordinary events.
 */
export function plausibleBootstrap(paths: readonly string[]): string {
  // Values are exact public route paths; escape script delimiters anyway.
  const allowed = JSON.stringify(paths).replace(/</g, "\\u003c");
  return `(function(){
var paths=${allowed};
window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)};
window.plausible.init=window.plausible.init||function(i){window.plausible.o=i||{}};
window.plausible.init({outboundLinks:false,fileDownloads:false,formSubmissions:false,captureOnLocalhost:false,autoCapturePageviews:true,logging:false,
transformRequest:function(p){
if(p.n!=="pageview")return null;
try{
var u=new URL(p.u),r=null;
if(u.origin!==location.origin||paths.indexOf(u.pathname)===-1)return null;
u.search="";u.hash="";
if(p.r){var ref=new URL(p.r);if((ref.protocol==="https:"||ref.protocol==="http:")&&ref.origin!==location.origin)r=ref.origin;}
return {n:"pageview",u:u.href,d:p.d,v:p.v,r:r};
}catch(e){return null;}
}});
})();`;
}
