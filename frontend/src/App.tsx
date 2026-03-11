import { useEffect, useState } from 'react';

import { useSettings } from './hooks/useSettings';
import { ImportProgressPage } from './pages/ImportProgressPage';
import { LandingPage } from './pages/LandingPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';

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

type ValidateTakeoutResponse = {
  parsed_entries: number;
  deduped_entries: number;
  new_entries: number;
  already_indexed_entries: number;
};

type TakeoutValidationResult = {
  parsedEntries: number;
  dedupedEntries: number;
  newEntries: number;
  alreadyIndexedEntries: number;
};

type ImportTakeoutResponse = {
  parsed_entries: number;
  indexed_entries: number;
  csv_out: string;
  index_dir: string;
};

type ImportJobState = 'running' | 'completed' | 'failed';

type ImportTakeoutJobCreateResponse = {
  job_id: string;
  status: ImportJobState;
};

type ImportTakeoutJobStatusResponse = {
  job_id: string;
  status: ImportJobState;
  progress: number;
  messages: string[];
  result: ImportTakeoutResponse | null;
  error: ImportApiErrorDetail | null;
};

type ViewMode = 'search' | 'settings' | 'importProgress' | 'landing';

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
  const [viewMode, setViewMode] = useState<ViewMode>('search');
  const [landingOpenedFromSearch, setLandingOpenedFromSearch] = useState(false);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessages, setImportMessages] = useState<string[]>([]);
  const [importJobState, setImportJobState] = useState<ImportJobState>('running');

  const {
    llmBackend,
    llmBackendOptions,
    settingsLoading,
    settingsSaving,
    settingsMessage,
    llmRouterCliWarning,
    youtubeDataApiKey,
    youtubeDataApiKeyStatusMessage,
    youtubeDataApiKeyStatusTone,
    scoreThreshold,
    setLlmBackend,
    setYoutubeDataApiKey,
    setScoreThreshold
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

  useEffect(() => {
    if (!activeImportJobId) {
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;

    async function pollImportJobStatus() {
      try {
        const response = await fetch(`/api/import-takeout-jobs/${activeImportJobId}`);
        const payload = (await response.json()) as ImportTakeoutJobStatusResponse | { detail: unknown };
        if (!response.ok) {
          throw new Error('Failed to fetch import progress');
        }
        if (cancelled) {
          return;
        }

        const status = payload as ImportTakeoutJobStatusResponse;
        setImportProgress(status.progress);
        if (status.messages.length > 0) {
          setImportMessages((existingMessages) => {
            const combined = existingMessages.concat(status.messages);
            if (combined.length > 500) {
              return combined.slice(-500);
            }
            return combined;
          });
        }
        setImportJobState(status.status);

        if (status.status === 'completed') {
          setImporting(false);
          setActiveImportJobId(null);
          setIndexReady(true);
          setViewMode('search');
          setImportProgress(100);
          return;
        }

        if (status.status === 'failed') {
          setImporting(false);
          setImportError(
            parseImportError(
              {
                detail: status.error ?? {
                  message: 'Import failed'
                }
              },
              null,
              'Import failed'
            )
          );
          setViewMode('importProgress');
          return;
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setImporting(false);
        setImportError({
          message: err instanceof Error ? err.message : 'Import progress polling failed',
          stackTrace: err instanceof Error ? err.stack ?? null : null,
          statusCode: null
        });
        setImportJobState('failed');
        setViewMode('importProgress');
        return;
      }

      timerId = window.setTimeout(() => {
        void pollImportJobStatus();
      }, 500);
    }

    void pollImportJobStatus();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeImportJobId]);

  async function onImportTakeoutFile(file: File): Promise<boolean> {
    setImporting(true);
    setImportError(null);
    setActiveImportJobId(null);
    setImportProgress(0);
    setImportMessages([]);
    setImportJobState('running');
    setViewMode('importProgress');

    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('skip_index', 'false');

      const response = await fetch('/api/import-takeout-jobs', {
        method: 'POST',
        body: formData
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        setImportError(parseImportError(payload, response.status));
        setImporting(false);
        setViewMode('search');
        return false;
      }

      const job = payload as ImportTakeoutJobCreateResponse;
      setActiveImportJobId(job.job_id);
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
      setImporting(false);
      setImportJobState('failed');
      setViewMode('importProgress');
      return false;
    }
  }

  async function onValidateTakeoutFile(
    file: File
  ): Promise<TakeoutValidationResult | null> {
    setImportError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);

      const response = await fetch('/api/validate-takeout', {
        method: 'POST',
        body: formData
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        setImportError(parseImportError(payload, response.status, 'File validation failed'));
        return null;
      }

      const parsed = payload as ValidateTakeoutResponse;
      return {
        parsedEntries: parsed.parsed_entries,
        dedupedEntries: parsed.deduped_entries,
        newEntries: parsed.new_entries,
        alreadyIndexedEntries: parsed.already_indexed_entries
      };
    } catch (err) {
      console.error('Validate takeout failed', err);
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
      return null;
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

  if (importing || viewMode === 'importProgress') {
    return (
      <ImportProgressPage
        progress={importProgress}
        messages={importMessages}
        status={importJobState}
        importError={importError}
        onBack={() => {
          if (importing) {
            return;
          }
          setViewMode('search');
        }}
      />
    );
  }

  if (!indexReady || viewMode === 'landing') {
    const canReturnToSearch = indexReady && viewMode === 'landing' && landingOpenedFromSearch;
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
        youtubeDataApiKeyStatusMessage={youtubeDataApiKeyStatusMessage}
        youtubeDataApiKeyStatusTone={youtubeDataApiKeyStatusTone}
        importError={importError}
        onSetLlmBackend={setLlmBackend}
        onSetYoutubeDataApiKey={setYoutubeDataApiKey}
        onImportTakeoutFile={onImportTakeoutFile}
        onValidateTakeoutFile={onValidateTakeoutFile}
        allowBackToSearch={canReturnToSearch}
        onBackToSearch={() => {
          setLandingOpenedFromSearch(false);
          setViewMode('search');
        }}
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
        youtubeDataApiKeyStatusMessage={youtubeDataApiKeyStatusMessage}
        youtubeDataApiKeyStatusTone={youtubeDataApiKeyStatusTone}
        scoreThreshold={scoreThreshold}
        onSetLlmBackend={setLlmBackend}
        onSetYoutubeDataApiKey={setYoutubeDataApiKey}
        onSetScoreThreshold={setScoreThreshold}
        onBack={() => setViewMode('search')}
      />
    );
  }

  return (
    <SearchPage
      onOpenSettings={() => setViewMode('settings')}
      onOpenLanding={() => {
        setLandingOpenedFromSearch(true);
        setViewMode('landing');
      }}
    />
  );
}
