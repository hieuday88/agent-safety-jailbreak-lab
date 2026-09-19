// Host behaviour: target scoping, `.lunabak` backup and restore, upgrade migration,
// notice wording shared with the editor notification, and non-destructive
// deactivation. Runs the compiled extension against a throwaway home directory.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'out', 'extension.js');
const HOME = path.join(os.tmpdir(), 'luna-behaviour-home');

assert.ok(fs.existsSync(EXT), 'out/extension.js is missing — run `npm run compile` first');

fs.rmSync(HOME, { recursive: true, force: true });
fs.mkdirSync(HOME, { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;
delete process.env.CLAUDE_CONFIG_DIR;

const GEMINI = path.join(HOME, '.gemini', 'GEMINI.md');
const GEMINI_BAK = GEMINI + '.lunabak';
const KIRO = path.join(HOME, '.kiro', 'steering', 'agents.md');
const KIRO_BAK = KIRO + '.lunabak';
const LUNA_STYLE = path.join(HOME, '.claude', 'output-styles', 'luna.md');
const LUNA_BAK = LUNA_STYLE + '.lunabak';
const OLD_STYLE = path.join(HOME, '.claude', 'output-styles', 'onlytris.md');
const OLD_RULE = path.join(HOME, '.claude', 'rules', 'onlytris.md');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const PKG = path.join(ROOT, 'package.json');

fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
fs.writeFileSync(SETTINGS, JSON.stringify({ outputStyle: 'Explanatory', theme: 'dark' }, null, 2) + '\n');

let messageHandler = null;
const posted = [];
const notifications = [];
const store = new Map();

const vscodeStub = {
  window: {
    registerWebviewViewProvider: () => ({ dispose() {} }),
    showInformationMessage: (m) => { notifications.push({ level: 'info', message: m }); return Promise.resolve(); },
    showErrorMessage: (m) => { notifications.push({ level: 'error', message: m }); return Promise.resolve(); }
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: () => Promise.resolve() },
  Uri: { file: (p) => ({ fsPath: p }) }
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'vscode') return vscodeStub;
  return originalLoad.apply(this, arguments);
};

const ext = require(EXT);
const context = {
  extensionUri: { fsPath: ROOT },
  globalState: { get: (k) => store.get(k), update: async (k, v) => { store.set(k, v); } },
  subscriptions: []
};

let capturedProvider = null;
vscodeStub.window.registerWebviewViewProvider = (_t, provider) => { capturedProvider = provider; return { dispose() {} }; };
ext.activate(context);
assert.ok(capturedProvider, 'provider was not registered');

capturedProvider.resolveWebviewView({
  webview: {
    options: {}, html: '',
    postMessage: (m) => { posted.push(m); return Promise.resolve(true); },
    onDidReceiveMessage: (h) => { messageHandler = h; return { dispose() {} }; }
  }
}, {}, {});

const send = async (msg) => {
  posted.length = 0;
  notifications.length = 0;
  await messageHandler(msg);
  await new Promise((r) => setTimeout(r, 50));
  return { posted: posted.slice(), notifications: notifications.slice() };
};
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const settings = () => JSON.parse(read(SETTINGS));
const pkgVersion = JSON.parse(read(PKG)).version;

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { failures++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

(async () => {
  console.log('home: ' + HOME + '\n');

  console.log('1. reset never deletes content it did not write');
  fs.mkdirSync(path.dirname(KIRO), { recursive: true });
  fs.writeFileSync(KIRO, 'user owned kiro steering\n');
  await send({ command: 'resetBypass', targets: ['kiro'] });
  check('foreign kiro file left untouched', exists(KIRO) && read(KIRO) === 'user owned kiro steering\n');
  check('no sidecar invented', !exists(KIRO_BAK));

  console.log('\n2. sync saves the file it is about to overwrite');
  fs.mkdirSync(path.dirname(GEMINI), { recursive: true });
  fs.writeFileSync(GEMINI, 'user owned gemini instructions\n');
  await send({ command: 'activateSync', targets: ['gemini'] });
  check('profile written', read(GEMINI).length > 1000);
  check('original saved to a .lunabak sidecar', exists(GEMINI_BAK));
  check('sidecar holds the original', read(GEMINI_BAK) === 'user owned gemini instructions\n');

  console.log('\n3. a second sync does not overwrite the saved original');
  await send({ command: 'activateSync', targets: ['gemini'] });
  check('sidecar still holds the original', read(GEMINI_BAK) === 'user owned gemini instructions\n');

  console.log('\n4. reset restores the original and removes the sidecar');
  await send({ command: 'resetBypass', targets: ['gemini'] });
  check('original restored', read(GEMINI) === 'user owned gemini instructions\n');
  check('sidecar removed', !exists(GEMINI_BAK));

  console.log('\n5. no prior file means no sidecar, and reset removes our profile');
  fs.rmSync(KIRO, { force: true });
  await send({ command: 'activateSync', targets: ['kiro'] });
  check('profile written', read(KIRO).length > 1000);
  check('no sidecar when there was nothing to save', !exists(KIRO_BAK));
  const kiroNotice = (await send({ command: 'resetBypass', targets: ['kiro'] })).posted.find((m) => m.command === 'resetResponse');
  check('profile removed', !exists(KIRO));
  check('notice does not claim a restore', !/khôi phục/i.test(kiroNotice.notice), kiroNotice.notice);

  console.log('\n6. sync only touches the selected environments');
  fs.rmSync(GEMINI, { force: true });
  await send({ command: 'activateSync', targets: ['kiro'] });
  check('kiro written', exists(KIRO));
  check('gemini not created', !exists(GEMINI));
  check('luna.md not created', !exists(LUNA_STYLE));
  check('claude settings untouched', settings().outputStyle === 'Explanatory');
  await send({ command: 'resetBypass', targets: ['kiro', 'gemini'] });

  console.log('\n7. panel banner and editor notification are the same text');
  const sync = await send({ command: 'activateSync', targets: ['gemini', 'kiro'] });
  const syncMsg = sync.posted.find((m) => m.command === 'syncResponse');
  check('sync notice sent to the panel', typeof syncMsg.notice === 'string' && syncMsg.notice.length > 0);
  check('sync notification exists', sync.notifications.length === 1);
  check('sync wording identical', syncMsg.notice === sync.notifications[0].message,
    JSON.stringify([syncMsg.notice, sync.notifications[0] && sync.notifications[0].message]));
  check('sync notification is informational', sync.notifications[0].level === 'info');
  check('sync notice names both environments', syncMsg.notice.includes('Antigravity') && syncMsg.notice.includes('Kiro'));
  check('sync notice states the new-session requirement', /phiên làm việc mới/.test(syncMsg.notice), syncMsg.notice);
  check('sync notice does not single out Claude Code', !/Claude Code mới/.test(syncMsg.notice));

  const reset = await send({ command: 'resetBypass', targets: ['gemini', 'kiro'] });
  const resetNotice = reset.posted.find((m) => m.command === 'resetResponse').notice;
  check('reset wording identical', resetNotice === reset.notifications[0].message);
  check('reset notification is informational', reset.notifications[0].level === 'info');
  check('reset notice warns an open session keeps the old profile', /mở phiên mới/.test(resetNotice), resetNotice);

  // The reported failure: syncing Antigravity alone looked like it had done
  // nothing, because only a Claude Code sync mentioned starting a new session.
  const geminiOnly = await send({ command: 'activateSync', targets: ['gemini'] });
  const geminiNotice = geminiOnly.posted.find((m) => m.command === 'syncResponse').notice;
  check('a Gemini-only sync still asks for a new session', /phiên làm việc mới/.test(geminiNotice), geminiNotice);
  check('a Gemini-only sync never mentions Claude Code', !/Claude/.test(geminiNotice));
  await send({ command: 'resetBypass', targets: ['gemini', 'kiro'] });

  console.log('\n8. profile change notice matches too');
  const typeSave = await send({ command: 'saveBypassType', bypassType: 'V2' });
  const typeMsg = typeSave.posted.find((m) => m.command === 'bypassTypeSaveResponse');
  check('bypass type notice sent', typeof typeMsg.notice === 'string' && typeMsg.notice.length > 0);
  check('bypass type wording identical', typeMsg.notice === typeSave.notifications[0].message);
  await send({ command: 'saveBypassType', bypassType: 'V1' });

  console.log('\n9. a failing sync reports the failure in both places identically');
  const rulesDir = path.join(ROOT, 'resources', 'rules');
  const hiddenRules = path.join(ROOT, 'resources', 'rules-hidden');
  fs.renameSync(rulesDir, hiddenRules);
  const failed = await send({ command: 'activateSync', targets: ['gemini'] });
  const failMsg = failed.posted.find((m) => m.command === 'syncResponse');
  check('failure flagged as unsuccessful', failMsg.success === false);
  check('failure wording identical', failMsg.notice === failed.notifications[0].message);
  check('failure notification is an error', failed.notifications[0].level === 'error');
  fs.renameSync(hiddenRules, rulesDir);

  console.log('\n10. every bundled profile loads and is written verbatim');
  for (const type of ['V1', 'V2', 'V3']) {
    const bundled = read(path.join(ROOT, 'resources', 'rules', 'bypass_' + type.toLowerCase() + '.md'));
    await send({ command: 'saveBypassType', bypassType: type });
    const res = await send({ command: 'activateSync', targets: ['kiro'] });
    check('profile ' + type + ' syncs', res.posted.some((m) => m.command === 'syncResponse' && m.success));
    check('profile ' + type + ' is written verbatim', read(KIRO) === bundled);
    await send({ command: 'resetBypass', targets: ['kiro'] });
  }
  await send({ command: 'saveBypassType', bypassType: 'V1' });

  console.log('\n11. Claude Code sync/reset round trip');
  await send({ command: 'activateSync', targets: ['claude'] });
  check('luna.md written', exists(LUNA_STYLE));
  check('settings.outputStyle = Luna', settings().outputStyle === 'Luna');
  check('frontmatter name: Luna', /^name: Luna$/m.test(read(LUNA_STYLE)));
  const claudeReset = await send({ command: 'resetBypass', targets: ['claude'] });
  check('luna.md removed', !exists(LUNA_STYLE));
  check('outputStyle restored', settings().outputStyle === 'Explanatory');
  check('theme preserved', settings().theme === 'dark');
  check('no Claude sidecar left', !exists(LUNA_BAK));
  check('reset notice has no restore clause', !/khôi phục/i.test(claudeReset.posted.find((m) => m.command === 'resetResponse').notice));

  console.log('\n12. restoring a user-owned Claude style file');
  fs.mkdirSync(path.dirname(LUNA_STYLE), { recursive: true });
  fs.writeFileSync(LUNA_STYLE, '---\nname: Luna\n---\n\nmy own style\n');
  await send({ command: 'activateSync', targets: ['claude'] });
  check('user style saved to a sidecar', exists(LUNA_BAK) && read(LUNA_BAK).includes('my own style'));
  const restored = await send({ command: 'resetBypass', targets: ['claude'] });
  check('user style restored', read(LUNA_STYLE).includes('my own style'));
  check('sidecar removed', !exists(LUNA_BAK));
  check('notice reports the restore', /khôi phục/i.test(restored.posted.find((m) => m.command === 'resetResponse').notice));
  fs.rmSync(LUNA_STYLE, { force: true });

  console.log('\n13. upgrade from the pre-rename release');
  store.clear();
  fs.mkdirSync(path.dirname(OLD_RULE), { recursive: true });
  fs.writeFileSync(OLD_STYLE, '---\nname: OnlyTris\ndescription: Global OnlyTris response style\n---\n\nold\n');
  fs.writeFileSync(OLD_RULE, 'old\n');
  fs.writeFileSync(SETTINGS, JSON.stringify({ outputStyle: 'OnlyTris', theme: 'dark' }, null, 2) + '\n');
  await send({ command: 'activateSync', targets: ['claude'] });
  check('luna.md written', exists(LUNA_STYLE));
  check('outputStyle migrated to Luna', settings().outputStyle === 'Luna');
  check('legacy output-styles file removed', !exists(OLD_STYLE));
  check('legacy rules file removed', !exists(OLD_RULE));
  check('legacy file was not treated as user content', !exists(OLD_STYLE + '.lunabak'));
  await send({ command: 'resetBypass', targets: ['claude'] });
  check('outputStyle key dropped', !Object.prototype.hasOwnProperty.call(settings(), 'outputStyle'));

  console.log('\n14. selection persists and the panel reports the packaged version');
  await send({ command: 'activateSync', targets: ['gemini'] });
  const loadedMsg = (await send({ command: 'ready' })).posted.find((m) => m.command === 'load');
  check('persisted selection is gemini', JSON.stringify(loadedMsg.targets) === JSON.stringify(['gemini']));
  check('version matches package.json', loadedMsg.version === pkgVersion, loadedMsg.version + ' vs ' + pkgVersion);

  console.log('\n15. deactivate() is non-destructive');
  await send({ command: 'activateSync', targets: ['gemini', 'kiro', 'claude'] });
  check('all three present', exists(GEMINI) && exists(KIRO) && exists(LUNA_STYLE));
  const sizes = [read(GEMINI).length, read(KIRO).length, read(LUNA_STYLE).length];
  let threw = null;
  try { ext.deactivate(); } catch (e) { threw = e; }
  check('did not throw', threw === null, threw ? String(threw) : '');
  check('all three survive', exists(GEMINI) && exists(KIRO) && exists(LUNA_STYLE));
  check('contents unchanged', [read(GEMINI).length, read(KIRO).length, read(LUNA_STYLE).length].join() === sizes.join());
  check('settings unchanged', settings().outputStyle === 'Luna');

  console.log('\n16. after a reload the badges match the disk');
  const stats = (await send({ command: 'ready' })).posted.find((m) => m.command === 'load').stats;
  check('all three report as installed', stats.gemini.exists && stats.kiro.exists && stats.claude.exists);

  fs.rmSync(HOME, { recursive: true, force: true });
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => { console.error('behaviour suite error:', err); process.exit(1); });
