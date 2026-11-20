export interface FeatureFlags {
  kokoro: boolean;
  piper: boolean;
  remoteOpenAI: boolean;
  urlImport: boolean;
  pdfImport: boolean;
  ocrImport: boolean;
  docxImport: boolean;
  epubImport: boolean;
  audioExport: boolean;
  supabaseSync: boolean;
  aiSummary: boolean;
}

export const FEATURES: FeatureFlags = {
  kokoro: true,
  piper: false, // Disabled by default due to GPL-3.0 / mixed model licenses & heavy WASM assets
  remoteOpenAI: true,
  urlImport: true,
  pdfImport: true,
  ocrImport: true,
  docxImport: true,
  epubImport: true,
  audioExport: true,
  supabaseSync: false, // Opt-in cloud sync (Phase H) disabled by default
  aiSummary: false, // Opt-in Claude summary (Phase H) disabled by default
};
