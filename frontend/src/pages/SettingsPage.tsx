import { useEffect } from 'react';

import { BackendDriverField } from '../components/BackendDriverField';
import { LlmBackendField } from '../components/LlmBackendField';
import { ScoreThresholdField } from '../components/ScoreThresholdField';
import { YoutubeDataApiKeyField } from '../components/YoutubeDataApiKeyField';
import { type BackendDriver, type BackendDriverOption, type LLMBackend } from '../api/settings';
import { type LLMBackendSelection, type YouTubeApiKeyStatusTone } from '../hooks/useSettings';

type SettingsPageProps = {
  backendDriver: BackendDriver;
  backendDriverOptions: BackendDriverOption[];
  backendDriverDetectionError: string | null;
  llmBackend: LLMBackendSelection;
  llmBackendOptions: LLMBackend[];
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsMessage: string | null;
  llmRouterCliWarning: string | null;
  youtubeDataApiKey: string;
  youtubeDataApiKeyStatusMessage: string | null;
  youtubeDataApiKeyStatusTone: YouTubeApiKeyStatusTone;
  scoreThreshold: number;
  onSetBackendDriver: (next: BackendDriver) => void;
  onSetLlmBackend: (next: LLMBackendSelection) => void;
  onSetYoutubeDataApiKey: (next: string) => void;
  onSetScoreThreshold: (next: number) => void;
  onBack: () => void;
};

export function SettingsPage({
  backendDriver,
  backendDriverOptions,
  backendDriverDetectionError,
  llmBackend,
  llmBackendOptions,
  settingsLoading,
  settingsSaving,
  settingsMessage,
  llmRouterCliWarning,
  youtubeDataApiKey,
  youtubeDataApiKeyStatusMessage,
  youtubeDataApiKeyStatusTone,
  scoreThreshold,
  onSetBackendDriver,
  onSetLlmBackend,
  onSetYoutubeDataApiKey,
  onSetScoreThreshold,
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
          <BackendDriverField
            id="settings-backend-driver"
            value={backendDriver}
            options={backendDriverOptions}
            loading={settingsLoading}
            saving={settingsSaving}
            detectionError={backendDriverDetectionError}
            onChange={onSetBackendDriver}
            compact
          />

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
            statusMessage={youtubeDataApiKeyStatusMessage}
            statusTone={youtubeDataApiKeyStatusTone}
            onChange={onSetYoutubeDataApiKey}
            compact
          />

          <ScoreThresholdField
            id="settings-score-threshold"
            value={scoreThreshold}
            loading={settingsLoading}
            saving={settingsSaving}
            onChange={onSetScoreThreshold}
            compact
          />
        </section>
      </main>
    </div>
  );
}
