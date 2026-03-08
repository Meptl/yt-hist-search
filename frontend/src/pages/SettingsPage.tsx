import { LlmBackendField } from '../components/LlmBackendField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type SettingsPageProps = {
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsPath: string | null;
  settingsMessage: string | null;
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onBack: () => void;
};

export function SettingsPage({
  llmBackend,
  llmBackendOptions,
  settingsLoading,
  settingsSaving,
  settingsPath,
  settingsMessage,
  onSetLlmBackend,
  onBack
}: SettingsPageProps) {
  return (
    <div className="page">
      <main className="app-shell">
        <header className="hero">
          <h1>Settings</h1>
          <p className="subtitle">
            LLM Router is optional and enables richer query understanding, including date-aware
            filtering.
          </p>
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
            onChange={onSetLlmBackend}
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
