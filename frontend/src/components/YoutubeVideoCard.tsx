import { ReactNode } from 'react';

type SearchResponseItem = {
  score: number | null;
  file_path: string;
  text: string;
  video_id?: string | null;
  video_url?: string | null;
};

type YoutubeVideoCardProps = {
  item: SearchResponseItem;
  index: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  decodedText: string;
};

export function YoutubeVideoCard({
  item,
  index,
  videoUrl,
  thumbnailUrl,
  decodedText
}: YoutubeVideoCardProps): ReactNode {
  return (
    <li className="result-card">
      {thumbnailUrl ? (
        <a
          href={videoUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="thumb-link"
          aria-label={`Open video result ${index + 1}`}
        >
          <img
            src={thumbnailUrl}
            alt={`YouTube thumbnail for result ${index + 1}`}
            className="result-thumb"
            loading="lazy"
            decoding="async"
          />
        </a>
      ) : null}
      <div className="card-head">
        <strong>#{index + 1}</strong>
        <span>score {typeof item.score === 'number' ? item.score.toFixed(4) : 'n/a'}</span>
      </div>
      <p>{decodedText}</p>
      <div className="card-foot">
        <code>{item.file_path}</code>
        {videoUrl ? (
          <a href={videoUrl} target="_blank" rel="noreferrer">
            Open video
          </a>
        ) : null}
      </div>
    </li>
  );
}
