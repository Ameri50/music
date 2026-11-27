import { useObjectUrl } from '../lib/useObjectUrl';
import { hueOf, initialsOf } from '../lib/utils';

export default function AlbumCover({ album, className = '' }) {
  const url = useObjectUrl(album?.coverBlob);
  const name = album?.name || 'ONDA';
  const hue = hueOf(name);
  const style = url
    ? { backgroundImage: `url("${url}")` }
    : {
        background: `linear-gradient(135deg, hsl(${hue} 62% 42%), hsl(${(hue + 52) % 360} 68% 22%))`,
      };

  return (
    <div className={`cover ${url ? 'has-img' : ''} ${className}`} style={style} aria-hidden="true">
      {!url && <span>{initialsOf(name)}</span>}
    </div>
  );
}
