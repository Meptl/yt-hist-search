import { useEffect, useState } from 'react';

import { useSettings } from './hooks/useSettings';
import { LandingPage } from './pages/LandingPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';

declare global {
  interface Window {
    ythist?: {
      pickTakeoutFile: () => Promise<string | null>;
    };
  }
}

type ImportResponse = {
  parsed_entries: number;
  indexed_entries: number;
  csv_out: string;
  index_dir: string;
};

type IndexStatusResponse = {
  index_ready: boolean;
  index_dir: string;
};

type ViewMode = 'search' | 'settings';

export function App() {
  const [checkingIndex, setCheckingIndex] = useState(true);
  const [indexReady, setIndexReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [lastImportedPath, setLastImportedPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('search');

  const {
    llmBackend,
    llmBackendOptions,
    settingsLoading,
    settingsSaving,
    settingsPath,
    settingsMessage,
    llmRouterCliWarning,
    setLlmBackend
  } = useSettings();

  useEffect(() => {
    let isActive = true;

    async function checkIndexStatus() {
      try {
        const response = await fetch('/api/index-status');
        const payload = (await response.json()) as IndexStatusResponse | { detail: string };

        if (!response.ok) {
          const detail = 'detail' in payload ? payload.detail : 'Failed to check index status';
          throw new Error(detail);
        }

        if (isActive) {
          setIndexReady((payload as IndexStatusResponse).index_ready);
        }
      } catch (err) {
        if (isActive) {
          setImportStatus(
            err instanceof Error ? err.message : 'Unexpected error while checking index status'
          );
          setIndexReady(false);
        }
      } finally {
        if (isActive) {
          setCheckingIndex(false);
        }
      }
    }

    void checkIndexStatus();

    return () => {
      isActive = false;
    };
  }, []);

  async function onPickAndImport() {
    if (!window.ythist?.pickTakeoutFile) {
      setImportStatus('Native file picker unavailable. Launch the UI via Electron.');
      return;
    }

    const pickedPath = await window.ythist.pickTakeoutFile();
    if (!pickedPath) {
      return;
    }

    setImporting(true);
    setImportStatus('Indexing started... this can take a few minutes.');

    try {
      const response = await fetch('/api/import-takeout-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          html_path: pickedPath,
          skip_index: false
        })
      });

      const payload = (await response.json()) as ImportResponse | { detail: string };
      if (!response.ok) {
        const detail = 'detail' in payload ? payload.detail : 'Import request failed';
        throw new Error(detail);
      }

      const details = payload as ImportResponse;
      setLastImportedPath(pickedPath);
      setImportStatus(
        `Imported ${details.parsed_entries} entries and indexed ${details.indexed_entries}.`
      );
      setIndexReady(true);
      setViewMode('search');
    } catch (err) {
      setImportStatus(
        err instanceof Error ? err.message : 'Unexpected error while importing takeout'
      );
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
        importStatus={importStatus}
        llmBackend={llmBackend}
        llmBackendOptions={llmBackendOptions}
        settingsLoading={settingsLoading}
        settingsSaving={settingsSaving}
        settingsPath={settingsPath}
        settingsMessage={settingsMessage}
        llmRouterCliWarning={llmRouterCliWarning}
        onSetLlmBackend={setLlmBackend}
        onPickAndImport={onPickAndImport}
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
        settingsPath={settingsPath}
        settingsMessage={settingsMessage}
        llmRouterCliWarning={llmRouterCliWarning}
        onSetLlmBackend={setLlmBackend}
        onBack={() => setViewMode('search')}
      />
    );
  }

  return (
    <SearchPage
      importStatus={importStatus}
      lastImportedPath={lastImportedPath}
      onOpenSettings={() => setViewMode('settings')}
    />
  );
}
