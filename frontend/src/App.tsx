import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';

declare global {
  interface Window {
    ythist?: {
      pickTakeoutFile: () => Promise<string | null>;
    };
  }
}

type SearchResponseItem = {
  score: number | null;
  file_path: string;
  text: string;
};

type SearchResponse = {
  query: string;
  results: SearchResponseItem[];
};

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

function extractVideoUrl(text: string): string | null {
  const match = text.match(/Video URL:\s*(https?:\/\/\S+)/i);
  return match ? match[1] : null;
}

function decodeHtmlEntities(text: string): string {
  if (typeof window === 'undefined' || !window.document) {
    return text;
  }

  const textarea = window.document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

export function App() {
  const [checkingIndex, setCheckingIndex] = useState(true);
  const [indexReady, setIndexReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [lastImportedPath, setLastImportedPath] = useState<string | null>(null);

  const [query, setQuery] = useState('videos about retrieval and embeddings');
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponseItem[]>([]);

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

  const hasResults = results.length > 0;

  const summary = useMemo(() => {
    if (loading) return 'Searching your history...';
    if (error) return error;
    if (!hasResults) return 'Run a query to search your indexed watch history.';
    return `${results.length} results`;
  }, [error, hasResults, loading, results.length]);

  async function onPickAndImport() {
    if (!window.ythist?.pickTakeoutFile) {
      setImportStatus('Native file picker unavailable. Launch the UI via Electron.');
      return;
    }

    const pickedPath = await window.ythist.pickTakeoutFile();
    if (!pickedPath) {
      setImportStatus('Import canceled.');
      return;
    }

    setImporting(true);
    setImportStatus('Indexing started... this can take a few minutes.');
    setError(null);

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
    } catch (err) {
      setImportStatus(
        err instanceof Error ? err.message : 'Unexpected error while importing takeout'
      );
    } finally {
      setImporting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a query first.');
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: trimmed, top_k: String(topK) });
      const response = await fetch(`/api/search?${params.toString()}`);
      const payload = (await response.json()) as SearchResponse | { detail: string };

      if (!response.ok) {
        const detail = 'detail' in payload ? payload.detail : 'Search request failed';
        throw new Error(detail);
      }

      setResults((payload as SearchResponse).results);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Unexpected error while searching');
    } finally {
      setLoading(false);
    }
  }

  function onQueryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (checkingIndex) {
    return (
      <div className="page">
        <div className="gradient" aria-hidden />
        <main className="app-shell">
          <section className="landing-panel">
            <p className="kicker">Local-first YouTube intelligence</p>
            <h1>Checking index status...</h1>
          </section>
        </main>
      </div>
    );
  }

  if (!indexReady) {
    return (
      <div className="page">
        <div className="gradient" aria-hidden />
        <main className="app-shell">
          <section className="landing-panel">
            <p className="kicker">Local-first YouTube intelligence</p>
            <h1>Import your Takeout history to begin</h1>
            <p className="subtitle">
              Select your Google Takeout <code>watch-history.html</code> file to start embedding
              and indexing.
            </p>
            <button type="button" onClick={() => void onPickAndImport()} disabled={importing}>
              {importing ? 'Importing and indexing...' : 'Choose watch-history.html'}
            </button>
            <p className="status-line">{importStatus ?? 'No index detected yet.'}</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="gradient" aria-hidden />
      <main className="app-shell">
        <header className="hero">
          <p className="kicker">Local-first YouTube intelligence</p>
          <h1>Search your watch history with semantic retrieval</h1>
          <p className="subtitle">This interface talks to your local FastAPI service.</p>
          {importStatus ? <p className="status-line">{importStatus}</p> : null}
          {lastImportedPath ? <p className="status-line mono">{lastImportedPath}</p> : null}
        </header>

        <div className="query-panel">
          <div className="controls">
            <button type="button" onClick={() => void onPickAndImport()} disabled={importing}>
              {importing ? 'Importing and indexing...' : 'Re-import from file'}
            </button>
          </div>
        </div>

        <form className="query-panel" onSubmit={onSubmit}>
          <label htmlFor="query">Search query</label>
          <textarea
            id="query"
            rows={3}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onQueryKeyDown}
            placeholder="e.g. tutorials I watched about sqlite indexing"
          />

          <div className="controls">
            <label htmlFor="top-k">Top K: {topK}</label>
            <input
              id="top-k"
              type="range"
              min={1}
              max={20}
              value={topK}
              onChange={(event) => setTopK(Number(event.target.value))}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Search History'}
            </button>
          </div>
        </form>

        <section className="results-panel" aria-live="polite">
          <div className="results-header">
            <h2>Results</h2>
            <span>{summary}</span>
          </div>

          {hasResults ? (
            <ul className="results-list">
              {results.map((item, index) => {
                const videoUrl = extractVideoUrl(item.text);
                const decodedText = decodeHtmlEntities(item.text);
                return (
                  <li key={`${item.file_path}-${index}`} className="result-card">
                    <div className="card-head">
                      <strong>#{index + 1}</strong>
                      <span>
                        score {typeof item.score === 'number' ? item.score.toFixed(4) : 'n/a'}
                      </span>
                    </div>
                    <p>{decodedText}</p>
                    <div className="card-foot">
                      <code>{item.file_path}</code>
                      {videoUrl ? (
                        <a href={videoUrl} target="_blank" rel="noreferrer">
                          Open video
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <p>No results yet. Run a query to search your indexed history.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
