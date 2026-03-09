import { useRef, useState, type DragEvent } from 'react';

import { LlmBackendField } from '../components/LlmBackendField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type LandingPageProps = {
  importing: boolean;
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsMessage: string | null;
  llmRouterCliWarning: string | null;
  youtubeDataApiKey: string;
  importError: string | null;
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onSetYoutubeDataApiKey: (next: string) => void;
  onImportTakeoutFile: (file: File) => Promise<boolean>;
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
  importError,
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onImportTakeoutFile
}: LandingPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedTakeoutFile, setSelectedTakeoutFile] = useState<File | null>(null);

  function handleDropZoneClick() {
    if (importing) {
      return;
    }
    fileInputRef.current?.click();
  }

  function handleSelectedFile(file: File | null) {
    if (!file || importing) {
      return;
    }
    setSelectedTakeoutFile(file);
  }

  async function triggerImport() {
    if (!selectedTakeoutFile || importing) {
      return;
    }
    const importSucceeded = await onImportTakeoutFile(selectedTakeoutFile);
    if (importSucceeded) {
      setSelectedTakeoutFile(null);
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
    handleSelectedFile(file);
  }

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
            onChange={(event) => handleSelectedFile(event.target.files?.item(0) ?? null)}
          />
          {importError ? (
            <p className="status-line warning-line import-error" role="alert">
              {importError}
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
            onChange={onSetYoutubeDataApiKey}
          />
        </section>
        <div className="landing-import-actions">
          <button
            type="button"
            className="floating-import-button"
            onClick={() => void triggerImport()}
            disabled={!selectedTakeoutFile || importing}
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </main>
    </div>
  );
}
