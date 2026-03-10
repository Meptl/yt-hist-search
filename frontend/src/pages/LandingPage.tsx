import { useEffect, useRef, useState, type DragEvent } from 'react';

import { LlmBackendField } from '../components/LlmBackendField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection, type YouTubeApiKeyStatusTone } from '../hooks/useSettings';

type ImportErrorDetails = {
  message: string;
  stackTrace: string | null;
  statusCode: number | null;
};

type TakeoutValidationResult = {
  parsedEntries: number;
  dedupedEntries: number;
  newEntries: number;
  alreadyIndexedEntries: number;
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
  onValidateTakeoutFile: (file: File) => Promise<TakeoutValidationResult | null>;
  allowBackToSearch: boolean;
  onBackToSearch: () => void;
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
  onValidateTakeoutFile,
  allowBackToSearch,
  onBackToSearch
}: LandingPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationRequestIdRef = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedTakeoutFile, setSelectedTakeoutFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<TakeoutValidationResult | null>(null);
  const [isValidatingTakeout, setIsValidatingTakeout] = useState(false);

  useEffect(() => {
    if (!allowBackToSearch) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onBackToSearch();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [allowBackToSearch, onBackToSearch]);

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
    setValidationResult(null);
    setIsValidatingTakeout(true);

    const nextResult = await onValidateTakeoutFile(file);
    if (validationRequestIdRef.current === requestId) {
      setValidationResult(nextResult);
      setIsValidatingTakeout(false);
    }
  }

  async function triggerImport() {
    if (!selectedTakeoutFile || importing || !validationResult || validationResult.newEntries <= 0) {
      return;
    }
    const importSucceeded = await onImportTakeoutFile(selectedTakeoutFile);
    if (importSucceeded) {
      setSelectedTakeoutFile(null);
      setValidationResult(null);
      setIsValidatingTakeout(false);
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

  const canImport =
    !!selectedTakeoutFile && validationResult !== null && validationResult.newEntries > 0;

  const detectionMessage =
    selectedTakeoutFile && validationResult !== null
      ? validationResult.newEntries > 0
        ? `Detected ${validationResult.newEntries} new unique entr${validationResult.newEntries === 1 ? 'y' : 'ies'} (${validationResult.alreadyIndexedEntries} already indexed).`
        : `Detected 0 new unique entries (${validationResult.dedupedEntries} unique in file, all already indexed).`
      : null;

  return (
    <div className="page">
      <main className="app-shell">
        <header className="hero">
          <div className="hero-top">
            <h1>Import your Google Takeout history</h1>
            {allowBackToSearch ? (
              <button
                type="button"
                className="icon-button settings-close-button"
                aria-label="Close import page"
                title="Close import page"
                onClick={onBackToSearch}
              >
                X
              </button>
            ) : null}
          </div>
        </header>
        <section className="landing-panel">
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
          {selectedTakeoutFile && isValidatingTakeout ? (
            <p className="status-line takeout-detected-note takeout-validating-note">
              <span className="inline-spinner" aria-hidden="true" />
              Detecting new unique entries...
            </p>
          ) : detectionMessage ? (
            <p
              className={`status-line takeout-detected-note${validationResult?.newEntries === 0 ? ' is-error' : ''}`}
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
