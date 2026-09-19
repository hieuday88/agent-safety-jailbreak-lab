import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/** Filenames of the bundled research profiles, keyed by profile version. */
const PROFILE_FILENAMES: Record<string, string> = {
    V1: 'bypass_v1.md',
    V2: 'bypass_v2.md',
    V3: 'bypass_v3.md'
};

function getBypassContent(extensionPath: string, bypassType: string): string {
    const normalizedType = bypassType.toUpperCase();
    const filename = PROFILE_FILENAMES[normalizedType] ?? PROFILE_FILENAMES.V1;
    const fullPath = path.join(extensionPath, 'resources', 'rules', filename);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Không tìm thấy file cấu hình bypass ${bypassType} (${filename}) trong extension.`);
    }

    return fs.readFileSync(fullPath, 'utf8');
}

function getClaudeConfigDir(): string {
    const configuredDir = process.env.CLAUDE_CONFIG_DIR?.trim();
    return configuredDir ? path.resolve(configuredDir) : path.join(os.homedir(), '.claude');
}

const LUNA_OUTPUT_STYLE_NAME = 'Luna';
const CLAUDE_OUTPUT_STYLE_BACKUP_KEY = 'claudeOutputStyleBackup';
const SELECTED_TARGETS_KEY = 'selectedTargets';

// Names written by releases published before the rename. They are kept so that an
// upgrade can clean up the profile those versions installed, instead of leaving
// settings.json pointing at a style file nothing owns any more.
const LEGACY_OUTPUT_STYLE_NAMES = ['OnlyTris'];
const LEGACY_OUTPUT_STYLE_FILENAMES = ['onlytris.md'];

type TargetKey = 'gemini' | 'kiro' | 'claude';

const TARGET_KEYS: readonly TargetKey[] = ['gemini', 'kiro', 'claude'];
const TARGET_LABELS: Record<TargetKey, string> = {
    gemini: 'Antigravity',
    kiro: 'Kiro',
    claude: 'Claude Code'
};

interface ClaudeOutputStyleBackup {
    hadValue: boolean;
    value?: unknown;
}

/**
 * Resolves the environments an action may touch. The webview owns the selection
 * made in step 2 (the three toggles), so only those keys are honoured. A missing
 * or empty payload falls back to every environment instead of silently doing
 * nothing.
 */
function resolveTargets(raw: unknown): TargetKey[] {
    if (!Array.isArray(raw)) {
        return TARGET_KEYS.slice();
    }
    const selected = TARGET_KEYS.filter((key) => raw.indexOf(key) !== -1);
    return selected.length > 0 ? selected : TARGET_KEYS.slice();
}

function formatTargetList(targets: readonly TargetKey[]): string {
    return targets.map((key) => TARGET_LABELS[key]).join(', ');
}

/** True when the configured output style is one this extension owns (current or legacy). */
function isManagedOutputStyle(value: unknown): boolean {
    return value === LUNA_OUTPUT_STYLE_NAME || LEGACY_OUTPUT_STYLE_NAMES.indexOf(String(value)) !== -1;
}

/**
 * Suffix of the sidecar holding whatever the user had at a target path before the
 * first overwrite. A sidecar rather than editor state, so the original cannot be
 * lost by clearing extension storage and it can be restored by hand.
 */
const BACKUP_SUFFIX = '.lunabak';

interface TargetEnvironment {
    key: TargetKey;
    filePath: string;
    /** Exact bodies this extension may have written, used to recognise our own output. */
    ownedContents: readonly string[];
}

function backupPathFor(filePath: string): string {
    return `${filePath}${BACKUP_SUFFIX}`;
}

/**
 * Preserves user-owned content before the first overwrite. Content this extension
 * wrote is recognised and skipped, and an existing backup is never replaced, so the
 * earliest copy always wins.
 */
function backupUserFile(environment: TargetEnvironment): boolean {
    const { filePath, ownedContents } = environment;
    const backupPath = backupPathFor(filePath);

    if (fs.existsSync(backupPath) || !fs.existsSync(filePath)) {
        return false;
    }

    const current = fs.readFileSync(filePath, 'utf8');
    if (ownedContents.indexOf(current) !== -1) {
        return false;
    }

    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, current, 'utf8');
    return true;
}

/**
 * Undoes a sync: the saved original is put back when there is one, our own output
 * is removed when there is not, and anything unrecognised is left untouched so
 * this can never delete a file it did not write.
 */
function restoreUserFile(environment: TargetEnvironment): 'restored' | 'removed' | 'untouched' {
    const { filePath, ownedContents } = environment;
    const backupPath = backupPathFor(filePath);

    if (fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, fs.readFileSync(backupPath, 'utf8'), 'utf8');
        fs.unlinkSync(backupPath);
        return 'restored';
    }

    if (fs.existsSync(filePath) && ownedContents.indexOf(fs.readFileSync(filePath, 'utf8')) !== -1) {
        fs.unlinkSync(filePath);
        return 'removed';
    }

    return 'untouched';
}

/** Version reported by the panel, read from the packaged manifest so the two cannot drift. */
function readExtensionVersion(extensionPath: string): string {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf8')) as { version?: unknown };
        return typeof parsed.version === 'string' ? parsed.version : 'unknown';
    } catch {
        return 'unknown';
    }
}

function readJsonObject(filePath: string): Record<string, unknown> {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Cấu hình không hợp lệ: ${filePath} phải chứa một JSON object.`);
    }

    return parsed as Record<string, unknown>;
}

function writeJsonObject(filePath: string, value: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createClaudeOutputStyleContent(instructions: string): string {
    return [
        '---',
        `name: ${LUNA_OUTPUT_STYLE_NAME}`,
        'description: Global Luna response style',
        'keep-coding-instructions: true',
        '---',
        '',
        instructions
    ].join('\n');
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent Safety Jailbreak Lab is active!');

    // Initialize or fetch stable device ID
    let deviceId = context.globalState.get<string>('deviceId');
    if (!deviceId) {
        deviceId = crypto.randomBytes(16).toString('hex'); // 32 hex chars
        context.globalState.update('deviceId', deviceId);
    }

    const provider = new GeminiWriterViewProvider(context.extensionUri, deviceId, context.globalState);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(GeminiWriterViewProvider.viewType, provider)
    );

    const focusDisposable = vscode.commands.registerCommand('agent-safety-jailbreak-lab.focus', () => {
        vscode.commands.executeCommand('agent-safety-jailbreak-lab-view.focus');
    });
    context.subscriptions.push(focusDisposable);
}

class GeminiWriterViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'agent-safety-jailbreak-lab-view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _deviceId: string,
        private readonly _globalState: vscode.Memento
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview.html');
        let htmlContent = '';
        try {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
        } catch (err) {
            const errStr = String(err).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            webviewView.webview.html = '<h3>Failed to load webview template: ' + errStr + '</h3>';
            return;
        }

        webviewView.webview.html = htmlContent;

        const geminiPath = path.join(os.homedir(), '.gemini', 'GEMINI.md');
        const kiroPath = path.join(os.homedir(), '.kiro', 'steering', 'agents.md');
        // User-level Claude output styles are global across projects. Respecting
        // CLAUDE_CONFIG_DIR keeps the extension portable across machines.
        const claudeConfigDir = getClaudeConfigDir();
        const claudeOutputStylePath = path.join(claudeConfigDir, 'output-styles', 'luna.md');
        const claudeSettingsPath = path.join(claudeConfigDir, 'settings.json');
        // Profiles left behind by pre-rename releases, removed once the new style is in place.
        const staleClaudeStylePaths = LEGACY_OUTPUT_STYLE_FILENAMES.map((name) =>
            path.join(claudeConfigDir, 'output-styles', name)
        );
        const staleClaudeRulePaths = LEGACY_OUTPUT_STYLE_FILENAMES.map((name) =>
            path.join(claudeConfigDir, 'rules', name)
        );

        // Every body this extension can write, so a file it owns is never mistaken
        // for user content, and vice versa.
        const bundledProfiles: string[] = [];
        for (const profileType of Object.keys(PROFILE_FILENAMES)) {
            try {
                bundledProfiles.push(getBypassContent(this._extensionUri.fsPath, profileType));
            } catch {
                // A missing profile only means that body cannot be recognised here.
            }
        }

        const environments: TargetEnvironment[] = [
            { key: 'gemini', filePath: geminiPath, ownedContents: bundledProfiles },
            { key: 'kiro', filePath: kiroPath, ownedContents: bundledProfiles },
            {
                key: 'claude',
                filePath: claudeOutputStylePath,
                ownedContents: bundledProfiles.map(createClaudeOutputStyleContent)
            }
        ];
        const environmentFor = (key: TargetKey): TargetEnvironment =>
            environments.filter((environment) => environment.key === key)[0];

        const extensionVersion = readExtensionVersion(this._extensionUri.fsPath);

        // Helper to get stats of a single file
        const getSingleFileStats = (filePath: string) => {
            try {
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split(/\r?\n/).length;
                    return {
                        exists: true,
                        sizeBytes: stats.size,
                        lines: lines,
                        mtime: stats.mtime.toLocaleString('vi-VN', { hour12: false })
                    };
                }
            } catch (err) {
                console.error(`Error reading file stats for ${filePath}:`, err);
            }
            return {
                exists: false,
                sizeBytes: 0,
                lines: 0,
                mtime: 'N/A'
            };
        };

        // Helper to get stats of target files
        const getFileStats = () => {
            return {
                gemini: getSingleFileStats(geminiPath),
                kiro: getSingleFileStats(kiroPath),
                claude: getSingleFileStats(claudeOutputStylePath)
            };
        };

        // Handle messages from the Webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'ready': {
                    const stats = getFileStats();
                    const savedBypassType = this._globalState.get<string>('bypassType') || 'V1';
                    const savedTargets = this._globalState.get<unknown>(SELECTED_TARGETS_KEY);
                    webviewView.webview.postMessage({
                        command: 'load',
                        stats: stats,
                        deviceId: this._deviceId,
                        version: extensionVersion,
                        bypassType: savedBypassType,
                        targets: Array.isArray(savedTargets) ? resolveTargets(savedTargets) : undefined
                    });
                    break;
                }
                case 'activateSync': {
                    try {
                        const targets = resolveTargets(message.targets);
                        const bypassType = this._globalState.get<string>('bypassType') || 'V1';

                        const fileContent = getBypassContent(this._extensionUri.fsPath, bypassType);

                        // Keep whatever the user had at each target before overwriting it.
                        for (const key of targets) {
                            backupUserFile(environmentFor(key));
                        }

                        // Antigravity: overwrite the local GEMINI.md file.
                        if (targets.indexOf('gemini') !== -1) {
                            fs.mkdirSync(path.dirname(geminiPath), { recursive: true });
                            fs.writeFileSync(geminiPath, fileContent, 'utf8');
                        }

                        // Kiro: overwrite the local agents.md file.
                        if (targets.indexOf('kiro') !== -1) {
                            fs.mkdirSync(path.dirname(kiroPath), { recursive: true });
                            fs.writeFileSync(kiroPath, fileContent, 'utf8');
                        }

                        if (targets.indexOf('claude') !== -1) {
                            // Output styles are appended to Claude Code's system prompt,
                            // making role, tone, and formatting instructions more reliable.
                            const claudeSettings = readJsonObject(claudeSettingsPath);
                            const currentOutputStyle = claudeSettings.outputStyle;
                            const existingBackup = this._globalState.get<ClaudeOutputStyleBackup>(CLAUDE_OUTPUT_STYLE_BACKUP_KEY);
                            if (!isManagedOutputStyle(currentOutputStyle) && existingBackup === undefined) {
                                await this._globalState.update(CLAUDE_OUTPUT_STYLE_BACKUP_KEY, {
                                    hadValue: Object.prototype.hasOwnProperty.call(claudeSettings, 'outputStyle'),
                                    value: currentOutputStyle
                                } satisfies ClaudeOutputStyleBackup);
                            }

                            fs.mkdirSync(path.dirname(claudeOutputStylePath), { recursive: true });
                            fs.writeFileSync(claudeOutputStylePath, createClaudeOutputStyleContent(fileContent), 'utf8');
                            claudeSettings.outputStyle = LUNA_OUTPUT_STYLE_NAME;
                            writeJsonObject(claudeSettingsPath, claudeSettings);

                            // Migrate installations created by earlier releases without
                            // touching any user-owned CLAUDE.md file.
                            for (const stalePath of staleClaudeStylePaths.concat(staleClaudeRulePaths)) {
                                if (fs.existsSync(stalePath)) {
                                    fs.unlinkSync(stalePath);
                                }
                            }
                        }

                        await this._globalState.update(SELECTED_TARGETS_KEY, targets);

                        const updatedStats = getFileStats();
                        // An assistant composes the profile into its instructions when a
                        // session starts, so a session that is already open keeps the one
                        // it began with. That applies to every environment, not just
                        // Claude Code, and saying it only there made a sync from
                        // Antigravity or Kiro look like it had done nothing.
                        const notice = `Đồng bộ thành công cho: ${formatTargetList(targets)}. `
                            + 'Hãy mở phiên làm việc mới trong các môi trường đó để hồ sơ có hiệu lực.';
                        webviewView.webview.postMessage({
                            command: 'syncResponse',
                            success: true,
                            notice: notice,
                            targets: targets,
                            stats: updatedStats
                        });
                        vscode.window.showInformationMessage(notice);
                    } catch (err) {
                        const errMsg = err instanceof Error ? err.message : String(err);
                        const notice = `Kích hoạt thất bại: ${errMsg}`;
                        webviewView.webview.postMessage({
                            command: 'syncResponse',
                            success: false,
                            notice: notice
                        });
                        vscode.window.showErrorMessage(notice);
                    }
                    break;
                }
                case 'resetBypass': {
                    try {
                        const targets = resolveTargets(message.targets);
                        const restored: TargetKey[] = [];

                        // Put back what the user had, remove only what we wrote.
                        for (const key of targets) {
                            if (restoreUserFile(environmentFor(key)) === 'restored') {
                                restored.push(key);
                            }
                        }

                        if (targets.indexOf('claude') !== -1) {
                            // Profiles under the legacy names are always ours, never user content.
                            for (const stalePath of staleClaudeStylePaths.concat(staleClaudeRulePaths)) {
                                if (fs.existsSync(stalePath)) {
                                    fs.unlinkSync(stalePath);
                                }
                            }

                            if (fs.existsSync(claudeSettingsPath)) {
                                const claudeSettings = readJsonObject(claudeSettingsPath);
                                if (isManagedOutputStyle(claudeSettings.outputStyle)) {
                                    const backup = this._globalState.get<ClaudeOutputStyleBackup>(CLAUDE_OUTPUT_STYLE_BACKUP_KEY);
                                    if (backup?.hadValue) {
                                        claudeSettings.outputStyle = backup.value;
                                    } else {
                                        delete claudeSettings.outputStyle;
                                    }
                                    writeJsonObject(claudeSettingsPath, claudeSettings);
                                }
                            }
                            await this._globalState.update(CLAUDE_OUTPUT_STYLE_BACKUP_KEY, undefined);
                        }

                        await this._globalState.update(SELECTED_TARGETS_KEY, targets);

                        const updatedStats = getFileStats();
                        const restoreNote = restored.length > 0
                            ? ` Đã khôi phục nội dung gốc của: ${formatTargetList(restored)}.`
                            : '';
                        // Removal is immediate on disk, but a session that is already open
                        // still runs on whatever profile it started with.
                        const notice = `Đã gỡ bỏ cấu hình Bypass cho: ${formatTargetList(targets)}.${restoreNote}`
                            + ' Phiên làm việc đang mở vẫn giữ hồ sơ cũ cho tới khi bạn mở phiên mới.';
                        webviewView.webview.postMessage({
                            command: 'resetResponse',
                            success: true,
                            notice: notice,
                            targets: targets,
                            restored: restored,
                            stats: updatedStats
                        });
                        vscode.window.showInformationMessage(notice);
                    } catch (err) {
                        const errMsg = err instanceof Error ? err.message : String(err);
                        const notice = `Gỡ bỏ Bypass thất bại: ${errMsg}`;
                        webviewView.webview.postMessage({
                            command: 'resetResponse',
                            success: false,
                            notice: notice
                        });
                        vscode.window.showErrorMessage(notice);
                    }
                    break;
                }
                case 'saveBypassType': {
                    const bypassType = message.bypassType || 'V1';
                    this._globalState.update('bypassType', bypassType);
                    const notice = `Đã lưu cấu hình Bypass ${bypassType} thành công!`;
                    webviewView.webview.postMessage({
                        command: 'bypassTypeSaveResponse',
                        success: true,
                        notice: notice
                    });
                    vscode.window.showInformationMessage(notice);
                    break;
                }
            }
        });
    }
}

export function deactivate() {
    // Nothing is removed here on purpose. Deactivation also runs on every window
    // reload and on editor shutdown, so deleting the profile here would remove the
    // very files the target assistant needs, and it would delete files the user
    // owned whenever the extension was disabled or uninstalled. The explicit
    // "Gỡ bỏ" action owns cleanup for every environment, and it honours the
    // environment selection from step 2.
}
