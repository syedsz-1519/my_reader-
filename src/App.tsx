import * as React from 'react';
import { HeaderBar, type ActiveWorkspaceView } from './components/HeaderBar';
import { InputWorkspace, type ImportedPayload } from './components/InputWorkspace';
import { LibrarySidebar } from './components/LibrarySidebar';
import { PlayerBar } from './components/PlayerBar';
import { ReaderStage } from './components/ReaderStage';
import { SettingsPanel } from './components/SettingsPanel';
import { ToastBanner, type ToastMessage } from './components/ui/Toast';
import { TooltipProvider } from './components/ui/Tooltip';
import type { VoiceLabTab } from './components/VoiceLabDialog';
import { FEATURES } from './config/features';

const VoiceLabDialog = React.lazy(() =>
  import('./components/VoiceLabDialog').then((m) => ({ default: m.VoiceLabDialog })),
);
const ShortcutsDialog = React.lazy(() =>
  import('./components/ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })),
);
const SlmToolsDialog = React.lazy(() =>
  import('./components/SlmToolsDialog').then((m) => ({ default: m.SlmToolsDialog })),
);
const StatsView = React.lazy(() =>
  import('./components/StatsView').then((m) => ({ default: m.StatsView })),
);
import {
  deleteHighlight,
  deleteLibraryDocument,
  listHighlightsForDocument,
  listLibraryDocuments,
  recordDocumentCompleted,
  recordListeningSeconds,
  saveHighlight,
  saveLibraryDocument,
  type HighlightColor,
  type LibraryDocument,
  type TextHighlight,
} from './db/libraryDb';
import {
  DEFAULT_SAMPLE_TEXT,
  loadPersistedState,
  savePersistedState,
  type PersistedReaderState,
  type ThemeMode,
} from './engine/storage';
import type { ProviderId, ProviderInitProgress } from './engine/types';
import { useMediaSession } from './hooks/useMediaSession';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWA';
import { useScrollDirection } from './hooks/useScrollDirection';
import { useSleepTimer } from './hooks/useSleepTimer';
import { useTts } from './hooks/useTts';
import { useVisualViewport } from './hooks/useVisualViewport';
import { useWakeLock } from './hooks/useWakeLock';
import { readFragmentSharePayload } from './importers/urlImporter';
import { GoogleCloudTtsProvider, inferGoogleLanguageCode } from './providers/googleTtsProvider';
import { KokoroProvider } from './providers/kokoroProvider';
import { PiperProvider } from './providers/piperProvider';
import { RemoteOpenAIProvider } from './providers/remoteProvider';
import { detectDocumentLanguage } from './utils/languageDetect';
import { applyPronunciationAndFilters } from './utils/textFilters';

const THEME_META_COLOR: Record<'light' | 'dark' | 'sepia', string> = {
  light: '#2F6F5E',
  dark: '#121413',
  sepia: '#F4ECD8',
};

export function App() {
  const { engine, snapshot, document: docStructure, boundary, clearFallback } = useTts();

  const [{ kokoro, piper, remote, google }] = React.useState(() => ({
    kokoro: new KokoroProvider(),
    piper: new PiperProvider(),
    remote: new RemoteOpenAIProvider(),
    google: new GoogleCloudTtsProvider(),
  }));

  const [prefs, setPrefs] = React.useState<PersistedReaderState>(() => loadPersistedState());
  const [rawText, setRawText] = React.useState<string>(() => prefs.lastText);
  const [docTitle, setDocTitle] = React.useState<string>('Calm Reading Space');
  const [docAuthor, setDocAuthor] = React.useState<string | undefined>(undefined);
  const [activeDocId, setActiveDocId] = React.useState<string | null>(() => prefs.activeDocumentId);

  const [documents, setDocuments] = React.useState<LibraryDocument[]>([]);
  const [highlights, setHighlights] = React.useState<TextHighlight[]>([]);
  const [activeView, setActiveView] = React.useState<ActiveWorkspaceView>('reader');
  const [editingOpen, setEditingOpen] = React.useState(false);

  const [libraryOpen, setLibraryOpen] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 && prefs.desktopLibraryOpen : false,
  );
  const [settingsOpen, setSettingsOpen] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 && prefs.desktopSettingsOpen : false,
  );

  const [voiceLabOpen, setVoiceLabOpen] = React.useState(false);
  const [voiceLabTab, setVoiceLabTab] = React.useState<VoiceLabTab>('runtime');
  const [slmDialogOpen, setSlmDialogOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [onDeviceSlmEnabled, setOnDeviceSlmEnabled] = React.useState(FEATURES.onDeviceSlm);
  const [kokoroDevice, setKokoroDevice] = React.useState<'wasm' | 'webgpu'>(() =>
    kokoro.getDevicePreference(),
  );

  const [autoDetectLang, setAutoDetectLang] = React.useState(true);
  const [detectedLang, setDetectedLang] = React.useState('en');
  const [toast, setToast] = React.useState<ToastMessage | null>(null);
  const [statsRefresh, setStatsRefresh] = React.useState(0);

  const liveAnnouncement =
    snapshot.state === 'speaking'
      ? 'Playing audio'
      : snapshot.state === 'paused'
        ? 'Audio paused'
        : snapshot.state === 'error' && snapshot.error
          ? `Error: ${snapshot.error.message}`
          : snapshot.state === 'idle' && snapshot.activeChunkIndex === 0
            ? 'Playback stopped'
            : '';

  const inputTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const edgeSwipeRef = React.useRef<{ x: number; y: number } | null>(null);

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const sleepTimer = useSleepTimer(
    engine,
    snapshot.state === 'speaking' || snapshot.state === 'loading',
  );
  const { keyboardOpen } = useVisualViewport();
  const { headerHidden } = useScrollDirection(
    snapshot.state === 'speaking' && !editingOpen && !libraryOpen && !settingsOpen,
  );

  useMediaSession(
    engine,
    docTitle,
    snapshot.state,
    snapshot.activeSentenceIndex,
    snapshot.totalSentences,
  );
  useWakeLock(snapshot.state === 'speaking');

  const notify = React.useCallback(
    (msg: { kind: 'info' | 'success' | 'error'; message: string; onRetry?: () => void }) => {
      setToast({
        id: `${Date.now()}_${Math.random()}`,
        kind: msg.kind,
        message: msg.message,
        onRetry: msg.onRetry,
      });
    },
    [],
  );

  const updatePrefs = React.useCallback((patch: Partial<PersistedReaderState>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePersistedState(patch);
      return next;
    });
  }, []);

  const handleToggleLibrary = React.useCallback(() => {
    setLibraryOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
        updatePrefs({ desktopLibraryOpen: next });
      }
      return next;
    });
  }, [updatePrefs]);

  const handleToggleSettings = React.useCallback(() => {
    setSettingsOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
        updatePrefs({ desktopSettingsOpen: next });
      }
      return next;
    });
  }, [updatePrefs]);

  // Register providers once
  React.useEffect(() => {
    if (FEATURES.kokoro) engine.registerProvider(kokoro);
    if (FEATURES.piper) engine.registerProvider(piper);
    if (FEATURES.remoteOpenAI) engine.registerProvider(remote);
    if (FEATURES.googleCloudTts) engine.registerProvider(google);
  }, [engine, kokoro, piper, remote, google]);

  // Keep speech preprocessor synced with pronunciation rules & filters
  React.useEffect(() => {
    engine.setSpeechPreprocessor((chunkText) =>
      applyPronunciationAndFilters(chunkText, prefs.pronunciationRules, prefs.filters),
    );
  }, [engine, prefs.pronunciationRules, prefs.filters]);

  // Sync remote & Google Cloud config
  React.useEffect(() => {
    remote.configure({
      baseUrl: prefs.remoteBaseUrl,
      apiKey: prefs.remoteApiKey || undefined,
      model: prefs.remoteModel,
      voice: prefs.remoteVoice,
      format: prefs.remoteFormat,
      useProxy: false,
    });
  }, [remote, prefs.remoteBaseUrl, prefs.remoteApiKey, prefs.remoteModel, prefs.remoteVoice, prefs.remoteFormat]);

  React.useEffect(() => {
    google.configure({
      consentGranted: prefs.googleCloudConsentGranted,
      languageCode: prefs.googleLanguageCode,
      voice: prefs.googleVoice,
    });
  }, [google, prefs.googleCloudConsentGranted, prefs.googleLanguageCode, prefs.googleVoice]);

  // Apply Theme, Typography & Accessibility tokens onto :root
  React.useEffect(() => {
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved: 'light' | 'dark' | 'sepia' =
        prefs.theme === 'system' ? (prefersDark ? 'dark' : 'light') : prefs.theme;
      const root = document.documentElement;
      root.setAttribute('data-theme', resolved);
      root.setAttribute('data-large-controls', String(Boolean(prefs.largeControls)));

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', THEME_META_COLOR[resolved]);
      }

      const fontVar =
        prefs.readerFont === 'inter'
          ? 'var(--font-ui)'
          : prefs.readerFont === 'opendyslexic'
            ? 'var(--font-dyslexic)'
            : 'var(--font-read)';
      root.style.setProperty('--font-reader', fontVar);
      root.style.setProperty('--read-size', `${prefs.readSize}px`);
      root.style.setProperty('--read-measure', `${prefs.readMeasure}ch`);
    };

    applyTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [prefs.theme, prefs.readerFont, prefs.readSize, prefs.readMeasure, prefs.largeControls]);

  // Left-edge swipe gesture to open Library drawer on <1024px viewports
  React.useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024 || libraryOpen) return;
      const t = e.touches[0];
      if (t && t.clientX <= 24) {
        edgeSwipeRef.current = { x: t.clientX, y: t.clientY };
      } else {
        edgeSwipeRef.current = null;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = edgeSwipeRef.current;
      edgeSwipeRef.current = null;
      if (!start || window.innerWidth >= 1024) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dx > 56 && dy < 40) {
        setLibraryOpen(true);
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [libraryOpen]);

  // Load saved library & handle Web Share Target / #text= bookmarklet on startup
  React.useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const list = await listLibraryDocuments();
      if (!mounted) return;
      setDocuments(list);

      const shared = readFragmentSharePayload();
      if (shared?.text) {
        const sharedDoc: LibraryDocument = {
          id: `doc_${Date.now()}`,
          title: shared.title || 'Shared article',
          text: shared.text,
          sourceType: 'url',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          progress: 0,
          chunkIndex: 0,
          charOffset: 0,
          totalWords: shared.text.trim().split(/\s+/).length,
        };
        await saveLibraryDocument(sharedDoc);
        const refreshed = await listLibraryDocuments();
        if (!mounted) return;
        setDocuments(refreshed);
        setActiveDocId(sharedDoc.id);
        setDocTitle(sharedDoc.title);
        setRawText(sharedDoc.text);
        engine.setText(sharedDoc.text, { resetPosition: true });
        updatePrefs({ activeDocumentId: sharedDoc.id, lastText: sharedDoc.text });
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }

      if (prefs.activeDocumentId) {
        const found = list.find((d) => d.id === prefs.activeDocumentId);
        if (found) {
          setDocTitle(found.title);
          setDocAuthor(found.author);
          setRawText(found.text);
          const hl = await listHighlightsForDocument(found.id);
          if (mounted) setHighlights(hl);
          return;
        }
      }

      if (list.length === 0 && prefs.lastText) {
        const starter: LibraryDocument = {
          id: 'doc_welcome',
          title: 'Welcome to TTS Reader',
          text: prefs.lastText,
          sourceType: 'sample',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          progress: 0,
          chunkIndex: 0,
          charOffset: 0,
          totalWords: prefs.lastText.trim().split(/\s+/).length,
        };
        await saveLibraryDocument(starter);
        const refreshed = await listLibraryDocuments();
        if (!mounted) return;
        setDocuments(refreshed);
        setActiveDocId(starter.id);
        setDocTitle(starter.title);
        updatePrefs({ activeDocumentId: starter.id });
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load highlights whenever activeDocId changes
  React.useEffect(() => {
    let active = true;
    const loader = activeDocId ? listHighlightsForDocument(activeDocId) : Promise.resolve([]);
    void loader.then((items) => {
      if (active) setHighlights(items);
    });
    return () => {
      active = false;
    };
  }, [activeDocId]);

  // Language detection + auto-pick saved voice per language
  React.useEffect(() => {
    if (!rawText.trim()) return;
    let cancelled = false;
    void detectDocumentLanguage(rawText).then((lang) => {
      if (cancelled) return;
      setDetectedLang(lang);
      if (autoDetectLang) {
        const remembered = prefs.perLanguageVoices[lang];
        const voiceMatch =
          (remembered && snapshot.voices.find((v) => v.id === remembered)) ||
          snapshot.voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
        engine.updateSettings({
          lang,
          ...(voiceMatch ? { voiceId: voiceMatch.id } : {}),
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawText, autoDetectLang, snapshot.voices.length]);

  // Surface automatic fallback notices via engine subscription
  React.useEffect(() => {
    return engine.on('fallback', (info) => {
      notify({
        kind: 'info',
        message: `Switched from ${info.from} to browser voice: ${info.reason}`,
      });
      clearFallback();
    });
  }, [engine, clearFallback, notify]);

  // Track listening seconds + document completion in local Dexie DB
  React.useEffect(() => {
    if (snapshot.state !== 'speaking') return;
    const interval = setInterval(() => {
      void recordListeningSeconds(10).then(() => setStatsRefresh((n) => n + 1));
    }, 10_000);
    return () => clearInterval(interval);
  }, [snapshot.state]);

  React.useEffect(() => {
    const offComplete = engine.on('complete', () => {
      void recordDocumentCompleted().then(() => setStatsRefresh((n) => n + 1));
    });
    return offComplete;
  }, [engine]);

  // Update active document progress in Dexie
  React.useEffect(() => {
    if (!activeDocId || snapshot.totalChunks === 0) return;
    const pct = Math.round(((snapshot.activeChunkIndex + 1) / snapshot.totalChunks) * 100);
    const current = documents.find((d) => d.id === activeDocId);
    if (!current || Math.abs(current.progress - pct) < 4) return;
    const updated: LibraryDocument = {
      ...current,
      progress: pct,
      chunkIndex: snapshot.activeChunkIndex,
      charOffset: snapshot.charOffset,
      updatedAt: Date.now(),
    };
    void saveLibraryDocument(updated).then(() => {
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    });
  }, [activeDocId, snapshot.activeChunkIndex, snapshot.charOffset, snapshot.totalChunks, documents]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        engine.togglePlay();
      } else if (e.key === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        engine.prevParagraph();
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        e.preventDefault();
        engine.nextParagraph();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        engine.prevSentence();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        engine.nextSentence();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        engine.updateSettings({ rate: Math.min(3.0, Number((snapshot.rate + 0.1).toFixed(2))) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        engine.updateSettings({ rate: Math.max(0.5, Number((snapshot.rate - 0.1).toFixed(2))) });
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        engine.updateSettings({ muted: !snapshot.muted });
      } else if (e.key === '/') {
        e.preventDefault();
        setActiveView('reader');
        setEditingOpen(true);
        setTimeout(() => inputTextareaRef.current?.focus(), 50);
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        const cycle: ThemeMode[] = ['light', 'sepia', 'dark'];
        const currentTheme = prefs.theme === 'system' ? 'light' : prefs.theme;
        const next = cycle[(cycle.indexOf(currentTheme) + 1) % cycle.length];
        updatePrefs({ theme: next });
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine, snapshot.rate, snapshot.muted, prefs.theme, updatePrefs]);

  const handleApplyPayload = async (payload: ImportedPayload) => {
    const newId = `doc_${Date.now()}`;
    const nextDoc: LibraryDocument = {
      id: newId,
      title: payload.title || 'Untitled reading',
      author: payload.author,
      text: payload.text,
      sourceType: payload.sourceType,
      sourceUrl: payload.sourceUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
      chunkIndex: 0,
      charOffset: 0,
      totalWords: payload.text.trim() ? payload.text.trim().split(/\s+/).length : 0,
      chapters: payload.chapters,
      activeChapterIndex: payload.chapters ? 0 : undefined,
    };
    await saveLibraryDocument(nextDoc);
    const list = await listLibraryDocuments();
    setDocuments(list);
    setActiveDocId(newId);
    setDocTitle(nextDoc.title);
    setDocAuthor(nextDoc.author);
    setRawText(nextDoc.text);
    engine.setText(nextDoc.text, { resetPosition: true });
    updatePrefs({ activeDocumentId: newId, lastText: nextDoc.text });
    setActiveView('reader');
  };

  const handleLoadSample = () => {
    void handleApplyPayload({
      title: 'Welcome to TTS Reader',
      text: DEFAULT_SAMPLE_TEXT,
      sourceType: 'sample',
    });
    setEditingOpen(false);
  };

  const handleSelectDocument = (doc: LibraryDocument) => {
    setActiveDocId(doc.id);
    setDocTitle(doc.title);
    setDocAuthor(doc.author);
    setRawText(doc.text);
    engine.setText(doc.text, { resetPosition: false });
    if (doc.chunkIndex > 0) {
      engine.seekToChunk(doc.chunkIndex);
    }
    updatePrefs({ activeDocumentId: doc.id, lastText: doc.text });
    setActiveView('reader');
    if (window.innerWidth < 1024) setLibraryOpen(false);
  };

  const handleSelectChapter = async (chapterIndex: number) => {
    const active = documents.find((d) => d.id === activeDocId);
    if (!active?.chapters?.[chapterIndex]) return;
    const ch = active.chapters[chapterIndex];
    const updated: LibraryDocument = {
      ...active,
      text: ch.text,
      activeChapterIndex: chapterIndex,
      chunkIndex: 0,
      progress: 0,
      updatedAt: Date.now(),
    };
    await saveLibraryDocument(updated);
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setRawText(ch.text);
    engine.setText(ch.text, { resetPosition: true });
    updatePrefs({ lastText: ch.text });
  };

  const handleSaveHighlight = async (
    sentenceIndex: number,
    text: string,
    color: HighlightColor,
    note = '',
  ) => {
    const targetDocId = activeDocId ?? 'doc_scratch';
    const item: TextHighlight = {
      id: `hl_${Date.now()}_${sentenceIndex}`,
      documentId: targetDocId,
      sentenceIndex,
      text,
      color,
      note,
      createdAt: Date.now(),
    };
    await saveHighlight(item);
    setHighlights(await listHighlightsForDocument(targetDocId));
    notify({ kind: 'success', message: `Saved highlight on sentence ${sentenceIndex + 1}.` });
  };

  const handleSelectVoice = (voiceId: string) => {
    engine.updateSettings({ voiceId });
    const voice = snapshot.voices.find((v) => v.id === voiceId);
    const langKey = (voice?.lang || detectedLang).split('-')[0].toLowerCase();
    updatePrefs({
      voiceId,
      ...(snapshot.providerId === 'google'
        ? {
            googleVoice: voiceId,
            googleLanguageCode: inferGoogleLanguageCode(voiceId, prefs.googleLanguageCode),
          }
        : {}),
      perLanguageVoices: {
        ...prefs.perLanguageVoices,
        [langKey]: voiceId,
      },
    });
  };

  const handleSwitchProvider = async (
    id: ProviderId,
    onProgress?: (p: ProviderInitProgress) => void,
  ): Promise<boolean> => {
    if (id === 'google' && !google.getConfig().consentGranted) {
      notify({
        kind: 'info',
        message: 'Enable privacy opt-in consent in Voice Lab before using Google Cloud TTS.',
      });
      setVoiceLabTab('runtime');
      setVoiceLabOpen(true);
      return false;
    }
    const ok = await engine.switchProvider(id, onProgress);
    if (ok) {
      updatePrefs({ providerId: id });
    }
    return ok;
  };

  const activeDocument = documents.find((d) => d.id === activeDocId) ?? null;
  const activeParagraphText =
    docStructure.paragraphs[snapshot.activeParagraphIndex]?.text ?? '';

  const spokenText = React.useMemo(
    () => applyPronunciationAndFilters(rawText, prefs.pronunciationRules, prefs.filters),
    [rawText, prefs.pronunciationRules, prefs.filters],
  );

  const activeProviderLabel =
    snapshot.providerId === 'kokoro'
      ? 'Kokoro Neural'
      : snapshot.providerId === 'piper'
        ? 'Piper WASM'
        : snapshot.providerId === 'remote'
          ? 'Remote Server'
          : snapshot.providerId === 'google'
            ? 'Google Cloud TTS'
            : 'Browser Speech';

  return (
    <TooltipProvider>
      <div className="min-h-[100dvh] flex flex-col bg-[var(--bg)] text-[var(--text)]">
        {/* Polite screen-reader state announcer */}
        <div className="sr-only" aria-live="polite" role="status">
          {liveAnnouncement}
        </div>

        <HeaderBar
          activeView={activeView}
          onChangeView={(v) => {
            setActiveView(v);
            if (v === 'documents') {
              setLibraryOpen(true);
            }
          }}
          theme={prefs.theme}
          onChangeTheme={(theme) => updatePrefs({ theme })}
          libraryOpen={libraryOpen}
          onToggleLibrary={handleToggleLibrary}
          settingsOpen={settingsOpen}
          onToggleSettings={handleToggleSettings}
          onOpenVoiceLab={() => {
            setVoiceLabTab('runtime');
            setVoiceLabOpen(true);
          }}
          onOpenSlmTools={() => setSlmDialogOpen(true)}
          isOnline={isOnline}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          onInstallPwa={() => void install()}
          activeProviderLabel={activeProviderLabel}
          headerHidden={headerHidden}
        />

        <div className="flex flex-1 min-w-0 relative">
          <LibrarySidebar
            open={libraryOpen}
            onClose={() => {
              setLibraryOpen(false);
              if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                updatePrefs({ desktopLibraryOpen: false });
              }
            }}
            documents={documents}
            activeDocumentId={activeDocId}
            onSelectDocument={handleSelectDocument}
            onNewDocument={() => {
              setActiveView('reader');
              setEditingOpen(true);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setLibraryOpen(false);
              }
              setTimeout(() => inputTextareaRef.current?.focus(), 50);
            }}
            onLoadSample={handleLoadSample}
            onRenameDocument={(id, nextTitle) => {
              const target = documents.find((d) => d.id === id);
              if (!target) return;
              const updated = { ...target, title: nextTitle, updatedAt: Date.now() };
              void saveLibraryDocument(updated).then(async () => {
                setDocuments(await listLibraryDocuments());
                if (id === activeDocId) setDocTitle(nextTitle);
              });
            }}
            onDuplicateDocument={(doc) => {
              const copy: LibraryDocument = {
                ...doc,
                id: `doc_${Date.now()}`,
                title: `${doc.title} (Copy)`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              void saveLibraryDocument(copy).then(async () => {
                setDocuments(await listLibraryDocuments());
                notify({ kind: 'success', message: 'Document duplicated.' });
              });
            }}
            onDeleteDocument={(id) => {
              void deleteLibraryDocument(id).then(async () => {
                const remaining = await listLibraryDocuments();
                setDocuments(remaining);
                if (id === activeDocId) {
                  const next = remaining[0];
                  if (next) handleSelectDocument(next);
                  else {
                    setActiveDocId(null);
                    setRawText('');
                    setDocTitle('TTS Reader');
                    engine.setText('', { resetPosition: true });
                  }
                }
              });
            }}
            activeDocument={activeDocument}
            onSelectChapter={(idx) => void handleSelectChapter(idx)}
            highlights={highlights}
            onJumpToSentence={(sIdx) => {
              setActiveView('reader');
              engine.seekToSentence(sIdx);
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setLibraryOpen(false);
              }
            }}
            onUpdateHighlightNote={(id, note) => {
              const hl = highlights.find((h) => h.id === id);
              if (!hl) return;
              void saveHighlight({ ...hl, note }).then(async () => {
                if (activeDocId) setHighlights(await listHighlightsForDocument(activeDocId));
              });
            }}
            onDeleteHighlight={(id) => {
              void deleteHighlight(id).then(async () => {
                if (activeDocId) setHighlights(await listHighlightsForDocument(activeDocId));
              });
            }}
          />

          {activeView === 'stats' ? (
            <div className="flex-1 min-w-0">
              <React.Suspense
                fallback={
                  <div className="p-8 text-[13px] text-[var(--text-soft)]">Loading statistics…</div>
                }
              >
                <StatsView refreshSignal={statsRefresh} />
              </React.Suspense>
            </div>
          ) : (
            <ReaderStage
              title={docTitle}
              author={docAuthor}
              document={docStructure}
              snapshot={snapshot}
              boundary={boundary}
              followAlong={prefs.followAlong}
              onToggleFollowAlong={() => updatePrefs({ followAlong: !prefs.followAlong })}
              focusMode={prefs.focusMode}
              onToggleFocusMode={() => updatePrefs({ focusMode: !prefs.focusMode })}
              readingRuler={prefs.readingRuler}
              onToggleReadingRuler={() => updatePrefs({ readingRuler: !prefs.readingRuler })}
              highlights={highlights}
              onSaveHighlight={(sIdx, text, color, note) =>
                void handleSaveHighlight(sIdx, text, color, note)
              }
              onSeekToSentence={(sIdx) => engine.seekToSentence(sIdx)}
              onPlaySentence={(sIdx) => {
                engine.seekToSentence(sIdx);
                void engine.play(docStructure.sentences[sIdx]?.firstChunkIndex ?? 0);
              }}
              onRetry={() => engine.retry()}
              onSwitchToKokoro={() => {
                setVoiceLabTab('runtime');
                setVoiceLabOpen(true);
              }}
              onOpenInputEditor={() => setEditingOpen((e) => !e)}
              editingOpen={editingOpen}
              onLoadSample={handleLoadSample}
              onOpenSlmTools={() => setSlmDialogOpen(true)}
              tourCompleted={prefs.tourCompleted}
              onCompleteTour={() => updatePrefs({ tourCompleted: true })}
              inputSlot={
                <InputWorkspace
                  text={rawText}
                  title={docTitle}
                  onTitleChange={setDocTitle}
                  onApplyText={(payload) => void handleApplyPayload(payload)}
                  onLoadSample={handleLoadSample}
                  onNotify={notify}
                  textareaRef={inputTextareaRef}
                  onDoneEditing={() => setEditingOpen(false)}
                />
              }
            />
          )}

          <SettingsPanel
            open={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              if (typeof window !== 'undefined' && window.innerWidth >= 1280) {
                updatePrefs({ desktopSettingsOpen: false });
              }
            }}
            snapshot={snapshot}
            activeProvider={engine.getActiveProvider()}
            prefs={prefs}
            detectedLang={detectedLang}
            autoDetectLang={autoDetectLang}
            onToggleAutoDetectLang={() => setAutoDetectLang((v) => !v)}
            onUpdatePrefs={updatePrefs}
            onChangeRate={(rate) => engine.updateSettings({ rate })}
            onChangePitch={(pitch) => engine.updateSettings({ pitch })}
            onChangeVolume={(volume) => engine.updateSettings({ volume, muted: volume === 0 })}
            onSelectVoice={handleSelectVoice}
            onPreviewVoice={(voiceId) => void engine.previewVoice(voiceId)}
            onOpenVoiceLab={(tab) => {
              setVoiceLabTab(tab ?? 'runtime');
              setVoiceLabOpen(true);
            }}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onNotify={notify}
            spokenText={spokenText}
            documentTitle={docTitle}
            onDeviceSlmEnabled={onDeviceSlmEnabled}
            onToggleOnDeviceSlm={(enabled) => setOnDeviceSlmEnabled(enabled)}
            isInstallable={isInstallable}
            isInstalled={isInstalled}
            isIOS={isIOS}
            onInstallPwa={() => void install()}
          />
        </div>

        <PlayerBar
          title={docTitle}
          snapshot={snapshot}
          totalChars={docStructure.totalChars}
          onTogglePlay={() => engine.togglePlay()}
          onStop={() => engine.stop()}
          onPrevSentence={() => engine.prevSentence()}
          onNextSentence={() => engine.nextSentence()}
          onSkipSeconds={(delta) => engine.skipBySeconds(delta)}
          onSeekChunk={(chunkIdx) => engine.seekToChunk(chunkIdx)}
          onChangeRate={(rate) => engine.updateSettings({ rate })}
          onToggleMute={() => engine.updateSettings({ muted: !snapshot.muted })}
          onChangeVolume={(volume) => engine.updateSettings({ volume, muted: volume === 0 })}
          sleepMode={sleepTimer.mode}
          sleepRemainingSec={sleepTimer.remainingSeconds}
          onSelectSleepTimer={sleepTimer.selectTimer}
          onOpenVoiceLab={() => {
            setVoiceLabTab('voices');
            setVoiceLabOpen(true);
          }}
          onToggleSettings={handleToggleSettings}
          hiddenWhileTyping={keyboardOpen}
        />

        <React.Suspense fallback={null}>
          {voiceLabOpen && (
            <VoiceLabDialog
              open={voiceLabOpen}
              onOpenChange={setVoiceLabOpen}
              activeTab={voiceLabTab}
              onTabChange={setVoiceLabTab}
              snapshot={snapshot}
              prefs={prefs}
              onUpdatePrefs={updatePrefs}
              onSwitchProvider={handleSwitchProvider}
              onSelectVoice={handleSelectVoice}
              onPreviewVoice={(voiceId, sample) => void engine.previewVoice(voiceId, sample)}
              onChangeRate={(rate) => engine.updateSettings({ rate })}
              onChangePitch={(pitch) => engine.updateSettings({ pitch })}
              onChangeVolume={(volume) => engine.updateSettings({ volume, muted: volume === 0 })}
              kokoroDevice={kokoroDevice}
              onChangeKokoroDevice={(device) => {
                setKokoroDevice(device);
                kokoro.setDevicePreference(device);
              }}
              remoteProvider={remote}
              googleProvider={google}
              onNotify={notify}
            />
          )}

          {slmDialogOpen && (
            <SlmToolsDialog
              open={slmDialogOpen}
              onOpenChange={setSlmDialogOpen}
              slmEnabled={onDeviceSlmEnabled}
              onEnableSlm={() => setOnDeviceSlmEnabled(true)}
              text={rawText}
              activeParagraphText={activeParagraphText}
              onApplyCleanedText={(cleaned) => {
                setRawText(cleaned);
                engine.setText(cleaned, { resetPosition: true });
                updatePrefs({ lastText: cleaned });
              }}
              onNotify={notify}
            />
          )}

          {shortcutsOpen && (
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          )}
        </React.Suspense>

        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </TooltipProvider>
  );
}
