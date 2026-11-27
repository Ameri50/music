import AlbumCover from './AlbumCover';
import { fmtTime } from '../lib/utils';

const REPEAT_LABEL = { all: 'Repetir todo', one: 'Repetir una', off: 'Sin repetición' };

const Icon = {
  prev: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 20 9 12l10-8v16Z" fill="currentColor" />
      <rect x="5" y="4" width="2.6" height="16" rx="1.1" fill="currentColor" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4l10 8-10 8V4Z" fill="currentColor" />
      <rect x="16.4" y="4" width="2.6" height="16" rx="1.1" fill="currentColor" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.9l10.8-6.86a1.05 1.05 0 0 0 0-1.8L9.56 4.24A1.05 1.05 0 0 0 8 5.14Z" fill="currentColor" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
    </svg>
  ),
  shuffle: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h3.2c1.4 0 2.7.7 3.5 1.8l6.6 8.4c.8 1.1 2.1 1.8 3.5 1.8H21" />
      <path d="M21 6h-1.2c-1.4 0-2.7.7-3.5 1.8l-1.1 1.4M3 18h3.2c1.4 0 2.7-.7 3.5-1.8l1.1-1.4" />
      <path d="M18 3l3 3-3 3M18 15l3 3-3 3" />
    </svg>
  ),
  repeat: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  volume: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor" />
      <path d="M15 8.5a5 5 0 0 1 0 7M17.6 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

export default function Player({
  track,
  album,
  isPlaying,
  time,
  duration,
  volume,
  shuffle,
  repeat,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onShuffle,
  onRepeat,
  onLyrics,
}) {
  const pct = duration ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className={`player ${track ? '' : 'is-empty'}`}>
      <div className="seek-wrap">
        <input
          className="seek"
          type="range"
          min="0"
          max={Math.max(duration || 0, 0.1)}
          step="0.5"
          value={Math.min(time, duration || 0)}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{ '--pct': `${pct}%` }}
          disabled={!track}
          aria-label="Posición de la canción"
        />
      </div>
      <div className="player-inner">
        <div className="now">
          <AlbumCover album={album} className="now-cover" />
          <button
            type="button"
            className="now-text"
            onClick={onLyrics}
            disabled={!track}
            title={track ? 'Ver letra' : undefined}
            aria-label={track ? `Ver letra de ${track.title}` : undefined}
          >
            <span className="now-title">{track ? track.title : 'Nada sonando'}</span>
            <span className="now-sub">
              {track ? track.artist || album?.artist || album?.name || 'ONDA' : 'Elige una canción'}
            </span>
            {track && (
              <span className="now-time">
                {fmtTime(time)} / {fmtTime(duration)}
              </span>
            )}
          </button>
        </div>

        <div className="controls">
          <button
            className={`icon-btn ghost shuffle-btn ${shuffle ? 'on' : ''}`}
            onClick={onShuffle}
            aria-label="Aleatorio"
            title="Aleatorio"
          >
            {Icon.shuffle}
          </button>
          <button className="icon-btn" onClick={onPrev} disabled={!track} aria-label="Anterior" title="Anterior">
            {Icon.prev}
          </button>
          <button
            className="play-btn"
            onClick={onToggle}
            disabled={!track}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? Icon.pause : Icon.play}
          </button>
          <button className="icon-btn" onClick={onNext} disabled={!track} aria-label="Siguiente" title="Siguiente">
            {Icon.next}
          </button>
          <button
            className={`icon-btn ghost repeat-btn ${repeat !== 'off' ? 'on' : ''}`}
            onClick={onRepeat}
            aria-label={REPEAT_LABEL[repeat]}
            title={REPEAT_LABEL[repeat]}
          >
            {Icon.repeat}
          </button>
        </div>

        <div className="vol">
          <span className="vol-icon">{Icon.volume}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Volumen"
          />
        </div>
      </div>
    </div>
  );
}
