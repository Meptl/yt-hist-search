export type LLMBackend = 'codex' | 'claude' | 'gemini' | 'opencode';

export type SettingsResponse = {
  llm_router: LLMBackend | null;
  llm_router_options: LLMBackend[];
  youtube_data_api_key: string | null;
  score_threshold: number;
  llm_router_cli_warning: string | null;
};

export type UpdateSettingsPayload = {
  llm_router?: LLMBackend | null;
  llm_backend?: LLMBackend | null;
  youtube_data_api_key?: string | null;
  score_threshold?: number;
};

export async function fetchSettings(): Promise<SettingsResponse> {
  const response = await fetch('/api/settings');
  const payload = (await response.json()) as SettingsResponse | { detail: string };

  if (!response.ok) {
    const detail = 'detail' in payload ? payload.detail : 'Failed to load settings';
    throw new Error(detail);
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

  const responsePayload = (await response.json()) as SettingsResponse | { detail: string };
  if (!response.ok) {
    const detail = 'detail' in responsePayload ? responsePayload.detail : 'Failed to save settings';
    throw new Error(detail);
  }

  return responsePayload as SettingsResponse;
}
