export const uid = () =>
  globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtTotal(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function parseFileName(name = '') {
  const base = name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return { artist, title: title || base };
  }
  return { artist: '', title: base };
}

export function hueOf(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export function initialsOf(str = '') {
  const parts = str.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((w) => w[0]).join('').toUpperCase() || '♪';
}

export function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const finish = (d) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(d);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => finish(0);
    setTimeout(() => finish(0), 8000);
    audio.src = url;
  });
}
