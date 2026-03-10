export type LLMBackend = 'codex' | 'claude' | 'gemini' | 'opencode';
export type BackendDriver = 'auto' | 'cpu' | 'cuda' | 'migraphx' | 'rocm' | 'directml';

export type BackendDriverOption = {
  value: BackendDriver;
  label: string;
  available: boolean;
  detail: string | null;
};

export type SettingsResponse = {
  llm_router: LLMBackend | null;
  llm_router_options: LLMBackend[];
  backend_driver: BackendDriver;
  backend_driver_options: BackendDriverOption[];
  backend_driver_detection_error: string | null;
  backend_driver_available_providers: string[];
  youtube_data_api_key: string | null;
  score_threshold: number;
  llm_router_cli_warning: string | null;
};

export type UpdateSettingsPayload = {
  llm_router?: LLMBackend | null;
  llm_backend?: LLMBackend | null;
  backend_driver?: BackendDriver;
  youtube_data_api_key?: string | null;
  score_threshold?: number;
};

export type ValidateYouTubeApiKeyResponse = {
  valid: boolean;
  message: string;
};

function readErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail;
  }

  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const response = await fetch('/api/settings');
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Failed to load settings'));
  }

  return payload as SettingsResponse;
}

export async function updateSettings(payload: UpdateSettingsPayload): Promise<SettingsResponse> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responsePayload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, 'Failed to save settings'));
  }

  return responsePayload as SettingsResponse;
}

export async function validateYouTubeDataApiKey(
  youtubeDataApiKey: string | null
): Promise<ValidateYouTubeApiKeyResponse> {
  const response = await fetch('/api/validate-youtube-api-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      youtube_data_api_key: youtubeDataApiKey
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Failed to validate YouTube Data API key'));
  }

  return payload as ValidateYouTubeApiKeyResponse;
}
