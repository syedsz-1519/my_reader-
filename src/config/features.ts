export interface FeatureFlags {
  kokoro: boolean;
  piper: boolean;
  remoteOpenAI: boolean;
  googleCloudTts: boolean;
  urlImport: boolean;
  pdfImport: boolean;
  ocrImport: boolean;
  docxImport: boolean;
  epubImport: boolean;
  audioExport: boolean;
  onDeviceSlm: boolean;
  supabaseSync: boolean;
  aiSummary: boolean;
}

export const FEATURES: FeatureFlags = {
  kokoro: true,
  piper: false, // Disabled by default: GPL-3.0 / mixed voice licenses & heavy WASM assets
  remoteOpenAI: true,
  googleCloudTts: true,
  urlImport: true,
  pdfImport: true,
  ocrImport: true,
  docxImport: true,
  epubImport: true,
  audioExport: true,
  onDeviceSlm: false, // Cluster C9 feature flag OFF by default until user opts in
  supabaseSync: false, // Cluster C11 opt-in cloud sync disabled by default
  aiSummary: false, // Cluster C11 opt-in Claude summary disabled by default
};
