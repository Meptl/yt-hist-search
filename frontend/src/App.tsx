import { FormEvent, useMemo, useState } from 'react';

type SearchResponseItem = {
  score: number | null;
  file_path: string;
  text: string;
};

type SearchResponse = {
  query: string;
  results: SearchResponseItem[];
};

function extractVideoUrl(text: string): string | null {
  const match = text.match(/Video URL:\s*(https?:\/\/\S+)/i);
  return match ? match[1] : null;
}

export function App() {
  const [query, setQuery] = useState('videos about retrieval and embeddings');
  const [topK, setTopK] = useState(5);
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

  return (
    <div className="page">
      <div className="gradient" aria-hidden />
      <main className="app-shell">
        <header className="hero">
          <p className="kicker">Local-first YouTube intelligence</p>
          <h1>Search your watch history with semantic retrieval</h1>
          <p className="subtitle">
            This interface talks to your local FastAPI service. Import your Takeout file,
            then query naturally.
          </p>
        </header>

        <form className="query-panel" onSubmit={onSubmit}>
          <label htmlFor="query">Search query</label>
          <textarea
            id="query"
            rows={3}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
                return (
                  <li key={`${item.file_path}-${index}`} className="result-card">
                    <div className="card-head">
                      <strong>#{index + 1}</strong>
                      <span>
                        score {typeof item.score === 'number' ? item.score.toFixed(4) : 'n/a'}
                      </span>
                    </div>
                    <p>{item.text}</p>
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
              <p>
                No results yet. If this is your first run, import and index your Takeout
                file via CLI, then try a query.
              </p>
              <pre>{`ythist import-takeout watch-history.html\nythist serve`}</pre>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
