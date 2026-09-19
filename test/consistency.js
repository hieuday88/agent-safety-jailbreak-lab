// Cross-file consistency audit. Documentation, metadata, changelog, host and panel
// must agree with each other and with what the code actually does, and the
// repository must not contradict the environment it is checked out in.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.argv[2] || path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log('  PASS  ' + label);
  else { failures++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
}
function skip(label, why) { console.log('  SKIP  ' + label + ' (' + why + ')'); }

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const readme = read('readme.md');
const changelog = read('CHANGELOG.md');
const ext = read('src/extension.ts');
const webview = read('src/webview.html');
const vscodeignore = read('.vscodeignore');
const security = read('SECURITY.md');
const contributing = read('CONTRIBUTING.md');

console.log('== versions agree ==');
const topEntry = changelog.match(/^## \[([^\]]+)\]/m);
check('package.json === package-lock.json version', pkg.version === lock.version, pkg.version + ' vs ' + lock.version);
check('package.json === newest CHANGELOG entry', Boolean(topEntry) && topEntry[1] === pkg.version, (topEntry || [])[1] + ' vs ' + pkg.version);
check('unpublished versions are stated', /1\.2\.1 and 1\.2\.2 were built locally/.test(changelog));

console.log('\n== brand is Luna, repository location is separate ==');
check('publisher is lazyluna', pkg.publisher === 'lazyluna', pkg.publisher);
check('Claude Code output style is Luna', /const LUNA_OUTPUT_STYLE_NAME = 'Luna'/.test(ext));
check('LICENSE holder is Luna', /Copyright \(c\) \d{4} Luna/.test(read('LICENSE')));
check('icon gradient is luna-grad', /luna-grad/.test(read('resources/icon.svg')));
check('readme identifier uses the brand publisher', readme.includes('`' + pkg.publisher + '.' + pkg.name + '`'));
check('CHANGELOG names the brand publisher', changelog.includes(pkg.publisher));

const owner = (u) => (u.match(/github\.com[/:]([^/]+)\//) || [])[1];
check('repository/homepage/bugs point at the same owner',
  owner(pkg.repository.url) === owner(pkg.homepage) && owner(pkg.repository.url) === owner(pkg.bugs.url));
check('repository location is the real repo, not the brand',
  owner(pkg.repository.url) === 'hieuday88' && pkg.publisher !== owner(pkg.repository.url),
  owner(pkg.repository.url));
let remoteOwner = null;
try {
  remoteOwner = owner(execSync('git remote get-url origin', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
} catch { /* no git remote available */ }
if (remoteOwner) {
  check('repository URLs match the actual git remote', owner(pkg.repository.url) === remoteOwner,
    owner(pkg.repository.url) + ' vs remote ' + remoteOwner);
} else {
  skip('repository URLs match the actual git remote', 'git remote not readable');
}

console.log('\n== no stale brand left ==');
const stale = ['package.json', 'readme.md', 'CHANGELOG.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md',
  'RESPONSIBLE_USE.md', 'src/webview.html', 'resources/icon.svg', 'docs/1.3.0-hardening-plan.md']
  .filter((rel) => /tris/i.test(read(rel)));
check('no "tris" outside the legacy migration constants', stale.length === 0, stale.join(', '));
const legacyLines = ext.split(/\r?\n/).filter((l) => /tris/i.test(l));
check('extension.ts keeps exactly the 2 legacy constants', legacyLines.length === 2, legacyLines.length + ' line(s)');
check('legacy lines are the migration constants', legacyLines.every((l) => /LEGACY_OUTPUT_STYLE_(NAMES|FILENAMES)/.test(l)));
check('no unsupported "Free Active" badge', !/Free Active/.test(webview));

console.log('\n== profile count matches the artifacts ==');
const profiles = fs.readdirSync(path.join(root, 'resources/rules')).filter((f) => /^bypass_v\d+\.md$/.test(f));
check('three profile files on disk', profiles.length === 3, profiles.join(', '));
check('readme says three variants', /three profile variants/i.test(readme));
check('panel offers the same three profiles', ['bypassV1Opt', 'bypassV2Opt', 'bypassV3Opt'].every((id) => webview.includes(id)));
check('loader knows the same three', /V1: 'bypass_v1\.md'/.test(ext) && /V2: 'bypass_v2\.md'/.test(ext) && /V3: 'bypass_v3\.md'/.test(ext));
check('no dead fallback filenames remain', !/bypass-v1|gemini_v1|bypass-v2|gemini_v2|bypass-v3|gemini_v3/.test(ext));

console.log('\n== the no-network claim covers the panel too ==');
check('readme claims no network requests', /makes \*\*no network requests\*\*/.test(readme));
check('extension.ts imports nothing network-capable', !/from\s+'(https?|net|dns|tls|node:https?|node:net)'/.test(ext));
check('extension.ts has no fetch/axios/http call', !/\bfetch\(|axios|require\('https?'\)/.test(ext));
const csp = (webview.match(/Content-Security-Policy"\s*content="([^"]+)"/) || [])[1] || '';
check('panel content policy is default-src none', /default-src 'none'/.test(csp), csp);
check('panel content policy names no external host', !/https?:\/\//.test(csp), csp);
check('panel markup loads nothing external', !/(?:src|href)\s*=\s*["']https?:\/\//i.test(webview));
check('panel loads no web font', !/fonts\.googleapis|fonts\.gstatic|@font-face/.test(webview));
check('panel fonts come from the editor', /--vscode-font-family/.test(webview) && /--vscode-editor-font-family/.test(webview));
check('SECURITY.md does not claim a remote endpoint', !/remote endpoint|downloads? instruction profiles/i.test(security));
check('CONTRIBUTING.md does not say "downloaded profiles"', !/downloaded instruction profiles/i.test(contributing));
check('no leftover download status token', !/syncStatus|['"]download['"]/.test(ext) && !/syncStatus/.test(webview));

console.log('\n== documented file paths match the code ==');
check('code writes ~/.gemini/GEMINI.md', ext.includes("'.gemini'") && ext.includes('GEMINI.md') && readme.includes('~/.gemini/GEMINI.md'));
check('code writes ~/.kiro/steering/agents.md', ext.includes("'.kiro'") && ext.includes('agents.md') && readme.includes('~/.kiro/steering/agents.md'));
check('code writes output-styles/luna.md', ext.includes("'output-styles', 'luna.md'") && readme.includes('output-styles/luna.md'));
check('readme documents CLAUDE_CONFIG_DIR', ext.includes('CLAUDE_CONFIG_DIR') && readme.includes('CLAUDE_CONFIG_DIR'));
check('readme documents the outputStyle key', ext.includes('settings.json') && readme.includes('`outputStyle`'));

console.log('\n== backup/restore is documented and implemented consistently ==');
const suffix = ext.match(/const BACKUP_SUFFIX = '([^']+)'/);
check('code defines one backup suffix', Boolean(suffix), suffix ? suffix[1] : 'missing');
check('readme documents the same suffix', Boolean(suffix) && readme.includes('`' + suffix[1] + '`'));
check('readme documents the sidecar example', readme.includes('GEMINI.md' + (suffix ? suffix[1] : '.lunabak')));
check('SECURITY.md mentions the sidecar', Boolean(suffix) && security.includes(suffix[1]));
check('CHANGELOG documents the backup behaviour', /lunabak/.test(changelog));
check('remove restores rather than deleting blindly', /restoreUserFile\(environmentFor\(key\)\)/.test(ext));
check('restore only deletes content it owns',
  /restoreUserFile[\s\S]{0,900}ownedContents\.indexOf\(fs\.readFileSync\(filePath, 'utf8'\)\) !== -1/.test(ext));
check('sync backs up before overwriting', ext.indexOf('backupUserFile(environmentFor(key))') < ext.indexOf('fs.writeFileSync(geminiPath'));
check('an existing sidecar is never replaced', /fs\.existsSync\(backupPath\) \|\| !fs\.existsSync\(filePath\)/.test(ext));

console.log('\n== destructive calls stay confined ==');
const deactivateBody = ext.slice(ext.indexOf('export function deactivate'));
check('deactivate() removes nothing', !/unlinkSync|rmSync|rmdir/.test(deactivateBody));
check('no direct unlink of the gemini path', !/unlinkSync\(geminiPath\)/.test(ext));
check('no direct unlink of the kiro path', !/unlinkSync\(kiroPath\)/.test(ext));
check('legacy profiles are still cleaned up on sync', /unlinkSync\(stalePath\)/.test(ext));

console.log('\n== one wording for panel and notification ==');
check('panel renders the host wording', /showNotification\(message\.notice/.test(webview));
check('panel hardcodes no sync outcome', !/Đã đồng bộ:/.test(webview));
check('panel hardcodes no reset outcome', !/Đã gỡ bỏ:/.test(webview));
check('panel hardcodes no failure wording', !/Lỗi đồng bộ|Lỗi gỡ bỏ/.test(webview));
check('host posts a notice for every outcome', (ext.match(/notice: notice/g) || []).length === 5);
check('host shows the same notice as information', (ext.match(/showInformationMessage\(notice\)/g) || []).length === 3);
check('host shows the same notice as an error', (ext.match(/showErrorMessage\(notice\)/g) || []).length === 2);
check('no panel field the webview ignores', !/content: fileContent/.test(ext));

console.log('\n== the notices say when the profile takes effect ==');
check('the session requirement is not gated on Claude Code', !/claudeNote/.test(ext));
check('the sync notice states the new-session requirement', /phiên làm việc mới/.test(ext));
check('the removal notice states it too', /mở phiên mới/.test(ext));
check('the readme states it as well', /Open a \*\*new session\*\*/.test(readme));
check('the readme no longer says "when necessary"', !/Restart the target assistant when necessary/.test(readme));

console.log('\n== the session card shows real facts ==');
check('host reads the version from the packaged manifest',
  /readExtensionVersion\(this\._extensionUri\.fsPath\)/.test(ext) && /package\.json/.test(ext));
check('host sends the version to the panel', /version: extensionVersion/.test(ext));
check('panel renders the version', webview.includes('id="extensionVersion"') && /message\.version/.test(webview));
check('licence badge matches package.json', webview.includes(pkg.license + ' · Miễn phí') && pkg.license === 'MIT');
check('readme mentions the device ID is not transmitted', /never transmitted/i.test(readme));

console.log('\n== readme names the real UI controls ==');
for (const label of ['Chọn hồ sơ nghiên cứu', 'Chọn môi trường áp dụng', 'Đồng bộ', 'Gỡ bỏ']) {
  check('readme control "' + label + '" exists in the panel', readme.includes(label) && webview.includes(label));
}
const containerTitle = pkg.contributes.viewsContainers.activitybar[0].title;
check('readme names the real activity-bar container', readme.includes('**' + containerTitle + '**'), 'container title is "' + containerTitle + '"');

console.log('\n== the documented developer flow exists ==');
check('launch.json exists', exists('.vscode/launch.json'));
check('tasks.json exists', exists('.vscode/tasks.json'));
const docsSayF5 = /F5/.test(readme) || /F5/.test(contributing);
check('the documented F5 flow is configured', !docsSayF5 || (exists('.vscode/launch.json') && exists('.vscode/tasks.json')));
check('launch.json reuses the watch task that tasks.json defines',
  /"preLaunchTask": "npm: watch"/.test(read('.vscode/launch.json')) && /"label": "npm: watch"/.test(read('.vscode/tasks.json')));

console.log('\n== one line-ending convention ==');
check('.gitattributes pins LF', exists('.gitattributes') && /\* text=auto eol=lf/.test(read('.gitattributes')));
check('.editorconfig agrees on LF', /end_of_line = lf/.test(read('.editorconfig')));
try {
  const eol = execSync('git ls-files --eol', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const crlf = eol.split('\n').filter((l) => /w\/crlf/.test(l));
  check('no tracked text file is checked out as CRLF', crlf.length === 0, crlf.join(' | '));
} catch {
  skip('no tracked text file is checked out as CRLF', 'git not readable');
}

console.log('\n== packaging agrees with the docs ==');
check('package.json main exists', exists(pkg.main.replace(/^\.\//, '')));
check('package.json icon exists', exists(pkg.icon));
const ignores = vscodeignore.split(/\r?\n/).map((l) => l.trim());
check('webview.html is kept in the package', ignores.includes('src/**/*.ts') && ignores.includes('!src/webview.html'));
check('RESPONSIBLE_USE.md is shipped', !ignores.includes('RESPONSIBLE_USE.md'));
check('docs/ is excluded from the package', ignores.includes('docs/**'));
check('test/ is excluded from the package', ignores.includes('test/**'));
check('scripts/ is excluded from the package', ignores.includes('scripts/**'));
check('CONTRIBUTING/SECURITY are excluded, as the readme states',
  ignores.includes('CONTRIBUTING.md') && ignores.includes('SECURITY.md') && /live in the repository/.test(readme));

console.log('\n== the release artifact is named after its version ==');
const packaging = require(path.join(root, 'scripts', 'package-release.js'));
const expectedArtifact = pkg.name + '-' + pkg.version + '.vsix';
check('artifact name is <name>-<version>.vsix', packaging.releaseFileName(pkg.version) === expectedArtifact,
  packaging.releaseFileName(pkg.version));
check('artifact name carries the current version', packaging.releaseFileName(pkg.version).includes(pkg.version));
check('the packaging helper reads the version from package.json', packaging.currentVersion() === pkg.version);
check('npm run package:release is wired to the helper', /scripts\/package-release\.js/.test(pkg.scripts['package:release'] || ''));
check('CI packages through the same script', /npm run package:release/.test(read('.github/workflows/build.yml')));
check('readme names the versioned artifact', readme.includes('agent-safety-jailbreak-lab-<version>.vsix'));

console.log('\n== verification is reproducible from the repo ==');
check('test script is wired to npm test', /node test\/run\.js/.test(pkg.scripts.test || ''));
check('all suites are present', ['run.js', 'behaviour.js', 'consistency.js', 'ui.js'].every((f) => exists('test/' + f)));
check('the test script compiles first', /npm run compile/.test(pkg.scripts.test || ''));
for (const s of ['check', 'compile', 'package', 'package:release', 'watch', 'test']) {
  check('script "' + s + '" exists', Boolean(pkg.scripts[s]));
}
check('readme build block matches scripts',
  /npm run check/.test(readme) && /npm test/.test(readme) && /npm run package:release/.test(readme));

console.log('\n== CHANGELOG describes updates, not a rebrand ==');
check('the changelog opens with what the release contains', /Everything here landed after 1\.2\.0/.test(changelog));
check('the changelog is not framed as a rebrand', !/First release under the Luna brand/.test(changelog));
const topics = [
  ['toggle scoping', /environment toggles in step 2 now control the scope/],
  ['deactivate fix', /Deactivating the extension no longer deletes/],
  ['backup sidecar', /lunabak/],
  ['shared wording', /share one wording produced by the host/],
  ['version badge', /session card shows the real extension version/],
  ['syncStatus removal', /Removed the unused `syncStatus` message/],
  ['offline panel', /no longer loads Google Fonts/],
  ['dead loader names', /six dead fallback profile filenames/],
  ['gitattributes', /gitattributes.*pins LF/],
  ['debug config', /launch\.json.*tasks\.json/],
  ['test suites', /verification suites committed under `test\/`/],
  ['artifact naming', /agent-safety-jailbreak-lab-<version>\.vsix/],
  ['session semantics', /only takes effect in a new session/],
  ['doc corrections', /no network requests/]
];
for (const [name, re] of topics) {
  check('CHANGELOG covers ' + name, re.test(changelog));
}

console.log('\n' + (failures === 0 ? 'CONSISTENCY AUDIT PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
