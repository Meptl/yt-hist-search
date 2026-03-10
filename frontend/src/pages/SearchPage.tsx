import { FormEvent, KeyboardEvent, useState } from 'react';
import { Cog, Plus } from 'lucide-react';
import { YoutubeVideoCard } from '../components/YoutubeVideoCard';

type SearchResponseItem = {
  score: number | null;
  file_path: string;
  text: string;
  title?: string | null;
  channel_name?: string | null;
  video_id?: string | null;
  video_url?: string | null;
};

type SearchResponse = {
  query: string;
  errors?: string[];
  results: SearchResponseItem[];
};

type ErrorPayload = {
  detail?: unknown;
};

type SearchPageProps = {
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

function extractFieldValue(text: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'im'));
  return match?.[1]?.trim() || null;
}

export function SearchPage({ onOpenSettings }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResponseItem[]>([]);

  const hasResults = results.length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a query first.');
      setWarnings([]);
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const params = new URLSearchParams({
        q: trimmed
      });
      const response = await fetch(`/api/search?${params.toString()}`);
      const rawBody = await response.text();
      const rawMessage = rawBody.trim();
      let payload: SearchResponse | ErrorPayload | null = null;

      if (rawMessage) {
        try {
          payload = JSON.parse(rawMessage) as SearchResponse | ErrorPayload;
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        if (payload && 'detail' in payload && payload.detail) {
          const detail =
            typeof payload.detail === 'string'
              ? payload.detail
              : JSON.stringify(payload.detail, null, 2);
          throw new Error(detail);
        }

        if (rawMessage) {
          throw new Error(rawMessage);
        }

        throw new Error('Search request failed');
      }

      if (!payload || !('results' in payload) || !Array.isArray(payload.results)) {
        throw new Error(rawMessage || 'Unexpected response from search endpoint');
      }

      setWarnings(Array.isArray(payload.errors) ? payload.errors : []);
      setResults(payload.results);
    } catch (err) {
      setResults([]);
      setWarnings([]);
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
            <h1 className="app-title">yt-hist</h1>
            <div className="icon-actions">
              <button
                type="button"
                className="icon-button"
                aria-label="Import from file"
                title="Import from file"
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
            placeholder="videos about RAG and embeddings"
          />

          <div className="controls">
            <button type="submit" disabled={loading}>
              Search History
            </button>
          </div>
        </form>

        <section className="results-panel" aria-live="polite">
          {!loading && hasResults ? (
            <>
              {warnings.length > 0 ? (
                <div className="empty-state error-state">
                  <pre>{warnings.join('\n')}</pre>
                </div>
              ) : null}
              <ul className="results-list">
                {results.map((item, index) => {
                  const videoUrl = item.video_url ?? extractVideoUrl(item.text);
                  const thumbnailUrl = buildThumbnailUrl(item.video_id ?? null);
                  const decodedText = decodeHtmlEntities(item.text);
                  const fallbackTitle = extractFieldValue(decodedText, 'Title') ?? 'Untitled video';
                  const fallbackChannel =
                    extractFieldValue(decodedText, 'Channel') ?? 'Unknown channel';
                  return (
                    <YoutubeVideoCard
                      key={`${item.file_path}-${index}`}
                      item={item}
                      index={index}
                      videoUrl={videoUrl}
                      thumbnailUrl={thumbnailUrl}
                      fallbackTitle={fallbackTitle}
                      fallbackChannel={fallbackChannel}
                    />
                  );
                })}
              </ul>
            </>
          ) : !loading ? (
            <div className={`empty-state${error ? ' error-state' : ''}`}>
              {error ? (
                <pre>{error}</pre>
              ) : (
                <>
                  {warnings.length > 0 ? <pre>{warnings.join('\n')}</pre> : null}
                  <p>No results yet. Run a query to search your indexed history.</p>
                </>
              )}
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="bottom-loading-indicator" aria-live="polite" aria-label="Loading">
            <span className="loading-spinner" aria-hidden="true" />
          </div>
        ) : null}
      </main>
    </div>
  );
}
