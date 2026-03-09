import { LlmBackendField } from '../components/LlmBackendField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type SettingsPageProps = {
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsPath: string | null;
  settingsMessage: string | null;
  llmRouterCliWarning: string | null;
  youtubeDataApiKey: string;
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onSetYoutubeDataApiKey: (next: string) => void;
  onBack: () => void;
};

export function SettingsPage({
  llmBackend,
  llmBackendOptions,
  settingsLoading,
  settingsSaving,
  settingsPath,
  settingsMessage,
  llmRouterCliWarning,
  youtubeDataApiKey,
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onBack
}: SettingsPageProps) {
  return (
    <div className="page">
      <main className="app-shell">
        <header className="hero">
          <h1>Settings</h1>
        </header>

        <section className="query-panel settings-panel">
          <LlmBackendField
            id="settings-llm-backend"
            value={llmBackend}
            options={llmBackendOptions}
            loading={settingsLoading}
            saving={settingsSaving}
            settingsPath={settingsPath}
            settingsMessage={settingsMessage}
            llmRouterCliWarning={llmRouterCliWarning}
            onChange={onSetLlmBackend}
            compact
          />

          <YoutubeDataApiKeyField
            id="settings-youtube-data-api-key"
            value={youtubeDataApiKey}
            loading={settingsLoading}
            saving={settingsSaving}
            onChange={onSetYoutubeDataApiKey}
            compact
          />

          <div className="controls">
            <button type="button" className="secondary-button" onClick={onBack}>
              Back to search
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
