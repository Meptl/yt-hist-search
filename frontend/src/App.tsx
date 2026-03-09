import { useEffect, useState } from 'react';

import { useSettings } from './hooks/useSettings';
import { LandingPage } from './pages/LandingPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';

type ImportResponse = {
  parsed_entries: number;
  indexed_entries: number;
  csv_out: string;
  index_dir: string;
};

type ImportApiErrorDetail = {
  message?: string;
  stack_trace?: string | null;
};

type ImportErrorDetails = {
  message: string;
  stackTrace: string | null;
  statusCode: number | null;
};

type IndexStatusResponse = {
  index_ready: boolean;
  index_dir: string;
};

type ViewMode = 'search' | 'settings';

function parseImportError(
  payload: unknown,
  statusCode: number | null,
  fallbackMessage = 'Import request failed'
): ImportErrorDetails {
  const fallback: ImportErrorDetails = {
    message: fallbackMessage,
    stackTrace: null,
    statusCode
  };

  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') {
    return {
      message: detail,
      stackTrace: null,
      statusCode
    };
  }

  if (detail && typeof detail === 'object') {
    const details = detail as ImportApiErrorDetail;
    if (typeof details.message === 'string' && details.message.trim().length > 0) {
      return {
        message: details.message,
        stackTrace: typeof details.stack_trace === 'string' ? details.stack_trace : null,
        statusCode
      };
    }
  }

  return fallback;
}

export function App() {
  const [checkingIndex, setCheckingIndex] = useState(true);
  const [indexReady, setIndexReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<ImportErrorDetails | null>(null);
  const [lastImportedPath, setLastImportedPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('search');

  const {
    llmBackend,
    llmBackendOptions,
    settingsLoading,
    settingsSaving,
    settingsMessage,
    llmRouterCliWarning,
    youtubeDataApiKey,
    setLlmBackend,
    setYoutubeDataApiKey
  } = useSettings();

  useEffect(() => {
    let isActive = true;
    const mountTime = performance.now();
    console.info(
      `[timing] App mounted at ${new Date().toISOString()} (perf=${mountTime.toFixed(2)}ms)`
    );

    async function checkIndexStatus() {
      const requestStarted = performance.now();
      console.info(
        `[timing] /api/index-status fetch start at ${new Date().toISOString()} (+${(
          requestStarted - mountTime
        ).toFixed(2)}ms since App mount)`
      );
      try {
        const response = await fetch('/api/index-status');
        const payload = (await response.json()) as IndexStatusResponse | { detail: string };
        const responseTime = performance.now();
        console.info(
          `[timing] /api/index-status fetch complete status=${response.status} duration=${(
            responseTime - requestStarted
          ).toFixed(2)}ms`
        );

        if (!response.ok) {
          const detail = 'detail' in payload ? payload.detail : 'Failed to check index status';
          throw new Error(detail);
        }

        if (isActive) {
          setIndexReady((payload as IndexStatusResponse).index_ready);
        }
      } catch (err) {
        if (isActive) {
          console.error('Failed to check index status', err);
          setIndexReady(false);
        }
      } finally {
        if (isActive) {
          setCheckingIndex(false);
          console.info(
            `[timing] checkingIndex=false at ${new Date().toISOString()} (+${(
              performance.now() - mountTime
            ).toFixed(2)}ms since App mount)`
          );
        }
      }
    }

    void checkIndexStatus();

    return () => {
      isActive = false;
    };
  }, []);

  async function onImportTakeoutFile(file: File): Promise<boolean> {
    setImporting(true);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('skip_index', 'false');

      const response = await fetch('/api/import-takeout', {
        method: 'POST',
        body: formData
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        setImportError(parseImportError(payload, response.status));
        return false;
      }

      const details = payload as ImportResponse;
      setLastImportedPath(file.name);
      setIndexReady(true);
      setViewMode('search');
      return true;
    } catch (err) {
      console.error('Import takeout failed', err);
      if (err instanceof Error && err.message.trim().length > 0) {
        setImportError({
          message: err.message,
          stackTrace: err.stack ?? null,
          statusCode: null
        });
      } else {
        setImportError({
          message: 'That file does not look like a Google Takeout watch history file.',
          stackTrace: null,
          statusCode: null
        });
      }
      return false;
    } finally {
      setImporting(false);
    }
  }

  if (checkingIndex) {
    return (
      <div className="page">
        <main className="app-shell">
          <header className="hero">
            <div className="hero-top">
              <h1 className="app-title">yt-hist</h1>
            </div>
          </header>
          <section className="landing-panel">
            <h1>Checking index status...</h1>
          </section>
        </main>
      </div>
    );
  }

  if (!indexReady) {
    return (
      <LandingPage
        importing={importing}
        llmBackend={llmBackend}
        llmBackendOptions={llmBackendOptions}
        settingsLoading={settingsLoading}
        settingsSaving={settingsSaving}
        settingsMessage={settingsMessage}
        llmRouterCliWarning={llmRouterCliWarning}
        youtubeDataApiKey={youtubeDataApiKey}
        importError={importError}
        onSetLlmBackend={setLlmBackend}
        onSetYoutubeDataApiKey={setYoutubeDataApiKey}
        onImportTakeoutFile={onImportTakeoutFile}
      />
    );
  }

  if (viewMode === 'settings') {
    return (
      <SettingsPage
        llmBackend={llmBackend}
        llmBackendOptions={llmBackendOptions}
        settingsLoading={settingsLoading}
        settingsSaving={settingsSaving}
        settingsMessage={settingsMessage}
        llmRouterCliWarning={llmRouterCliWarning}
        youtubeDataApiKey={youtubeDataApiKey}
        onSetLlmBackend={setLlmBackend}
        onSetYoutubeDataApiKey={setYoutubeDataApiKey}
        onBack={() => setViewMode('search')}
      />
    );
  }

  return (
    <SearchPage
      lastImportedPath={lastImportedPath}
      onOpenSettings={() => setViewMode('settings')}
    />
  );
}
