type YoutubeDataApiKeyFieldProps = {
  id: string;
  value: string;
  loading: boolean;
  saving: boolean;
  onChange: (next: string) => void;
  compact?: boolean;
};

export function YoutubeDataApiKeyField({
  id,
  value,
  loading,
  saving,
  onChange,
  compact = false
}: YoutubeDataApiKeyFieldProps) {
  return (
    <div className={compact ? 'settings-inline' : 'settings-block'}>
      <label htmlFor={id}>YouTube Data API key (optional)</label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading || saving}
      />
      <p className="status-line">
        Using your own key improves indexing performance by enabling faster metadata lookups.
      </p>
    </div>
  );
}
