// Packages the VSIX under a versioned, identifiable name:
//   agent-safety-jailbreak-lab-<version>.vsix
//
// The name comes from package.json, so the artifact and the manifest can never
// disagree about which version it is.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** `agent-safety-jailbreak-lab-1.3.0.vsix` for version `1.3.0`. */
function releaseFileName(version) {
  return pkgName() + '-' + version + '.vsix';
}

function pkgName() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;
}

function currentVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

function packageRelease() {
  const out = releaseFileName(currentVersion());

  // Resolve vsce's own entry script and run it with node directly, so no shell is
  // involved and the command behaves the same on Windows and on Linux.
  const vscePkgPath = require.resolve('@vscode/vsce/package.json', { paths: [ROOT] });
  const vscePkg = JSON.parse(fs.readFileSync(vscePkgPath, 'utf8'));
  const binRelative = typeof vscePkg.bin === 'string' ? vscePkg.bin : vscePkg.bin.vsce;
  const vsceEntry = path.join(path.dirname(vscePkgPath), binRelative);

  const result = spawnSync(process.execPath, [vsceEntry, 'package', '--out', out], { cwd: ROOT, stdio: 'inherit' });
  return result.status === 0 ? out : null;
}

module.exports = { releaseFileName, packageRelease, currentVersion };

if (require.main === module) {
  const out = packageRelease();
  if (!out) {
    console.error('packaging failed');
    process.exit(1);
  }
  console.log('release artifact: ' + out);
}
