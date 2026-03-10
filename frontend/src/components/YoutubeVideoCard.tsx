import { ReactNode } from 'react';

type SearchResponseItem = {
  title?: string | null;
  channel_name?: string | null;
  channel_url?: string | null;
  channel_logo_url?: string | null;
  video_id?: string | null;
  video_url?: string | null;
  published_at?: string | null;
  view_count?: string | null;
};

type YoutubeVideoCardProps = {
  item: SearchResponseItem;
  index: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  fallbackTitle: string;
  fallbackChannel: string;
};

function trimTrailingZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}

function formatViewCount(viewCountRaw: string | null | undefined): string | null {
  if (!viewCountRaw) {
    return null;
  }

  const parsed = Number.parseInt(viewCountRaw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  if (parsed < 1_000) {
    return `${parsed} views`;
  }

  if (parsed < 1_000_000) {
    const thousands = parsed / 1_000;
    const compact = thousands < 10 ? trimTrailingZero(thousands.toFixed(1)) : Math.round(thousands).toString();
    return `${compact}K views`;
  }

  if (parsed < 1_000_000_000) {
    const millions = parsed / 1_000_000;
    const compact = millions < 10 ? trimTrailingZero(millions.toFixed(1)) : Math.round(millions).toString();
    return `${compact}M views`;
  }

  const billions = parsed / 1_000_000_000;
  const compact = billions < 10 ? trimTrailingZero(billions.toFixed(1)) : Math.round(billions).toString();
  return `${compact}B views`;
}

function formatRelativePublishedTime(publishedAtRaw: string | null | undefined): string | null {
  if (!publishedAtRaw) {
    return null;
  }

  const publishedMs = Date.parse(publishedAtRaw);
  if (!Number.isFinite(publishedMs)) {
    return null;
  }

  const deltaMs = Date.now() - publishedMs;
  if (deltaMs <= 0) {
    return 'just now';
  }

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (deltaMs < minuteMs) {
    return 'just now';
  }
  if (deltaMs < hourMs) {
    const minutes = Math.floor(deltaMs / minuteMs);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (deltaMs < dayMs) {
    const hours = Math.floor(deltaMs / hourMs);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (deltaMs < weekMs) {
    const days = Math.floor(deltaMs / dayMs);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (deltaMs < monthMs) {
    const weeks = Math.floor(deltaMs / weekMs);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  if (deltaMs < yearMs) {
    const months = Math.floor(deltaMs / monthMs);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(deltaMs / yearMs);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function YoutubeVideoCard({
  item,
  index,
  videoUrl,
  thumbnailUrl,
  fallbackTitle,
  fallbackChannel
}: YoutubeVideoCardProps): ReactNode {
  const title = item.title?.trim() || fallbackTitle;
  const channelName = item.channel_name?.trim() || fallbackChannel;
  const channelUrl = item.channel_url?.trim() || null;
  const channelLogoUrl = item.channel_logo_url?.trim() || null;
  const viewCountLabel = formatViewCount(item.view_count);
  const publishedTimeLabel = formatRelativePublishedTime(item.published_at);
  const stats = [viewCountLabel, publishedTimeLabel].filter(Boolean).join(' • ');
  const titleNode = videoUrl ? (
    <a href={videoUrl} target="_blank" rel="noreferrer" className="video-title">
      {title}
    </a>
  ) : (
    <p className="video-title">{title}</p>
  );
  const thumb = thumbnailUrl ? (
    <img
      src={thumbnailUrl}
      alt={`YouTube thumbnail for result ${index + 1}`}
      className="result-thumb"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <div className="result-thumb result-thumb-fallback" aria-hidden="true" />
  );

  return (
    <li className="result-card">
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noreferrer"
          className="thumb-link"
          aria-label={`Open video result ${index + 1}`}
        >
          {thumb}
        </a>
      ) : (
        <div className="thumb-link">{thumb}</div>
      )}
      <div className="card-body">
        <div className="video-channel-row">
          {channelLogoUrl ? (
            channelUrl ? (
              <a
                href={channelUrl}
                target="_blank"
                rel="noreferrer"
                className="channel-logo-link"
                aria-label={`Open channel ${channelName}`}
              >
                <img
                  src={channelLogoUrl}
                  alt=""
                  aria-hidden="true"
                  className="channel-logo"
                  loading="lazy"
                  decoding="async"
                />
              </a>
            ) : (
              <img
                src={channelLogoUrl}
                alt=""
                aria-hidden="true"
                className="channel-logo"
                loading="lazy"
                decoding="async"
              />
            )
          ) : null}
          <div className="video-channel-info">
            {titleNode}
            <p className="video-channel">
              {channelUrl ? (
                <a
                  href={channelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="video-channel-link"
                >
                  <span>{channelName}</span>
                </a>
              ) : (
                <span>{channelName}</span>
              )}
            </p>
            {stats ? <p className="video-stats">{stats}</p> : null}
          </div>
        </div>
      </div>
    </li>
  );
}
