// Offline contract probe. Supply a separately downloaded script; no network is possible in the sandbox.
// Usage: node tests/check-plausible-script.mjs /absolute/path/to/script.js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('Supply a local copy of the configured public script.');
const events = [];
const listeners = new Map();
let now = 0;
let focused = true;
const location = { href: 'https://synthetic.example/', hostname: 'synthetic.example', protocol: 'https:', origin: 'https://synthetic.example', pathname: '/' };
const add = (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]);
const context = {
  location, URL, navigator: {}, innerHeight: 800, scrollY: 0,
  Date: class extends Date { static now() { return now; } },
  ResizeObserver: class { observe() {} },
  localStorage: {},
  document: {
    referrer: '', visibilityState: 'visible', hasFocus: () => focused,
    body: { scrollHeight: 1600, offsetHeight: 1600, clientHeight: 800 },
    documentElement: { scrollHeight: 1600, offsetHeight: 1600, clientHeight: 800 },
    addEventListener: add,
  },
  addEventListener: add,
  history: { pushState(_a, _b, path) { location.pathname = path; location.href = `${location.origin}${path}`; } },
  fetch: async (_url, init) => { events.push(JSON.parse(init.body)); return { status: 202 }; },
};
context.window = context;
const sandbox = vm.createContext(context);
// Exercise the same queued init and documented options as the app, without exporting any configuration.
vm.runInContext(`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};
plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init({outboundLinks:false,fileDownloads:false,formSubmissions:false,captureOnLocalhost:false,autoCapturePageviews:true,logging:false,
transformRequest:function(p){return p.n==='pageview' && ['/', '/privacy'].includes(new URL(p.u).pathname) ? p : null}});`, sandbox);
vm.runInContext(readFileSync(file, 'utf8'), sandbox, { timeout: 1000 });
context.history.pushState(null, '', '/privacy');
context.history.pushState(null, '', '/privacy');
context.history.pushState(null, '', '/admin');
context.history.pushState(null, '', '/');
now = 4000; focused = false;
for (const fn of listeners.get('blur') ?? []) fn();
const views = events.filter((e) => e.n === 'pageview');
const unexpected = [...new Set(events.filter((e) => e.n !== 'pageview').map((e) => e.n))];
console.log(`Initial + eligible navigation pageviews: ${views.length} (expected 3).`);
console.log(`Private route pageviews: ${views.filter((e) => new URL(e.u).pathname === '/admin').length} (expected 0).`);
console.log(`Unexpected event types: ${unexpected.join(', ') || 'none'}.`);
// Never output payloads, domains, provider identifiers or credential values.
process.exit(views.length === 3 && unexpected.length === 0 ? 0 : 1);
