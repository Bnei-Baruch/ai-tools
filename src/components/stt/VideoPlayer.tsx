import { useEffect, useState, type ReactNode, type RefObject, type SyntheticEvent } from 'react';

interface Props {
  src: string;
  // WebVTT object URL; adds the subtitles track and its on/off toggle
  trackUrl: string | null;
  trackLabel: string;
  videoRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (time: number) => void;
  // false: no native controls, the caller renders its own (as children, under the video)
  controls?: boolean;
  onLoadedMetadata?: (e: SyntheticEvent<HTMLVideoElement>) => void;
  className?: string;
  children?: ReactNode;
}

export default function VideoPlayer({
  src, trackUrl, trackLabel, videoRef, onTimeUpdate, controls = true, onLoadedMetadata, className, children,
}: Props) {
  const [subtitles, setSubtitles] = useState(true);

  // <track default> is only honored on load, so toggle the text track mode directly.
  useEffect(() => {
    const track = videoRef.current?.textTracks[0];
    if (track) track.mode = subtitles ? 'showing' : 'hidden';
  }, [subtitles, trackUrl, videoRef]);

  return (
    <div className={className ? `player ${className}` : 'player'}>
      <video
        ref={videoRef}
        key={src + '|' + (trackUrl ?? '')}
        src={src}
        controls={controls}
        crossOrigin="anonymous"
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const track = e.currentTarget.textTracks[0];
          if (track) track.mode = subtitles ? 'showing' : 'hidden';
          onLoadedMetadata?.(e);
        }}
      >
        {trackUrl && <track kind="subtitles" label={trackLabel} srcLang="he" src={trackUrl} default />}
      </video>
      {trackUrl && (
        <label className="player__toggle">
          <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
          כתוביות
        </label>
      )}
      {children}
    </div>
  );
}
