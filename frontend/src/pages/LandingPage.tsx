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
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onSetYoutubeDataApiKey: (next: string) => void;
  onImportTakeoutFile: (file: File) => Promise<void>;
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
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onImportTakeoutFile
}: LandingPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

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
    await onImportTakeoutFile(file);
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

  async function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files.item(0);
    await handleSelectedFile(file);
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
            onDrop={(event) => void handleDrop(event)}
            disabled={importing}
          >
            <span>{importing ? 'Importing and indexing...' : 'Drop watch-history.html here'}</span>
            {!importing && <small>or click to choose a file</small>}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="sr-only"
            onChange={(event) => void handleSelectedFile(event.target.files?.item(0) ?? null)}
          />

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
      </main>
    </div>
  );
}
