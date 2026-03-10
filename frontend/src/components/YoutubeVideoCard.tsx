import { ReactNode } from 'react';

type SearchResponseItem = {
  score: number | null;
  title?: string | null;
  channel_name?: string | null;
  channel_logo_url?: string | null;
  video_id?: string | null;
  video_url?: string | null;
};

type YoutubeVideoCardProps = {
  item: SearchResponseItem;
  index: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  fallbackTitle: string;
  fallbackChannel: string;
};

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
  const channelLogoUrl = item.channel_logo_url?.trim() || null;
  const scoreLabel = item.score === null ? 'n/a' : item.score.toFixed(3);
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
        {videoUrl ? (
          <a href={videoUrl} target="_blank" rel="noreferrer" className="video-title">
            {title}
          </a>
        ) : (
          <p className="video-title">{title}</p>
        )}
        <p className="video-channel">
          {channelLogoUrl ? (
            <img
              src={channelLogoUrl}
              alt=""
              aria-hidden="true"
              className="channel-logo"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <span>{channelName}</span>
        </p>
        <p className="video-score" aria-label={`Similarity score ${scoreLabel}`}>
          {scoreLabel}
        </p>
      </div>
    </li>
  );
}
