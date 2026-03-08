export type LLMBackend = 'codex' | 'claude' | 'gemini' | 'opencode';

export type SettingsResponse = {
  llm_backend: LLMBackend | null;
  llm_backend_options: LLMBackend[];
  settings_path: string;
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

export async function updateSettings(llmBackend: LLMBackend | null): Promise<SettingsResponse> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      llm_backend: llmBackend
    })
  });

  const payload = (await response.json()) as SettingsResponse | { detail: string };
  if (!response.ok) {
    const detail = 'detail' in payload ? payload.detail : 'Failed to save settings';
    throw new Error(detail);
  }

  return payload as SettingsResponse;
}
