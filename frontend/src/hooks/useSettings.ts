import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchSettings, type LLMBackend, type SettingsResponse, updateSettings } from '../api/settings';

export type LLMBackendSelection = LLMBackend | 'none';

export function useSettings() {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [llmBackend, setLlmBackendState] = useState<LLMBackendSelection>('none');
  const saveRequestIdRef = useRef(0);
  const [llmBackendOptions, setLlmBackendOptions] = useState<LLMBackend[]>([
    'codex',
    'claude',
    'gemini',
    'opencode'
  ]);

  const applySettings = useCallback((settings: SettingsResponse) => {
    setLlmBackendState(settings.llm_router ?? 'none');
    setLlmBackendOptions(settings.llm_router_options);
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

  const persistLlmBackend = useCallback(async (next: LLMBackendSelection) => {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSettingsSaving(true);
    setSettingsMessage(null);

    try {
      const selectedBackend = next === 'none' ? null : next;
      const saved = await updateSettings(selectedBackend);
      if (requestId !== saveRequestIdRef.current) {
        return;
      }
      applySettings(saved);
      setSettingsMessage(
        saved.llm_router
          ? `Saved optional LLM Router: ${saved.llm_router}.`
          : 'Saved. LLM Router is not configured.'
      );
    } catch (err) {
      if (requestId !== saveRequestIdRef.current) {
        return;
      }
      setSettingsMessage(err instanceof Error ? err.message : 'Unexpected error while saving settings');
    } finally {
      if (requestId === saveRequestIdRef.current) {
        setSettingsSaving(false);
      }
    }
  }, [applySettings]);

  const setLlmBackend = useCallback(
    (next: LLMBackendSelection) => {
      setLlmBackendState(next);
      void persistLlmBackend(next);
    },
    [persistLlmBackend]
  );

  return {
    llmBackend,
    llmBackendOptions,
    settingsLoading,
    settingsSaving,
    settingsPath,
    settingsMessage,
    setLlmBackend,
  };
}
