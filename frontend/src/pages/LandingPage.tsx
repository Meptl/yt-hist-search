import { useRef, useState, type DragEvent } from 'react';

import { LlmBackendField } from '../components/LlmBackendField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection, type YouTubeApiKeyStatusTone } from '../hooks/useSettings';

type ImportErrorDetails = {
  message: string;
  stackTrace: string | null;
  statusCode: number | null;
};

type LandingPageProps = {
  importing: boolean;
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsMessage: string | null;
  llmRouterCliWarning: string | null;
  youtubeDataApiKey: string;
  youtubeDataApiKeyStatusMessage: string | null;
  youtubeDataApiKeyStatusTone: YouTubeApiKeyStatusTone;
  importError: ImportErrorDetails | null;
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onSetYoutubeDataApiKey: (next: string) => void;
  onImportTakeoutFile: (file: File) => Promise<boolean>;
  onValidateTakeoutFile: (file: File) => Promise<number | null>;
};

export function LandingPage({
  importing,
  llmBackend,
  llmBackendOptions,
  settingsLoading,
  settingsSaving,
  settingsMessage,
  llmRouterCliWarning,
  youtubeDataApiKey,
  youtubeDataApiKeyStatusMessage,
  youtubeDataApiKeyStatusTone,
  importError,
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onImportTakeoutFile,
  onValidateTakeoutFile
}: LandingPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationRequestIdRef = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedTakeoutFile, setSelectedTakeoutFile] = useState<File | null>(null);
  const [detectedEntries, setDetectedEntries] = useState<number | null>(null);

  function handleDropZoneClick() {
    if (importing) {
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleSelectedFile(file: File | null) {
    if (!file || importing) {
      return;
    }

    const requestId = validationRequestIdRef.current + 1;
    validationRequestIdRef.current = requestId;

    setSelectedTakeoutFile(file);
    setDetectedEntries(null);

    const parsedEntries = await onValidateTakeoutFile(file);
    if (validationRequestIdRef.current !== requestId) {
      return;
    }
    setDetectedEntries(parsedEntries);
  }

  async function triggerImport() {
    if (!selectedTakeoutFile || importing || !detectedEntries || detectedEntries <= 0) {
      return;
    }
    const importSucceeded = await onImportTakeoutFile(selectedTakeoutFile);
    if (importSucceeded) {
      setSelectedTakeoutFile(null);
      setDetectedEntries(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!isDraggingFile) {
      setIsDraggingFile(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files.item(0);
    void handleSelectedFile(file);
  }

  const canImport = !!selectedTakeoutFile && detectedEntries !== null && detectedEntries > 0;

  const detectionMessage =
    selectedTakeoutFile && detectedEntries !== null
      ? `Detected ${detectedEntries} entr${detectedEntries === 1 ? 'y' : 'ies'}.`
      : null;

  return (
    <div className="page">
      <main className="app-shell">
        <section className="landing-panel">
          <h1>Import your Google Takeout history</h1>
          <section className="takeout-instructions" aria-label="Google Takeout instructions">
            <h2>Get your file from Google Takeout</h2>
            <ol>
              <li>
                Open{' '}
                <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">
                  Google Takeout
                </a>{' '}
              </li>
              <li>
                For products, click <strong>Deselect all</strong> and select <strong>YouTube and YouTube Music</strong>.
              </li>
              <li>
                In the YouTube options, click <strong>Deselect all</strong> and select <strong>history</strong>.
              </li>
              <li>
                Create the export and download the archive when Google notifies you that it is
                ready.
              </li>
              <li>
                Extract the archive and find <code>watch-history.html</code> usually under <code>Takeout/YouTube and YouTube Music/history/</code>.
              </li>
            </ol>
          </section>
          <button
            type="button"
            className={`takeout-dropzone${isDraggingFile ? ' is-dragging' : ''}`}
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={importing}
          >
            <span>
              {importing
                ? 'Importing and indexing...'
                : 'Drop watch-history.html here'}
            </span>
            {!importing && <small>or click to choose a file</small>}
            {selectedTakeoutFile && !importing ? (
              <small className="selected-file-name">Selected: {selectedTakeoutFile.name}</small>
            ) : null}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.json,text/html,application/json"
            className="sr-only"
            onChange={(event) => void handleSelectedFile(event.target.files?.item(0) ?? null)}
          />
          {detectionMessage ? (
            <p
              className={`status-line takeout-detected-note${detectedEntries === 0 ? ' is-error' : ''}`}
            >
              {detectionMessage}
            </p>
          ) : null}

          <h2>Additional Settings</h2>

          <LlmBackendField
            id="landing-llm-backend"
            value={llmBackend}
            options={llmBackendOptions}
            loading={settingsLoading}
            saving={settingsSaving}
            settingsMessage={settingsMessage}
            llmRouterCliWarning={llmRouterCliWarning}
            onChange={onSetLlmBackend}
          />

          <YoutubeDataApiKeyField
            id="landing-youtube-data-api-key"
            value={youtubeDataApiKey}
            loading={settingsLoading}
            saving={settingsSaving}
            statusMessage={youtubeDataApiKeyStatusMessage}
            statusTone={youtubeDataApiKeyStatusTone}
            onChange={onSetYoutubeDataApiKey}
          />
        </section>
        <div className="landing-import-actions">
          {importError ? (
            <details className="import-error-dropdown" role="status">
              <summary className="import-error-toggle">Failed import</summary>
              <div className="import-error-dropdown-body">
                <p className="import-error-message">{importError.message}</p>
                {importError.statusCode ? (
                  <p className="status-line mono">HTTP {importError.statusCode}</p>
                ) : null}
                {importError.stackTrace ? <pre>{importError.stackTrace}</pre> : null}
              </div>
            </details>
          ) : (
            <div className="import-error-placeholder" aria-hidden="true" />
          )}
          <button
            type="button"
            className="floating-import-button"
            onClick={() => void triggerImport()}
            disabled={!canImport || importing}
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </main>
    </div>
  );
}
