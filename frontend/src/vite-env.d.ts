/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_API_TIMEOUT: string;
  readonly VITE_AUTH_STORAGE_KEY: string;
  /** Sub-folder base path for the app, e.g. /umis  (no trailing slash). Leave blank in dev. */
  readonly VITE_BASE_PATH: string;
  readonly VITE_API_DOCS_URL: string;
}
