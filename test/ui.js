// Panel behaviour: drives the real webview script inside a DOM shim and asserts the
// markup, the toggles and the host messages stay in step.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'src', 'webview.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('no <script> block found in ' + HTML_PATH); process.exit(1); }
const code = scriptMatch[1];

class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  toggle(c, force) {
    const want = force === undefined ? !this.set.has(c) : Boolean(force);
    if (want) this.set.add(c); else this.set.delete(c);
    return want;
  }
  contains(c) { return this.set.has(c); }
}
class TextNode {
  constructor(t) { this._text = String(t); }
  get textContent() { return this._text; }
}
class El {
  constructor(tag, attrs = {}) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = Object.assign({}, attrs);
    this.children = [];
    this.parent = null;
    this.classList = new ClassList();
    this.style = {};
    this.listeners = {};
    this._text = '';
    this.disabled = false;
    this.title = '';
    if (attrs.class) String(attrs.class).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
  }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  get className() { return Array.from(this.classList.set).join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c); c.parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parent = null; return c; }
  replaceChildren(...cs) { this.children = []; this._text = ''; cs.forEach((c) => this.appendChild(c)); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  closest(sel) { let n = this; while (n) { if (sel === '.target-row' && n.classList.contains('target-row')) return n; n = n.parent; } return null; }
  get textContent() { return this.children.length === 0 ? this._text : this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  has(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  click() { (this.listeners.click || []).forEach((f) => f({})); }
}

const byId = {};
const mk = (id) => { const e = new El('div', { id }); byId[id] = e; return e; };
['userId', 'extensionVersion', 'alertBanner', 'alertMessage', 'alertIconSvg', 'alertCloseBtn', 'btnSync',
  'btnReset', 'refreshBtn', 'saveOverlay', 'overlayText', 'bypassV1Opt', 'bypassV2Opt', 'bypassV3Opt',
  'selectedProfileLabel', 'toggleAllBtn', 'targetSummary', 'btnSyncLabel',
  'statGemini', 'statKiro', 'statClaude', 'copyUserIdBtn'].forEach(mk);

const toggles = [];
const names = [];
['gemini', 'kiro', 'claude'].forEach((key) => {
  const row = new El('div', { class: 'target-row', 'data-target': key });
  const toggle = new El('button', { class: 'toggle', 'data-toggle': key });
  toggle.setAttribute('aria-checked', 'true');
  row.appendChild(toggle);
  const info = new El('div', { class: 'target-info' });
  const name = new El('div', { class: 'target-name' });
  info.appendChild(name);
  row.appendChild(info);
  toggles.push(toggle);
  names.push(name);
});

const document = {
  getElementById: (id) => byId[id] || null,
  querySelectorAll: (sel) => (sel === '.toggle[data-toggle]' ? toggles : sel === '.target-row .target-name' ? names : []),
  createElement: (tag) => new El(tag),
  createElementNS: (_ns, tag) => new El(tag),
  createTextNode: (t) => new TextNode(t),
  body: new El('body')
};

const posted = [];
let state;
const vscode = { postMessage: (m) => posted.push(m), getState: () => state, setState: (s) => { state = s; } };
let messageHandler = null;
const sandbox = {
  document,
  window: { addEventListener: (t, f) => { if (t === 'message') messageHandler = f; } },
  console, setTimeout, clearTimeout, navigator: {}, acquireVsCodeApi: () => vscode
};
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: 'webview.js' });
} catch (err) {
  console.error('the panel script threw during load: ' + err.message);
  process.exit(1);
}

const fromHost = (msg) => messageHandler({ data: msg });
let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};
const last = () => posted[posted.length - 1];

console.log('1. static markup is truthful and self-contained');
check('licence badge matches package.json', html.includes('MIT · Miễn phí'));
check('no unsupported "Free Active" badge', !html.includes('Free Active'));
check('version value element exists', html.includes('id="extensionVersion"'));
check('three profile options exist', ['bypassV1Opt', 'bypassV2Opt', 'bypassV3Opt'].every((id) => html.includes(id)));
check('no external stylesheet is loaded', !/(?:src|href)\s*=\s*["']https?:\/\//i.test(html));
check('fonts come from the editor', html.includes('--vscode-font-family') && html.includes('--vscode-editor-font-family'));

console.log('\n2. toggles drive the message payload');
fromHost({ command: 'load', deviceId: 'abc123', version: '1.3.0', bypassType: 'V1', stats: {} });
check('version rendered from the host', byId.extensionVersion.textContent === '1.3.0');
check('all three environments on', toggles.every((t) => t.getAttribute('aria-checked') === 'true'));
posted.length = 0;
toggles[1].click();
check('kiro dimmed', toggles[1].closest('.target-row').classList.contains('off'));
check('summary reflects 2/3', byId.targetSummary.textContent === 'Đang chọn 2/3');
byId.btnSync.click();
check('posts only the enabled environments',
  last().command === 'activateSync' && JSON.stringify(last().targets) === JSON.stringify(['gemini', 'claude']));

console.log('\n3. the banner shows the host wording, not its own');
const syncNotice = 'Đồng bộ thành công cho: Antigravity, Claude Code. Hãy mở phiên Claude Code mới để áp dụng Output Style Luna.';
fromHost({
  command: 'syncResponse', success: true, notice: syncNotice, targets: ['gemini', 'claude'],
  stats: { gemini: { exists: true }, kiro: { exists: false }, claude: { exists: true } }
});
check('sync banner is exactly the notice', byId.alertMessage.textContent === syncNotice, byId.alertMessage.textContent);
check('sync banner is a success banner', byId.alertBanner.className.includes('success'));
check('overlay closed', byId.saveOverlay.classList.contains('active') === false);
check('stats applied to badges', byId.statGemini.textContent === 'Đã đồng bộ' && byId.statKiro.textContent === 'Chưa kích hoạt');

const resetNotice = 'Đã gỡ bỏ cấu hình Bypass cho: Kiro. Đã khôi phục nội dung gốc của: Kiro.';
fromHost({ command: 'resetResponse', success: true, notice: resetNotice, targets: ['kiro'], stats: {} });
check('reset banner is exactly the notice', byId.alertMessage.textContent === resetNotice, byId.alertMessage.textContent);

const failNotice = 'Kích hoạt thất bại: Không tìm thấy file cấu hình bypass V1.';
fromHost({ command: 'syncResponse', success: false, notice: failNotice });
check('failure banner is exactly the notice', byId.alertMessage.textContent === failNotice);
check('failure banner is an error banner', byId.alertBanner.className.includes('error'));

fromHost({ command: 'bypassTypeSaveResponse', success: true, notice: 'Đã lưu cấu hình Bypass V2 thành công!' });
check('profile-change banner is the notice', byId.alertMessage.textContent === 'Đã lưu cấu hình Bypass V2 thành công!');

console.log('\n4. the removed syncStatus message has no effect');
byId.overlayText.textContent = 'Đang đồng bộ 2 môi trường...';
fromHost({ command: 'syncStatus', status: 'download' });
check('overlay text not overwritten', byId.overlayText.textContent === 'Đang đồng bộ 2 môi trường...', byId.overlayText.textContent);

console.log('\n5. progress text still names the count');
posted.length = 0;
byId.btnSync.click();
check('overlay names the count', byId.overlayText.textContent === 'Đang đồng bộ 2 môi trường...', byId.overlayText.textContent);
fromHost({ command: 'syncResponse', success: true, notice: 'ok', targets: ['gemini', 'claude'], stats: {} });
byId.btnReset.click();
check('remove overlay names the count', byId.overlayText.textContent === 'Đang gỡ bỏ 2 môi trường...');
check('remove posts the same selection', last().command === 'resetBypass' && JSON.stringify(last().targets) === JSON.stringify(['gemini', 'claude']));

console.log('\n6. nothing selected blocks both actions');
byId.toggleAllBtn.click();
byId.toggleAllBtn.click();
check('summary reports nothing selected', byId.targetSummary.textContent === 'Chưa chọn môi trường nào');
check('both buttons disabled', byId.btnSync.disabled === true && byId.btnReset.disabled === true);
posted.length = 0;
byId.btnSync.click();
byId.btnReset.click();
check('disabled buttons post nothing', posted.length === 0);

console.log('\n7. a recreated panel restores the host selection');
fromHost({ command: 'load', deviceId: 'abc123', version: '1.3.0', bypassType: 'V3', targets: ['kiro'], stats: {} });
check('only kiro on', toggles[1].getAttribute('aria-checked') === 'true' && toggles[0].getAttribute('aria-checked') === 'false');
check('profile label follows the host', byId.selectedProfileLabel.textContent === 'Bypass V3');

console.log('\n8. a message the panel does not know is ignored');
const before = byId.alertMessage.textContent;
fromHost({ command: 'somethingElse', payload: 1 });
check('panel survives an unknown message', byId.alertMessage.textContent === before);

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
