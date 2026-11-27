import { fmtTime } from '../lib/utils';

export default function TrackList({ tracks, albumsById, currentId, isPlaying, onPlay, onDelete, showAlbum }) {
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
            <button
              className="track-del"
              onClick={() => onDelete(track)}
              aria-label={`Eliminar ${track.title}`}
              title="Eliminar"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
