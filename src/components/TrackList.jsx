import { fmtTime } from '../lib/utils';

export default function TrackList({ tracks, albumsById, currentId, isPlaying, onPlay, onLyrics, onDelete, showAlbum, canDelete }) {
  if (!tracks.length) return null;
  return (
    <ul className="track-list">
      {tracks.map((track, i) => {
        const active = track.id === currentId;
        return (
          <li key={track.id} className={`track ${active ? 'is-active' : ''}`}>
            <button className="track-main" onClick={() => onPlay(track)}>
              <span className="track-index">
                {active && isPlaying ? (
                  <span className="eq" aria-label="Sonando">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              <span className="track-info">
                <span className="track-title">{track.title}</span>
                <span className="track-sub">
                  {showAlbum
                    ? albumsById[track.albumId]?.name || 'Sin álbum'
                    : track.artist || 'Artista desconocido'}
                </span>
              </span>
              <span className="track-dur">{fmtTime(track.duration)}</span>
            </button>
            {onLyrics && (
              <button
                className="track-lyr"
                onClick={() => onLyrics(track)}
                aria-label={`Ver letra de ${track.title}`}
                title="Letra"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                >
                  <path d="M5 7h14M5 12h14M5 17h9" />
                </svg>
              </button>
            )}
            {(!canDelete || canDelete(track)) && (
              <button
                className="track-del"
                onClick={() => onDelete(track)}
                aria-label={`Eliminar ${track.title}`}
                title="Eliminar"
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
