import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';

type SearchResponseItem = {
  score: number | null;
  file_path: string;
  text: string;
  video_id?: string | null;
  video_url?: string | null;
};

type SearchResponse = {
  query: string;
  results: SearchResponseItem[];
};

type SearchPageProps = {
  importing: boolean;
  importStatus: string | null;
  lastImportedPath: string | null;
  onPickAndImport: () => Promise<void>;
  onOpenSettings: () => void;
};

function extractVideoUrl(text: string): string | null {
  const match = text.match(/Video URL:\s*(https?:\/\/\S+)/i);
  return match ? match[1] : null;
}

function buildThumbnailUrl(videoId: string | null): string | null {
  if (!videoId) {
    return null;
  }

  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function decodeHtmlEntities(text: string): string {
  if (typeof window === 'undefined' || !window.document) {
    return text;
  }

  const textarea = window.document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

export function SearchPage({
  importing,
  importStatus,
  lastImportedPath,
  onPickAndImport,
  onOpenSettings
}: SearchPageProps) {
  const [query, setQuery] = useState('videos about retrieval and embeddings');
  const [scoreThreshold, setScoreThreshold] = useState(0.55);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponseItem[]>([]);

  const hasResults = results.length > 0;

  const summary = useMemo(() => {
    if (loading) return 'Searching your history...';
    if (error) return error;
    if (!hasResults) return 'Run a query to search your indexed watch history.';
    return `${results.length} results`;
  }, [error, hasResults, loading, results.length]);

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
      const params = new URLSearchParams({
        q: trimmed,
        score_threshold: String(scoreThreshold)
      });
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

  return (
    <div className="page">
      <div className="gradient" aria-hidden />
      <main className="app-shell">
        <header className="hero">
          <div className="hero-top">
            <div>
              <p className="kicker">Local-first YouTube intelligence</p>
              <h1>Search your watch history with semantic retrieval</h1>
              <p className="subtitle">This interface talks to your local FastAPI service.</p>
              {importStatus ? <p className="status-line">{importStatus}</p> : null}
              {lastImportedPath ? <p className="status-line mono">{lastImportedPath}</p> : null}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Open settings"
              title="Settings"
              onClick={onOpenSettings}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75A3.75 3.75 0 1 0 12 8.25ZM21 12L18.82 13.26L18.85 15.78L16.32 16.31L15.06 18.5L12.54 17.05L10.02 18.5L8.76 16.31L6.23 15.78L6.26 13.26L4.08 12L6.26 10.74L6.23 8.22L8.76 7.69L10.02 5.5L12.54 6.95L15.06 5.5L16.32 7.69L18.85 8.22L18.82 10.74L21 12Z" />
              </svg>
            </button>
          </div>
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
            <label htmlFor="score-threshold">Score threshold: {scoreThreshold.toFixed(2)}</label>
            <input
              id="score-threshold"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={scoreThreshold}
              onChange={(event) => setScoreThreshold(Number(event.target.value))}
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
                const videoUrl = item.video_url ?? extractVideoUrl(item.text);
                const thumbnailUrl = buildThumbnailUrl(item.video_id ?? null);
                const decodedText = decodeHtmlEntities(item.text);
                return (
                  <li key={`${item.file_path}-${index}`} className="result-card">
                    {thumbnailUrl ? (
                      <a
                        href={videoUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="thumb-link"
                        aria-label={`Open video result ${index + 1}`}
                      >
                        <img
                          src={thumbnailUrl}
                          alt={`YouTube thumbnail for result ${index + 1}`}
                          className="result-thumb"
                          loading="lazy"
                          decoding="async"
                        />
                      </a>
                    ) : null}
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
