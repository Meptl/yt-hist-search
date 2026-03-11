import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type BackendDriver,
  type BackendDriverOption,
  fetchSettings,
  type LLMBackend,
  type SettingsResponse,
  updateSettings,
  validateYouTubeDataString
} from '../api/settings';

export type LLMBackendSelection = LLMBackend | 'none';
export type YouTubeStringStatusTone = 'muted' | 'success' | 'error';

export function useSettings() {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [llmRouterCliWarning, setLlmRouterCliWarning] = useState<string | null>(null);
  const [backendDriver, setBackendDriverState] = useState<BackendDriver>('auto');
  const [backendDriverOptions, setBackendDriverOptions] = useState<BackendDriverOption[]>([]);
  const [backendDriverDetectionError, setBackendDriverDetectionError] = useState<string | null>(null);
  const [backendDriverAvailableProviders, setBackendDriverAvailableProviders] = useState<string[]>([]);
  const [llmBackend, setLlmBackendState] = useState<LLMBackendSelection>('none');
  const [youtubeDataString, setYoutubeDataStringState] = useState('');
  const [youtubeDataStringStatusMessage, setYoutubeDataStringStatusMessage] = useState<string | null>(null);
  const [youtubeDataStringStatusTone, setYoutubeDataStringStatusTone] = useState<YouTubeStringStatusTone>('muted');
  const [scoreThreshold, setScoreThresholdState] = useState(0.7);
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
    setBackendDriverState(settings.backend_driver);
    setBackendDriverOptions(settings.backend_driver_options);
    setBackendDriverDetectionError(settings.backend_driver_detection_error);
    setBackendDriverAvailableProviders(settings.backend_driver_available_providers);
    setYoutubeDataStringState(settings.youtube_data_string ?? '');
    setScoreThresholdState(settings.score_threshold);
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

  const persistSettings = useCallback(async (payload: Parameters<typeof updateSettings>[0]) => {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSettingsSaving(true);
    setSettingsMessage(null);

    try {
      const saved = await updateSettings(payload);
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
      void persistSettings({
        llm_router: next === 'none' ? null : next
      });
    },
    [persistSettings]
  );

  const setYoutubeDataString = useCallback(
    (next: string) => {
      setYoutubeDataStringState(next);
      const requestId = saveRequestIdRef.current + 1;
      saveRequestIdRef.current = requestId;
      setSettingsSaving(true);
      setSettingsMessage(null);

      const normalized = next.trim() || null;
      if (normalized) {
        setYoutubeDataStringStatusTone('muted');
        setYoutubeDataStringStatusMessage('Checking YouTube Data API key...');
      } else {
        setYoutubeDataStringStatusTone('muted');
        setYoutubeDataStringStatusMessage(null);
      }

      void (async () => {
        try {
          if (normalized) {
            const validation = await validateYouTubeDataString(normalized);
            if (requestId !== saveRequestIdRef.current) {
              return;
            }
            setYoutubeDataStringStatusTone('success');
            setYoutubeDataStringStatusMessage(validation.message);
          }

          const saved = await updateSettings({
            youtube_data_string: normalized
          });
          if (requestId !== saveRequestIdRef.current) {
            return;
          }
          applySettings(saved);
        } catch (err) {
          if (requestId !== saveRequestIdRef.current) {
            return;
          }
          setYoutubeDataStringStatusTone('error');
          setYoutubeDataStringStatusMessage(
            err instanceof Error ? err.message : 'Unexpected error while validating API key'
          );
        } finally {
          if (requestId === saveRequestIdRef.current) {
            setSettingsSaving(false);
          }
        }
      })();
    },
    [applySettings]
  );

  const setScoreThreshold = useCallback(
    (next: number) => {
      setScoreThresholdState(next);
      void persistSettings({
        score_threshold: next
      });
    },
    [persistSettings]
  );

  const setBackendDriver = useCallback(
    (next: BackendDriver) => {
      setBackendDriverState(next);
      void persistSettings({
        backend_driver: next
      });
    },
    [persistSettings]
  );

  return {
    backendDriver,
    backendDriverOptions,
    backendDriverDetectionError,
    backendDriverAvailableProviders,
    llmBackend,
    llmBackendOptions,
    settingsLoading,
    settingsSaving,
    settingsMessage,
    llmRouterCliWarning,
    youtubeDataString,
    youtubeDataStringStatusMessage,
    youtubeDataStringStatusTone,
    scoreThreshold,
    setLlmBackend,
    setBackendDriver,
    setYoutubeDataString,
    setScoreThreshold
  };
}
