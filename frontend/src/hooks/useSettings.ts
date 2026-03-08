import { useCallback, useEffect, useState } from 'react';

import { fetchSettings, type LLMBackend, type SettingsResponse, updateSettings } from '../api/settings';

export type LLMBackendSelection = LLMBackend | 'none';

export function useSettings() {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [llmBackend, setLlmBackend] = useState<LLMBackendSelection>('none');
  const [llmBackendOptions, setLlmBackendOptions] = useState<LLMBackend[]>([
    'codex',
    'claude',
    'gemini',
    'opencode'
  ]);

  const applySettings = useCallback((settings: SettingsResponse) => {
    setLlmBackend(settings.llm_backend ?? 'none');
    setLlmBackendOptions(settings.llm_backend_options);
    setSettingsPath(settings.settings_path);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      try {
        const settings = await fetchSettings();
        if (!isActive) {
          return;
        }
        applySettings(settings);
        setSettingsMessage(null);
      } catch (err) {
        if (!isActive) {
          return;
        }
        setSettingsMessage(err instanceof Error ? err.message : 'Unexpected error while loading settings');
      } finally {
        if (isActive) {
          setSettingsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [applySettings]);

  const saveSettings = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsMessage(null);

    try {
      const selectedBackend = llmBackend === 'none' ? null : llmBackend;
      const saved = await updateSettings(selectedBackend);
      applySettings(saved);
      setSettingsMessage(
        saved.llm_backend
          ? `Saved optional LLM backend: ${saved.llm_backend}.`
          : 'Saved. LLM backend is not configured.'
      );
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : 'Unexpected error while saving settings');
    } finally {
      setSettingsSaving(false);
    }
  }, [applySettings, llmBackend]);

  return {
    llmBackend,
    llmBackendOptions,
    settingsLoading,
    settingsSaving,
    settingsPath,
    settingsMessage,
    setLlmBackend,
    saveSettings
  };
}
