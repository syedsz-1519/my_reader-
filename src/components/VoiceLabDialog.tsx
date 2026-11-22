import * as React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Cloud,
  CheckCircle2,
  Cpu,
  Download,
  FlaskConical,
  HardDrive,
  Play,
  PlusCircle,
  Server,
  ShieldCheck,
  SpellCheck,
  Sliders,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { FEATURES } from '../config/features';
import type {
  PersistedReaderState,
  PronunciationMatchMode,
  PronunciationRule,
} from '../engine/storage';
import type { ProviderId, ProviderInitProgress, TtsEngineSnapshot } from '../engine/types';
import {
  clearDownloadedVoiceCaches,
  getModelCacheUsageBytes,
  KOKORO_APPROX_SIZE_MB,
} from '../providers/kokoroProvider';
import { PIPER_LICENSE_NOTICE } from '../providers/piperProvider';
import {
  GOOGLE_CLOUD_VOICES,
  inferGoogleLanguageCode,
  type GoogleCloudTtsProvider,
} from '../providers/googleTtsProvider';
import type { RemoteOpenAIProvider } from '../providers/remoteProvider';
import { previewPronunciationRules } from '../utils/textFilters';
import { Button, IconButton } from './ui/Button';
import { ModalDialog } from './ui/Dialog';
import { Slider } from './ui/Slider';

export type VoiceLabTab = 'runtime' | 'voices' | 'dictionary' | 'cadence';

const LEXICON_PRESETS: Array<{ id: string; label: string; rules: Omit<PronunciationRule, 'id'>[] }> = [
  {
    id: 'tech',
    label: 'Tech & AI Acronyms',
    rules: [
      { pattern: 'SLM', replacement: 'small language model', matchMode: 'exact', wholeWord: true },
      { pattern: 'Kubernetes', replacement: 'koo-ber-net-ees', matchMode: 'case-insensitive' },
      { pattern: 'arXiv', replacement: 'archive', matchMode: 'case-insensitive' },
      { pattern: 'Kokoro', replacement: 'koh-koh-roh', matchMode: 'case-insensitive' },
      { pattern: 'PostgreSQL', replacement: 'post-gres-Q-L', matchMode: 'exact' },
    ],
  },
  {
    id: 'medical',
    label: 'Medical & Scientific',
    rules: [
      { pattern: 'mg/dL', replacement: 'milligrams per deciliter', matchMode: 'case-insensitive' },
      { pattern: 'bpm', replacement: 'beats per minute', matchMode: 'case-insensitive', wholeWord: true },
      { pattern: 'μg', replacement: 'micrograms', matchMode: 'case-insensitive' },
    ],
  },
  {
    id: 'literary',
    label: 'Literary & Classical',
    rules: [
      { pattern: 'vis-à-vis', replacement: 'veez-ah-vee', matchMode: 'case-insensitive' },
      { pattern: 'fin de siècle', replacement: 'fan duh syek-luh', matchMode: 'case-insensitive' },
    ],
  },
];

export interface VoiceLabDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: VoiceLabTab;
  onTabChange: (tab: VoiceLabTab) => void;
  snapshot: TtsEngineSnapshot;
  prefs: PersistedReaderState;
  onUpdatePrefs: (patch: Partial<PersistedReaderState>) => void;
  onSwitchProvider: (
    id: ProviderId,
    onProgress?: (p: ProviderInitProgress) => void,
  ) => Promise<boolean>;
  onSelectVoice: (voiceId: string) => void;
  onPreviewVoice: (voiceId: string, customSample?: string) => void;
  onChangeRate: (rate: number) => void;
  onChangePitch: (pitch: number) => void;
  onChangeVolume: (vol: number) => void;
  kokoroDevice: 'wasm' | 'webgpu';
  onChangeKokoroDevice: (device: 'wasm' | 'webgpu') => void;
  remoteProvider: RemoteOpenAIProvider;
  googleProvider: GoogleCloudTtsProvider;
  onNotify: (msg: { kind: 'info' | 'success' | 'error'; message: string }) => void;
}

export function VoiceLabDialog({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  snapshot,
  prefs,
  onUpdatePrefs,
  onSwitchProvider,
  onSelectVoice,
  onPreviewVoice,
  onChangeRate,
  onChangePitch,
  onChangeVolume,
  kokoroDevice,
  onChangeKokoroDevice,
  remoteProvider,
  googleProvider,
  onNotify,
}: VoiceLabDialogProps) {
  const [kokoroDownloadConfirm, setKokoroDownloadConfirm] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState<ProviderInitProgress | null>(null);
  const [cacheBytes, setCacheBytes] = React.useState(0);
  const [voiceFilter, setVoiceFilter] = React.useState('');

  // Remote config state
  const [remoteUseProxy, setRemoteUseProxy] = React.useState(false);
  const [remoteTestResult, setRemoteTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [remoteTesting, setRemoteTesting] = React.useState(false);

  // Google Cloud TTS config & test state
  const [googleConsentHighlight, setGoogleConsentHighlight] = React.useState(false);
  const [googleTestResult, setGoogleTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [googleTesting, setGoogleTesting] = React.useState(false);
  const [googleActivating, setGoogleActivating] = React.useState(false);

  // Pronunciation dictionary form & scratchpad state
  const [rulePattern, setRulePattern] = React.useState('');
  const [ruleReplacement, setRuleReplacement] = React.useState('');
  const [ruleMatchMode, setRuleMatchMode] = React.useState<PronunciationMatchMode>('case-insensitive');
  const [scratchpadInput, setScratchpadInput] = React.useState(
    'The SLM ran Kokoro on Kubernetes to synthesize arXiv papers.',
  );
  const dictUploadRef = React.useRef<HTMLInputElement | null>(null);

  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

  React.useEffect(() => {
    if (!open) return;
    void getModelCacheUsageBytes().then(setCacheBytes);
  }, [open, snapshot.providerId]);

  const handleEnableKokoro = async () => {
    setKokoroDownloadConfirm(false);
    setDownloadProgress({ progress: 5, status: 'Initializing Kokoro neural model…' });
    const ok = await onSwitchProvider('kokoro', (p) => setDownloadProgress(p));
    setDownloadProgress(null);
    void getModelCacheUsageBytes().then(setCacheBytes);
    if (ok) {
      onNotify({ kind: 'success', message: 'Kokoro neural voices ready offline.' });
    }
  };

  const handleClearCaches = async () => {
    await clearDownloadedVoiceCaches();
    const bytes = await getModelCacheUsageBytes();
    setCacheBytes(bytes);
    onNotify({ kind: 'info', message: 'Downloaded neural voice caches cleared.' });
  };

  const handleTestRemote = async () => {
    setRemoteTesting(true);
    setRemoteTestResult(null);
    remoteProvider.configure({
      baseUrl: prefs.remoteBaseUrl,
      apiKey: prefs.remoteApiKey || undefined,
      model: prefs.remoteModel,
      voice: prefs.remoteVoice,
      format: prefs.remoteFormat,
      useProxy: remoteUseProxy,
    });
    const result = await remoteProvider.testConnection();
    setRemoteTestResult(result);
    setRemoteTesting(false);
  };

  const handleTestGoogle = async () => {
    setGoogleTesting(true);
    setGoogleTestResult(null);
    googleProvider.configure({
      consentGranted: prefs.googleCloudConsentGranted,
      languageCode: prefs.googleLanguageCode,
      voice: prefs.googleVoice,
    });
    const result = await googleProvider.testConnection();
    setGoogleTestResult(result);
    setGoogleTesting(false);
  };

  const handleEnableGoogle = async () => {
    if (!prefs.googleCloudConsentGranted) {
      setGoogleConsentHighlight(true);
      onNotify({
        kind: 'info',
        message: 'Confirm the privacy opt-in checkbox before activating Google Cloud TTS.',
      });
      return;
    }
    setGoogleConsentHighlight(false);
    setGoogleActivating(true);
    googleProvider.configure({
      consentGranted: true,
      languageCode: prefs.googleLanguageCode,
      voice: prefs.googleVoice,
    });
    const ok = await onSwitchProvider('google');
    setGoogleActivating(false);
    if (ok) {
      onSelectVoice(prefs.googleVoice);
      onNotify({ kind: 'success', message: 'Google Cloud Text-to-Speech active.' });
    }
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulePattern.trim() || !ruleReplacement.trim()) return;
    const nextRule: PronunciationRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pattern: rulePattern.trim(),
      replacement: ruleReplacement.trim(),
      matchMode: ruleMatchMode,
      caseSensitive: ruleMatchMode === 'exact',
    };
    onUpdatePrefs({ pronunciationRules: [nextRule, ...prefs.pronunciationRules] });
    setRulePattern('');
    setRuleReplacement('');
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = LEXICON_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const existingPatterns = new Set(prefs.pronunciationRules.map((r) => r.pattern.toLowerCase()));
    const additions: PronunciationRule[] = preset.rules
      .filter((r) => !existingPatterns.has(r.pattern.toLowerCase()))
      .map((r, i) => ({
        ...r,
        id: `preset_${presetId}_${Date.now()}_${i}`,
      }));
    if (additions.length === 0) {
      onNotify({ kind: 'info', message: `${preset.label} rules are already in your dictionary.` });
      return;
    }
    onUpdatePrefs({ pronunciationRules: [...additions, ...prefs.pronunciationRules] });
    onNotify({ kind: 'success', message: `Added ${additions.length} rules from ${preset.label}.` });
  };

  const scratchPreview = React.useMemo(
    () => previewPronunciationRules(scratchpadInput, prefs.pronunciationRules),
    [scratchpadInput, prefs.pronunciationRules],
  );

  const filteredVoices = React.useMemo(() => {
    const q = voiceFilter.trim().toLowerCase();
    return snapshot.voices.filter(
      (v) => !q || v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q),
    );
  }, [snapshot.voices, voiceFilter]);

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClass="max-w-4xl"
      mobileSheet
      title="Voice Lab & Speech Engine"
      description="Configure browser voices, offline Kokoro neural synthesis, custom pronunciation rules, and acoustic cadence."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-[var(--border)] text-[11px] font-medium text-[var(--accent)]">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            {snapshot.providerId === 'remote'
              ? 'Remote Server Mode'
              : snapshot.providerId === 'google'
                ? 'Google Cloud TTS (Opt-In)'
                : 'Local Private Inference'}
          </span>
          <span className="text-[11px] font-mono text-[var(--text-soft)]">
            {hasWebGpu ? 'WebGPU capable' : 'WASM SIMD runtime'}
          </span>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-soft)] tabular-nums">
            <HardDrive className="w-4 h-4" aria-hidden="true" />
            <span>Origin storage used: {(cacheBytes / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => void handleClearCaches()}>
              Delete downloaded voices
            </Button>
            <Button size="sm" variant="primary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      }
    >
      <Tabs.Root value={activeTab} onValueChange={(v) => onTabChange(v as VoiceLabTab)} className="space-y-4">
        <Tabs.List className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
          <TabTrigger value="runtime" icon={<Cpu className="w-4 h-4" />}>
            Runtime & Engine
          </TabTrigger>
          <TabTrigger value="voices" icon={<Volume2 className="w-4 h-4" />}>
            Voices ({snapshot.voices.length})
          </TabTrigger>
          <TabTrigger value="dictionary" icon={<SpellCheck className="w-4 h-4" />}>
            Pronunciation ({prefs.pronunciationRules.length})
          </TabTrigger>
          <TabTrigger value="cadence" icon={<Sliders className="w-4 h-4" />}>
            Acoustics
          </TabTrigger>
        </Tabs.List>

        {/* TAB 1: RUNTIME & ENGINE */}
        <Tabs.Content value="runtime" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Web Speech Native */}
            <EngineCard
              title="Browser Native (Web Speech)"
              badge="Instant · 0 MB"
              active={snapshot.providerId === 'webspeech'}
              description="Uses your device’s built-in voices with zero model download. Ideal for fast everyday listening."
              onSelect={() => void onSwitchProvider('webspeech')}
            />

            {/* Kokoro Neural Offline */}
            <EngineCard
              title="Kokoro Neural (Offline)"
              badge={`~${KOKORO_APPROX_SIZE_MB} MB · Apache-2.0`}
              active={snapshot.providerId === 'kokoro'}
              description="On-device Kokoro-82M neural TTS with gapless Web Audio playback and WAV audio export."
              onSelect={() => {
                if (snapshot.providerId !== 'kokoro') {
                  setKokoroDownloadConfirm(true);
                }
              }}
              extra={
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!hasWebGpu}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeKokoroDevice('webgpu');
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium border cursor-pointer disabled:opacity-40 ${
                      kokoroDevice === 'webgpu'
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                        : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
                    }`}
                  >
                    WebGPU (fp32)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeKokoroDevice('wasm');
                    }}
                    className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium border cursor-pointer ${
                      kokoroDevice === 'wasm'
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                        : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
                    }`}
                  >
                    WASM (q8)
                  </button>
                </div>
              }
            />

            {/* Optional Piper WASM (Feature-flagged) */}
            {FEATURES.piper && (
              <EngineCard
                title="Piper WASM (Multilingual)"
                badge="Per-voice download · GPL-3.0 / MIT"
                active={snapshot.providerId === 'piper'}
                description={PIPER_LICENSE_NOTICE}
                onSelect={() => void onSwitchProvider('piper')}
              />
            )}

            {/* Remote OpenAI / Kokoro-FastAPI */}
            {FEATURES.remoteOpenAI && (
              <EngineCard
                title="Remote Server (OpenAI / Kokoro-FastAPI)"
                badge="Needs server"
                active={snapshot.providerId === 'remote'}
                description="Connect your own self-hosted Kokoro-FastAPI Docker container or OpenAI-compatible /v1/audio/speech endpoint."
                onSelect={() => void onSwitchProvider('remote')}
              />
            )}

            {/* Google Cloud Text-to-Speech */}
            {FEATURES.googleCloudTts && (
              <EngineCard
                title="Google Cloud Text-to-Speech"
                badge="Opt-in cloud · MP3 export"
                active={snapshot.providerId === 'google'}
                description="Synthesize Standard and Neural2 voices via /api/google-tts with explicit privacy consent and direct MP3 export."
                onSelect={() => void handleEnableGoogle()}
              />
            )}
          </div>

          {kokoroDownloadConfirm && (
            <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--accent)] space-y-3">
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-[var(--text)]">
                  Download Kokoro Neural Voice Model (~{KOKORO_APPROX_SIZE_MB} MB)?
                </p>
                <p className="text-[12px] text-[var(--text-soft)]">
                  Weights are fetched once from HuggingFace (`onnx-community/Kokoro-82M-v1.0-ONNX`, Apache-2.0) and cached offline in your browser. Nothing you read ever leaves your device.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => void handleEnableKokoro()}>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Download & Activate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setKokoroDownloadConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {downloadProgress && (
            <div className="p-3.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--text)] truncate">{downloadProgress.status}</span>
                <span className="tabular-nums font-medium">{downloadProgress.progress}%</span>
              </div>
              <div className="h-2 rounded-[var(--r-full)] bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${downloadProgress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Remote Server Configuration */}
          {FEATURES.remoteOpenAI && (
            <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                  Remote OpenAI-Compatible Endpoint
                </h4>
                <label className="flex items-center gap-2 text-[12px] text-[var(--text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remoteUseProxy}
                    onChange={(e) => setRemoteUseProxy(e.target.checked)}
                  />
                  Use /api/tts server proxy
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[var(--text-soft)]">Base URL</label>
                  <input
                    type="url"
                    value={prefs.remoteBaseUrl}
                    disabled={remoteUseProxy}
                    onChange={(e) => onUpdatePrefs({ remoteBaseUrl: e.target.value })}
                    placeholder="http://localhost:8880"
                    className="w-full min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)] disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[var(--text-soft)]">
                    API Key (memory-only by default)
                  </label>
                  <input
                    type="password"
                    value={prefs.remoteApiKey}
                    disabled={remoteUseProxy}
                    onChange={(e) => onUpdatePrefs({ remoteApiKey: e.target.value })}
                    placeholder="Optional Bearer token"
                    className="w-full min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)] disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <select
                    aria-label="Audio format"
                    value={prefs.remoteFormat}
                    onChange={(e) =>
                      onUpdatePrefs({
                        remoteFormat: e.target.value as PersistedReaderState['remoteFormat'],
                      })
                    }
                    className="min-h-[36px] px-2 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[12px]"
                  >
                    <option value="wav">WAV</option>
                    <option value="mp3">MP3</option>
                    <option value="opus">Opus</option>
                    <option value="flac">FLAC</option>
                  </select>

                  <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-soft)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.remoteRememberKey}
                      onChange={(e) => onUpdatePrefs({ remoteRememberKey: e.target.checked })}
                    />
                    Remember key locally
                  </label>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  loading={remoteTesting}
                  onClick={() => void handleTestRemote()}
                >
                  Test connection
                </Button>
              </div>

              {remoteTestResult && (
                <p
                  className={`text-[12px] ${
                    remoteTestResult.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {remoteTestResult.message}
                </p>
              )}
            </div>
          )}

          {/* Google Cloud Text-to-Speech Configuration & Consent */}
          {FEATURES.googleCloudTts && (
            <div
              className={`p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border space-y-3 ${
                googleConsentHighlight && !prefs.googleCloudConsentGranted
                  ? 'border-[var(--accent)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                  Google Cloud Text-to-Speech (/api/google-tts)
                </h4>
                <span className="text-[11px] font-mono text-[var(--text-soft)]">
                  Requires server GOOGLE_TTS_KEY
                </span>
              </div>

              <label className="flex items-start gap-2.5 p-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[12px] leading-[18px] text-[var(--text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.googleCloudConsentGranted}
                  onChange={(e) => {
                    const granted = e.target.checked;
                    setGoogleConsentHighlight(false);
                    onUpdatePrefs({ googleCloudConsentGranted: granted });
                    googleProvider.configure({ consentGranted: granted });
                    if (!granted && snapshot.providerId === 'google') {
                      void onSwitchProvider('webspeech');
                    }
                  }}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  I agree to send reading text over HTTPS to Google Cloud Text-to-Speech via{' '}
                  <code className="font-mono text-[11px]">/api/google-tts</code> when playing or
                  exporting MP3. Your text is never logged or stored on the server.
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[var(--text-soft)]">
                    Google Cloud Voice
                  </label>
                  <select
                    aria-label="Google Cloud voice"
                    value={prefs.googleVoice}
                    onChange={(e) => {
                      const nextVoice = e.target.value;
                      const nextLang = inferGoogleLanguageCode(nextVoice, prefs.googleLanguageCode);
                      onUpdatePrefs({ googleVoice: nextVoice, googleLanguageCode: nextLang });
                      googleProvider.configure({ voice: nextVoice, languageCode: nextLang });
                      if (snapshot.providerId === 'google') {
                        onSelectVoice(nextVoice);
                      }
                    }}
                    className="w-full min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)]"
                  >
                    {GOOGLE_CLOUD_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[var(--text-soft)]">
                    Language Code (BCP-47)
                  </label>
                  <input
                    type="text"
                    value={prefs.googleLanguageCode}
                    onChange={(e) => {
                      const nextLang = e.target.value;
                      onUpdatePrefs({ googleLanguageCode: nextLang });
                      googleProvider.configure({ languageCode: nextLang });
                    }}
                    placeholder="en-US"
                    className="w-full min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] font-mono text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={googleTesting}
                  onClick={() => void handleTestGoogle()}
                >
                  Test connection
                </Button>

                <Button
                  size="sm"
                  variant="primary"
                  loading={googleActivating}
                  disabled={!prefs.googleCloudConsentGranted}
                  onClick={() => void handleEnableGoogle()}
                >
                  {snapshot.providerId === 'google'
                    ? 'Google Cloud Active'
                    : 'Activate Google Cloud TTS'}
                </Button>
              </div>

              {googleTestResult && (
                <p
                  className={`text-[12px] ${
                    googleTestResult.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {googleTestResult.message}
                </p>
              )}
            </div>
          )}
        </Tabs.Content>

        {/* TAB 2: VOICES & TIMBRE */}
        <Tabs.Content value="voices" className="space-y-3">
          <input
            type="search"
            value={voiceFilter}
            onChange={(e) => setVoiceFilter(e.target.value)}
            placeholder="Filter voices by name or language code…"
            aria-label="Filter voices"
            className="w-full min-h-[40px] px-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text)]"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            {filteredVoices.map((voice) => {
              const selected = voice.id === snapshot.voiceId;
              return (
                <div
                  key={voice.id}
                  className={`p-3 rounded-[var(--r-sm)] border flex items-center justify-between gap-2 ${
                    selected
                      ? 'bg-[var(--surface-2)] border-[var(--accent)]'
                      : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectVoice(voice.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <p className="text-[13px] font-semibold text-[var(--text)] truncate">
                      {voice.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-soft)]">
                      {voice.lang} · {voice.badge ?? (voice.localService ? 'Local' : 'Network')}
                    </p>
                  </button>
                  <IconButton
                    label={`Preview ${voice.name}`}
                    onClick={() => onPreviewVoice(voice.id)}
                  >
                    <Play className="w-4 h-4" />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </Tabs.Content>

        {/* TAB 3: PRONUNCIATION DICTIONARY + LIVE SCRATCHPAD */}
        <Tabs.Content value="dictionary" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {LEXICON_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleApplyPreset(preset.id)}
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                ref={dictUploadRef}
                type="file"
                accept=".json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void f.text().then((raw) => {
                    try {
                      const parsed = JSON.parse(raw) as PronunciationRule[];
                      if (Array.isArray(parsed)) {
                        onUpdatePrefs({ pronunciationRules: parsed });
                        onNotify({ kind: 'success', message: `Imported ${parsed.length} rules.` });
                      }
                    } catch {
                      onNotify({ kind: 'error', message: 'Invalid JSON dictionary file.' });
                    }
                  });
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => dictUploadRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                Import
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={prefs.pronunciationRules.length === 0}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(prefs.pronunciationRules, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'pronunciation-dictionary.json';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export
              </Button>
            </div>
          </div>

          {/* Add Rule Form */}
          <form
            onSubmit={handleAddRule}
            className="p-3.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
          >
            <div className="sm:col-span-4 space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-soft)]">
                Original Word / Pattern
              </label>
              <input
                type="text"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                placeholder="e.g. Kokoro or \bSLM\b"
                className="w-full min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] font-mono text-[var(--text)]"
              />
            </div>
            <div className="sm:col-span-4 space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-soft)]">
                Spoken Equivalent
              </label>
              <input
                type="text"
                value={ruleReplacement}
                onChange={(e) => setRuleReplacement(e.target.value)}
                placeholder="e.g. koh-koh-roh"
                className="w-full min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)]"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-soft)]">Match Mode</label>
              <select
                value={ruleMatchMode}
                onChange={(e) => setRuleMatchMode(e.target.value as PronunciationMatchMode)}
                className="w-full min-h-[38px] px-2 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[12px] text-[var(--text)]"
              >
                <option value="case-insensitive">Case-Insensitive</option>
                <option value="exact">Exact Case</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" variant="primary" className="w-full">
                Add rule
              </Button>
            </div>
          </form>

          {/* Rules List */}
          {prefs.pronunciationRules.length === 0 ? (
            <p className="text-[13px] text-[var(--text-soft)] py-3 text-center">
              No custom pronunciation rules yet. Add one above or load a preset.
            </p>
          ) : (
            <div className="rounded-[var(--r-sm)] border border-[var(--border)] overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="bg-[var(--surface-2)] text-[11px] uppercase text-[var(--text-soft)] border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2 px-3">Pattern</th>
                    <th className="py-2 px-3">Spoken As</th>
                    <th className="py-2 px-3">Mode</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {prefs.pronunciationRules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="py-2 px-3 font-mono text-[12px] text-[var(--accent)]">
                        {rule.pattern}
                      </td>
                      <td className="py-2 px-3">{rule.replacement}</td>
                      <td className="py-2 px-3 text-[11px] text-[var(--text-soft)]">
                        {rule.matchMode ?? (rule.caseSensitive ? 'exact' : 'case-insensitive')}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onPreviewVoice(snapshot.voiceId, rule.replacement)}
                        >
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Test
                        </Button>
                        <IconButton
                          label={`Delete rule ${rule.pattern}`}
                          onClick={() =>
                            onUpdatePrefs({
                              pronunciationRules: prefs.pronunciationRules.filter(
                                (r) => r.id !== rule.id,
                              ),
                            })
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Live Scratchpad & Phonetic Tester */}
          <div className="p-3.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
                Live Scratchpad & Phonetic Tester
              </span>
              <span className="text-[11px] font-medium text-[var(--success)] tabular-nums">
                {scratchPreview.matchCount} {scratchPreview.matchCount === 1 ? 'rule' : 'rules'} matched
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea
                rows={3}
                value={scratchpadInput}
                onChange={(e) => setScratchpadInput(e.target.value)}
                aria-label="Scratchpad test text"
                className="w-full p-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)]"
              />
              <div className="p-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] leading-relaxed text-[var(--text)]">
                {scratchPreview.segments.map((seg, idx) =>
                  seg.matched ? (
                    <mark
                      key={idx}
                      className="bg-[var(--hl-sentence)] text-[var(--text)] px-1 py-0.5 rounded-[4px] font-medium"
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={idx}>{seg.text}</span>
                  ),
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onPreviewVoice(snapshot.voiceId, scratchPreview.rewritten)}
              >
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                Audition rewritten text
              </Button>
            </div>
          </div>
        </Tabs.Content>

        {/* TAB 4: ACOUSTICS */}
        <Tabs.Content value="cadence" className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between text-[13px]">
              <span>Playback Speed</span>
              <span className="tabular-nums font-semibold">{snapshot.rate.toFixed(2)}x</span>
            </div>
            <Slider
              value={snapshot.rate}
              min={0.5}
              max={3.0}
              step={0.05}
              onValueChange={onChangeRate}
              ariaLabel="Playback speed"
              ariaValueText={`${snapshot.rate.toFixed(2)}x speed`}
              formatTooltip={(v) => `${v.toFixed(2)}x`}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[13px]">
              <span>Pitch</span>
              <span className="tabular-nums font-semibold">{snapshot.pitch.toFixed(2)}</span>
            </div>
            <Slider
              value={snapshot.pitch}
              min={0.5}
              max={2.0}
              step={0.05}
              onValueChange={onChangePitch}
              ariaLabel="Voice pitch"
              ariaValueText={`Pitch ${snapshot.pitch.toFixed(2)}`}
              formatTooltip={(v) => v.toFixed(2)}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[13px]">
              <span>Master Volume</span>
              <span className="tabular-nums font-semibold">{Math.round(snapshot.volume * 100)}%</span>
            </div>
            <Slider
              value={snapshot.volume}
              min={0}
              max={1}
              step={0.05}
              onValueChange={onChangeVolume}
              ariaLabel="Master volume"
              ariaValueText={`${Math.round(snapshot.volume * 100)} percent`}
              formatTooltip={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </ModalDialog>
  );
}

function TabTrigger({
  value,
  icon,
  children,
}: {
  value: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium text-[var(--text-soft)] border-b-2 border-transparent data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--text)] whitespace-nowrap cursor-pointer"
    >
      {icon}
      {children}
    </Tabs.Trigger>
  );
}

function EngineCard({
  title,
  badge,
  description,
  active,
  onSelect,
  extra,
}: {
  title: string;
  badge: string;
  description: string;
  active: boolean;
  onSelect: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`p-4 rounded-[var(--r-md)] border text-left cursor-pointer transition-colors ${
        active
          ? 'bg-[var(--surface-2)] border-[var(--accent)]'
          : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold text-[var(--text)]">{title}</p>
        {active && <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />}
      </div>
      <span className="inline-block mt-1 px-2 py-0.5 rounded-[var(--r-full)] bg-[var(--surface)] border border-[var(--border)] text-[11px] font-medium text-[var(--text-soft)]">
        {badge}
      </span>
      <p className="text-[12px] leading-[18px] text-[var(--text-soft)] mt-2">{description}</p>
      {extra}
    </div>
  );
}
