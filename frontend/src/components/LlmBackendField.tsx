import { type LLMBackend } from '../api/settings';
import { type LLMBackendSelection } from '../hooks/useSettings';

type LlmBackendFieldProps = {
  id: string;
  value: LLMBackendSelection;
  options: LLMBackend[];
  loading: boolean;
  saving: boolean;
  settingsMessage: string | null;
  llmRouterCliWarning: string | null;
  onChange: (next: LLMBackendSelection) => void;
  compact?: boolean;
};

export function LlmBackendField({
  id,
  value,
  options,
  loading,
  saving,
  settingsMessage,
  llmRouterCliWarning,
  onChange,
  compact = false
}: LlmBackendFieldProps) {
  return (
    <div className={compact ? 'settings-inline' : 'settings-block'}>
      <label htmlFor={id}>LLM Router (optional)</label>
      <select
        className="dropdown-select"
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
        Configure this to enable more sophisticated query handling, such as date
        filtering.
      </p>

      {llmRouterCliWarning ? <p className="status-line warning-line">{llmRouterCliWarning}</p> : null}
      {settingsMessage ? <p className="status-line">{settingsMessage}</p> : null}
    </div>
  );
}
