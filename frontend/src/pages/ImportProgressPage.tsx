import { useEffect, useRef, useState } from 'react';

type ImportErrorDetails = {
  message: string;
  stackTrace: string | null;
  statusCode: number | null;
};

type ImportJobState = 'running' | 'completed' | 'failed';

type ImportProgressPageProps = {
  progress: number;
  messages: string[];
  status: ImportJobState;
  importError: ImportErrorDetails | null;
  onBack: () => void;
};

export function ImportProgressPage({
  progress,
  messages,
  status,
  importError,
  onBack
}: ImportProgressPageProps) {
  const logRef = useRef<HTMLPreElement | null>(null);
  const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const title =
    status === 'failed'
      ? 'Import failed'
      : status === 'completed'
        ? 'Import completed'
        : 'Importing and indexing...';

  useEffect(() => {
    const logElement = logRef.current;
    if (!logElement) {
      return;
    }

    if (shouldStickToBottom) {
      logElement.scrollTop = logElement.scrollHeight;
    }
  }, [messages, shouldStickToBottom]);

  function handleLogScroll() {
    const logElement = logRef.current;
    if (!logElement) {
      return;
    }

    const distanceFromBottom =
      logElement.scrollHeight - logElement.clientHeight - logElement.scrollTop;
    const nextShouldStickToBottom = distanceFromBottom <= 8;
    setShouldStickToBottom((currentValue) =>
      currentValue === nextShouldStickToBottom ? currentValue : nextShouldStickToBottom
    );
  }

  return (
    <div className="page">
      <main className="app-shell import-progress-shell">
        <section className="import-progress-panel">
          <h1>{title}</h1>
          <div
            className="import-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(clampedProgress.toFixed(0))}
          >
            <div
              className="import-progress-fill"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <pre
            ref={logRef}
            className="import-progress-log"
            aria-live="polite"
            onScroll={handleLogScroll}
          >
            {messages.length > 0 ? messages.join('\n') : 'Waiting for backend output...'}
          </pre>
          {importError ? (
            <div className="import-progress-error" role="status">
              <p className="import-error-message">{importError.message}</p>
              {importError.statusCode ? (
                <p className="status-line mono">HTTP {importError.statusCode}</p>
              ) : null}
              {importError.stackTrace ? <pre>{importError.stackTrace}</pre> : null}
            </div>
          ) : null}
          {status === 'failed' ? (
            <button type="button" className="floating-import-button" onClick={onBack}>
              Back to import
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
