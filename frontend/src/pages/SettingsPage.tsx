import { useEffect } from 'react';

import { LlmBackendField } from '../components/LlmBackendField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type SettingsPageProps = {
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
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
  settingsMessage,
  llmRouterCliWarning,
  youtubeDataApiKey,
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onBack
}: SettingsPageProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onBack();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onBack]);

  return (
    <div className="page">
      <main className="app-shell">
        <header className="hero">
          <div className="hero-top">
            <h1>Settings</h1>
            <button
              type="button"
              className="icon-button settings-close-button"
              aria-label="Close settings"
              title="Close settings"
              onClick={onBack}
            >
              X
            </button>
          </div>
        </header>

        <section className="query-panel settings-panel">
          <LlmBackendField
            id="settings-llm-backend"
            value={llmBackend}
            options={llmBackendOptions}
            loading={settingsLoading}
            saving={settingsSaving}
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
        </section>
      </main>
    </div>
  );
}
