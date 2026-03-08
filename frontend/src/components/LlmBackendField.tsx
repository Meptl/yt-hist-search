import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type LlmBackendFieldProps = {
  id: string;
  value: LLMBackendSelection;
  options: LLMBackend[];
  loading: boolean;
  saving: boolean;
  settingsPath: string | null;
  settingsMessage: string | null;
  onChange: (next: LLMBackendSelection) => void;
  onSave: () => Promise<void>;
  compact?: boolean;
};

export function LlmBackendField({
  id,
  value,
  options,
  loading,
  saving,
  settingsPath,
  settingsMessage,
  onChange,
  onSave,
  compact = false
}: LlmBackendFieldProps) {
  return (
    <div className={compact ? 'settings-inline' : 'settings-block'}>
      <label htmlFor={id}>Optional LLM backend</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as LLMBackendSelection)}
        disabled={loading || saving}
      >
        <option value="none">Not configured</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <p className="status-line">
        Optional. Configure this to enable more sophisticated query handling, such as date
        filtering.
      </p>

      <button type="button" onClick={() => void onSave()} disabled={saving}>
        {saving ? 'Saving setting...' : 'Save optional LLM setting'}
      </button>

      {settingsPath ? <p className="status-line mono">{settingsPath}</p> : null}
      {settingsMessage ? <p className="status-line">{settingsMessage}</p> : null}
    </div>
  );
}
