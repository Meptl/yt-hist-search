import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchSettings,
  type LLMBackend,
  type SettingsResponse,
  updateSettings,
  validateYouTubeDataApiKey
} from '../api/settings';

export type LLMBackendSelection = LLMBackend | 'none';
export type YouTubeApiKeyStatusTone = 'muted' | 'success' | 'error';

export function useSettings() {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [llmRouterCliWarning, setLlmRouterCliWarning] = useState<string | null>(null);
  const [llmBackend, setLlmBackendState] = useState<LLMBackendSelection>('none');
  const [youtubeDataApiKey, setYoutubeDataApiKeyState] = useState('');
  const [youtubeDataApiKeyStatusMessage, setYoutubeDataApiKeyStatusMessage] = useState<string | null>(null);
  const [youtubeDataApiKeyStatusTone, setYoutubeDataApiKeyStatusTone] = useState<YouTubeApiKeyStatusTone>('muted');
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
    setYoutubeDataApiKeyState(settings.youtube_data_api_key ?? '');
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

  const setYoutubeDataApiKey = useCallback(
    (next: string) => {
      setYoutubeDataApiKeyState(next);
      const requestId = saveRequestIdRef.current + 1;
      saveRequestIdRef.current = requestId;
      setSettingsSaving(true);
      setSettingsMessage(null);

      const normalized = next.trim() || null;
      if (normalized) {
        setYoutubeDataApiKeyStatusTone('muted');
        setYoutubeDataApiKeyStatusMessage('Checking YouTube Data API key...');
      } else {
        setYoutubeDataApiKeyStatusTone('muted');
        setYoutubeDataApiKeyStatusMessage('API key cleared. Using the default shared key.');
      }

      void (async () => {
        try {
          if (normalized) {
            const validation = await validateYouTubeDataApiKey(normalized);
            if (requestId !== saveRequestIdRef.current) {
              return;
            }
            setYoutubeDataApiKeyStatusTone('success');
            setYoutubeDataApiKeyStatusMessage(validation.message);
          }

          const saved = await updateSettings({
            youtube_data_api_key: normalized
          });
          if (requestId !== saveRequestIdRef.current) {
            return;
          }
          applySettings(saved);
        } catch (err) {
          if (requestId !== saveRequestIdRef.current) {
            return;
          }
          setYoutubeDataApiKeyStatusTone('error');
          setYoutubeDataApiKeyStatusMessage(
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

  return {
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
    setLlmBackend,
    setYoutubeDataApiKey,
    setScoreThreshold
  };
}
