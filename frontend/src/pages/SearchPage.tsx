import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';
import { Cog, Plus } from 'lucide-react';
import { YoutubeVideoCard } from '../components/YoutubeVideoCard';

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
            <div className="icon-actions">
              <button
                type="button"
                className="icon-button"
                aria-label="Import from file"
                title="Import from file"
                onClick={() => void onPickAndImport()}
                disabled={importing}
              >
                <Plus aria-hidden="true" focusable="false" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Open settings"
                title="Settings"
                onClick={onOpenSettings}
              >
                <Cog aria-hidden="true" focusable="false" />
              </button>
            </div>
          </div>
        </header>

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
                  <YoutubeVideoCard
                    key={`${item.file_path}-${index}`}
                    item={item}
                    index={index}
                    videoUrl={videoUrl}
                    thumbnailUrl={thumbnailUrl}
                    decodedText={decodedText}
                  />
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
