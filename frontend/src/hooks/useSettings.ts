import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchSettings, type LLMBackend, type SettingsResponse, updateSettings } from '../api/settings';

export type LLMBackendSelection = LLMBackend | 'none';

export function useSettings() {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [llmRouterCliWarning, setLlmRouterCliWarning] = useState<string | null>(null);
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
    setLlmRouterCliWarning(settings.llm_router_cli_warning);
  }, []);

  useEffect(() => {
    let isActive = true;
    const effectStarted = performance.now();
    console.info(
      `[timing] useSettings effect start at ${new Date().toISOString()} (perf=${effectStarted.toFixed(2)}ms)`
    );

    async function loadSettings() {
      const requestStarted = performance.now();
      console.info(
        `[timing] /api/settings fetch start at ${new Date().toISOString()} (+${(
          requestStarted - effectStarted
        ).toFixed(2)}ms since useSettings effect start)`
      );
      try {
        const settings = await fetchSettings();
        const responseTime = performance.now();
        console.info(
          `[timing] /api/settings fetch complete duration=${(responseTime - requestStarted).toFixed(2)}ms`
        );
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
          console.info(
            `[timing] settingsLoading=false at ${new Date().toISOString()} (+${(
              performance.now() - effectStarted
            ).toFixed(2)}ms since useSettings effect start)`
          );
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
    llmRouterCliWarning,
    setLlmBackend,
  };
}
