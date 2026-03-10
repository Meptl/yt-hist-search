import { useCallback, useEffect, useRef, useState } from 'react';

type ScoreThresholdFieldProps = {
  id: string;
  value: number;
  loading: boolean;
  saving: boolean;
  onChange: (next: number) => void;
  compact?: boolean;
};

function normalizeThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.7;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Math.round(value * 100) / 100;
}

export function ScoreThresholdField({
  id,
  value,
  loading,
  saving,
  onChange,
  compact = false
}: ScoreThresholdFieldProps) {
  const [draftValue, setDraftValue] = useState(normalizeThreshold(value));
  const draftValueRef = useRef(normalizeThreshold(value));
  const lastCommittedRef = useRef(normalizeThreshold(value));

  useEffect(() => {
    const normalized = normalizeThreshold(value);
    setDraftValue(normalized);
    draftValueRef.current = normalized;
    lastCommittedRef.current = normalized;
  }, [value]);

  const commitDraft = useCallback(() => {
    const next = normalizeThreshold(draftValueRef.current);
    if (next === lastCommittedRef.current) {
      return;
    }
    lastCommittedRef.current = next;
    onChange(next);
  }, [onChange]);

  const disabled = loading || saving;

  return (
    <div className={compact ? 'settings-inline' : 'settings-block'}>
      <label htmlFor={id}>Score threshold</label>
      <p className="status-line">
        Minimum semantic similarity for search results. Higher values are stricter.
      </p>
      <div className="settings-threshold-row">
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={draftValue}
          onChange={(event) => {
            const next = normalizeThreshold(Number(event.target.value));
            setDraftValue(next);
            draftValueRef.current = next;
          }}
          onMouseUp={commitDraft}
          onTouchEnd={commitDraft}
          onBlur={commitDraft}
          disabled={disabled}
        />
        <output aria-live="polite">{draftValue.toFixed(2)}</output>
      </div>
    </div>
  );
}
