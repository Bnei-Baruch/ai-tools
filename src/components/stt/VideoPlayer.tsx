import { useEffect, useState, type RefObject } from 'react';

interface Props {
  src: string;
  // WebVTT object URL; adds the subtitles track and its on/off toggle
  trackUrl: string | null;
  trackLabel: string;
  videoRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (time: number) => void;
}

export default function VideoPlayer({ src, trackUrl, trackLabel, videoRef, onTimeUpdate }: Props) {
  const [subtitles, setSubtitles] = useState(true);

  // <track default> is only honored on load, so toggle the text track mode directly.
  useEffect(() => {
    const track = videoRef.current?.textTracks[0];
    if (track) track.mode = subtitles ? 'showing' : 'hidden';
  }, [subtitles, trackUrl, videoRef]);

  return (
    <div className="player">
      <video
        ref={videoRef}
        key={src + '|' + (trackUrl ?? '')}
        src={src}
        controls
        crossOrigin="anonymous"
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const track = e.currentTarget.textTracks[0];
          if (track) track.mode = subtitles ? 'showing' : 'hidden';
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
    </div>
  );
}
