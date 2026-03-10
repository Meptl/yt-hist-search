import { type BackendDriver, type BackendDriverOption } from '../api/settings';

type BackendDriverFieldProps = {
  id: string;
  value: BackendDriver;
  options: BackendDriverOption[];
  loading: boolean;
  saving: boolean;
  detectionError: string | null;
  onChange: (next: BackendDriver) => void;
  compact?: boolean;
};

export function BackendDriverField({
  id,
  value,
  options,
  loading,
  saving,
  detectionError,
  onChange,
  compact = false
}: BackendDriverFieldProps) {
  return (
    <div className={compact ? 'settings-inline' : 'settings-block'}>
      <label htmlFor={id}>Backend Driver</label>
      <p className="status-line">Controls which ONNX provider embeddings use. Unavailable drivers stay visible but disabled.</p>
      <select
        className="dropdown-select"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as BackendDriver)}
        disabled={loading || saving}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={!option.available}>
            {option.label}
          </option>
        ))}
      </select>
      {detectionError ? <p className="status-line warning-line">{detectionError}</p> : null}
    </div>
  );
}
