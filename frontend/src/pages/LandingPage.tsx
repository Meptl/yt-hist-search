import { LlmBackendField } from '../components/LlmBackendField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type LandingPageProps = {
  importing: boolean;
  importStatus: string | null;
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsMessage: string | null;
  llmRouterCliWarning: string | null;
  youtubeDataApiKey: string;
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onSetYoutubeDataApiKey: (next: string) => void;
  onPickAndImport: () => Promise<void>;
};

export function LandingPage({
  importing,
  importStatus,
  llmBackend,
  llmBackendOptions,
  settingsLoading,
  settingsSaving,
  settingsMessage,
  llmRouterCliWarning,
  youtubeDataApiKey,
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onPickAndImport
}: LandingPageProps) {
  return (
    <div className="page">
      <main className="app-shell">
        <section className="landing-panel">
          <h1>Import your Takeout history to begin</h1>
          <p className="subtitle">
            Select your Google Takeout <code>watch-history.html</code> file to start embedding and
            indexing.
          </p>

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

          <button type="button" onClick={() => void onPickAndImport()} disabled={importing}>
            {importing ? 'Importing and indexing...' : 'Choose watch-history.html'}
          </button>
          <p className="status-line">{importStatus ?? 'No index detected yet.'}</p>
        </section>
      </main>
    </div>
  );
}
