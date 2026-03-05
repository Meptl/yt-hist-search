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

type ImportResponse = {
  parsed_entries: number;
  indexed_entries: number;
  csv_out: string;
  jsonl_out: string;
  index_dir: string;
};

function extractVideoUrl(text: string): string | null {
  const match = text.match(/Video URL:\s*(https?:\/\/\S+)/i);
  return match ? match[1] : null;
}

export function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
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

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setImportStatus('Choose your Google Takeout watch-history HTML file first.');
      return;
    }

    setImporting(true);
    setImportStatus(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('skip_index', 'false');

      const response = await fetch('/api/import-takeout', {
        method: 'POST',
        body: formData
      });
      const payload = (await response.json()) as ImportResponse | { detail: string };

      if (!response.ok) {
        const detail = 'detail' in payload ? payload.detail : 'Import request failed';
        throw new Error(detail);
      }

      const details = payload as ImportResponse;
      setImportStatus(
        `Imported ${details.parsed_entries} entries and indexed ${details.indexed_entries}.`
      );
    } catch (err) {
      setImportStatus(
        err instanceof Error ? err.message : 'Unexpected error while importing takeout'
      );
    } finally {
      setImporting(false);
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

        <form className="query-panel" onSubmit={onImport}>
          <label htmlFor="takeout-file">Takeout file</label>
          <input
            id="takeout-file"
            type="file"
            accept=".html,text/html"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <div className="controls">
            <button type="submit" disabled={importing}>
              {importing ? 'Importing and indexing...' : 'Import & Index'}
            </button>
            <span>{importStatus ?? 'Upload watch-history.html to build your local index.'}</span>
          </div>
        </form>

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
              <p>No results yet. Import your Takeout file above, then run a query.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
