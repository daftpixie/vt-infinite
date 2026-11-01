// Offline evidence only: fetch is a sandbox substitute, never a production request.
// No argument: verify the shipped Events API collector. Optional local script: compare vendor route behavior.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createPageviewCollector, sendPageview } from '../lib/pulse/collection.ts';

if (!process.argv[2]) {
  const requests = [];
  const collector = createPageviewCollector({ domain: 'synthetic.example', origin: 'https://synthetic.example', paths: ['/', '/privacy', '/words'], send: (event) => {
    void sendPageview(event, async (_url, init) => { requests.push({ event: JSON.parse(init.body), credentials: init.credentials, referrerPolicy: init.referrerPolicy }); return new Response(null, { status: 202 }); });
  } });
  const visit = (path, visible = true) => collector.visit({ url: `https://synthetic.example${path}`, referrer: 'https://ref.example/private?campaign=private#private', visible, blocked: false });
  for (const path of ['/?campaign=private#one', '/?other=private#two', '/privacy', '/admin?private', '/privacy', '/words', '/privacy', '/words']) visit(path);
  visit('/words', false); visit('/words'); // Visibility, scroll, blur and rerenders add no event.
  collector.restored(); visit('/words'); visit('/words');
  const safe = requests.length === 7 && requests.every(({ event, credentials, referrerPolicy }) => event.name === 'pageview' && !new URL(event.url).search && !new URL(event.url).hash && !new URL(event.referrer).search && new URL(event.referrer).pathname === '/' && !new URL(event.url).pathname.startsWith('/admin') && Object.keys(event).sort().join(',') === 'domain,name,referrer,url' && credentials === 'omit' && referrerPolicy === 'no-referrer');
  console.log(JSON.stringify({ scope: 'offline intercepted Events API', eventTypes: [...new Set(requests.map((r) => r.event.name))], fieldNames: [...new Set(requests.flatMap((r) => Object.keys(r.event)))].sort(), initialAndNavigationEvents: requests.length, expected: 7, privacyContract: safe ? 'pass' : 'fail' }, null, 2));
  process.exit(safe ? 0 : 1);
}

const source = readFileSync(process.argv[2], 'utf8');
const requests = [], listeners = new Map();
let now = 1000, focused = true, phase = 'initial';
const location = new URL('https://synthetic.example/?campaign=private#private');
const on = (name, callback) => listeners.set(name, [...(listeners.get(name) ?? []), callback]);
const context = {
  location, URL, navigator: {}, innerHeight: 800, scrollY: 0, localStorage: {},
  Date: class extends Date { static now() { return now; } }, ResizeObserver: class { observe() {} },
  document: { referrer: 'https://ref.example/private?campaign=private#private', visibilityState: 'visible', hasFocus: () => focused, body: { scrollHeight: 1600, offsetHeight: 1600, clientHeight: 800 }, documentElement: { scrollHeight: 1600, offsetHeight: 1600, clientHeight: 800 }, addEventListener: on },
  addEventListener: on,
  history: { pushState(_a, _b, path) { location.href = new URL(path, location).href; }, replaceState(_a, _b, path) { location.href = new URL(path, location).href; } },
  fetch: async (_url, init) => { requests.push({ phase, event: JSON.parse(init.body) }); return { status: 202 }; },
};
context.window = context;
const sandbox = vm.createContext(context);
// The previously proposed documented init/transform; no modification to the supplied vendor bytes.
vm.runInContext(`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};
plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init({outboundLinks:false,fileDownloads:false,formSubmissions:false,captureOnLocalhost:false,autoCapturePageviews:true,logging:false,transformRequest:function(p){
if(p.n!=='pageview')return null;try{var u=new URL(p.u);if(u.origin!==location.origin||!['/','/privacy'].includes(u.pathname))return null;u.search='';u.hash='';var ref=new URL(p.r||location.origin);return {n:'pageview',u:u.href,d:p.d,v:p.v,r:ref.origin===location.origin?null:ref.origin};}catch(e){return null;}}});`, sandbox);
vm.runInContext(source, sandbox, { timeout: 1000 });
phase = 'private replace, scroll and blur';
context.history.replaceState(null, '', '/admin?private#private'); context.scrollY = 600;
for (const callback of listeners.get('scroll') ?? []) callback({});
now += 5000; focused = false;
for (const callback of listeners.get('blur') ?? []) callback({});
const privateEvents = requests.filter((r) => r.phase !== 'initial');
console.log(JSON.stringify({ scope: 'offline vendor comparison', eventTypes: [...new Set(requests.map((r) => r.event.n))], fieldNames: [...new Set(requests.flatMap((r) => Object.keys(r.event)))].sort(), privateContextEmissions: privateEvents.length, routeExclusion: privateEvents.length ? 'fail' : 'scenario passed; full contract unverified' }, null, 2));
process.exit(privateEvents.length ? 1 : 2);
