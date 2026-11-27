import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAlbums,
  getTracks,
  putAlbum,
  putTrack,
  removeAlbum,
  removeTrack,
} from './lib/db';
import { fmtTotal, isAudioFile, normalizeAudioFile, parseFileName, readDuration, uid } from './lib/utils';
import {
  authErrorMessage,
  deleteAlbumCloud,
  deleteTrackCloud,
  downloadTrackAudio,
  fetchCloudLibrary,
  mergeCloudLibrary,
  pushLocalLibrary,
  saveAlbumCloud,
  saveTrackCloud,
  signInUser,
  signOutUser,
  staleLocalItems,
  uploadAlbumCover,
  uploadTrackAudio,
  watchAuth,
} from './lib/cloud';
import { useObjectUrl } from './lib/useObjectUrl';
import AlbumCover from './components/AlbumCover';
import Player from './components/Player';
import TrackList from './components/TrackList';
import Login from './components/Login';

const PLAYLIST_URL =
  'https://youtube.com/playlist?list=OLAK5uy_lp0eCIgHOF-u_WvpBMef-eVNUDAwT14tg&si=gZ08a4L7MEKGStsB';
const REAL_HASTA_SPOTIFY =
  'https://open.spotify.com/intl-es/album/4Gqg391dMB9BA7pPW331Ag?si=H5XjjPQgSJ6eOvgiylsMvA';
const REPEAT_CYCLE = { all: 'one', one: 'off', off: 'all' };

let bootProgressCb = null;
const bootCache = new Map();

async function syncLibrary(user, progress) {
  const uidKey = user.uid;
  const localAlbums = await getAlbums();
  const localTracks = await getTracks();
  let cloud = await fetchCloudLibrary(uidKey);

  const ownAlbums = localAlbums.filter((a) => !a.ownerUid || a.ownerUid === uidKey);
  const ownTracks = localTracks.filter((t) => !t.ownerUid || t.ownerUid === uidKey);

  if (!cloud.albums.length && !cloud.tracks.length) {
    if (ownAlbums.length) {
      // primera sincronización: sube lo que ya existe en este dispositivo
      progress('Subiendo tu biblioteca a la nube…');
      await pushLocalLibrary(
        uidKey,
        [...ownAlbums].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
        ownTracks.filter((t) => t.blob),
        (done, total) => progress(`Subiendo biblioteca… ${done}/${total}`)
      );
      cloud = await fetchCloudLibrary(uidKey);
    } else {
      progress('Preparando tu biblioteca…');
      const now = Date.now();
      await saveAlbumCloud(uidKey, {
        id: 'builtin-anuel-aa',
        name: 'Anuel AA',
        artist: 'Anuel AA',
        ytUrl: PLAYLIST_URL,
        builtIn: true,
        createdAt: now,
      });
      await saveAlbumCloud(uidKey, {
        id: 'builtin-sencillos',
        name: 'Sencillos',
        artist: '',
        builtIn: true,
        createdAt: now + 1,
      });
      cloud = await fetchCloudLibrary(uidKey);
    }
  } else {
    const unsyncedAlbums = ownAlbums.filter((a) => !a.synced);
    const unsyncedTracks = ownTracks.filter((t) => !t.synced && t.blob);
    if (unsyncedAlbums.length || unsyncedTracks.length) {
      progress('Subiendo cambios…');
      await pushLocalLibrary(uidKey, unsyncedAlbums, unsyncedTracks, (done, total) =>
        progress(`Subiendo cambios… ${done}/${total}`)
      );
      cloud = await fetchCloudLibrary(uidKey);
    }
  }

  // completa el link de Spotify en álbumes de Real Hasta la Muerte sin enlace
  for (const album of cloud.albums) {
    if (
      album.name.trim().toLowerCase().startsWith('real hasta la muerte') &&
      !album.spotifyUrl
    ) {
      album.spotifyUrl = REAL_HASTA_SPOTIFY;
      await saveAlbumCloud(uidKey, album);
    }
  }

  // reintenta portadas que quedaron pendientes en una subida anterior
  const localAlbumById = new Map(localAlbums.map((a) => [a.id, a]));
  for (const album of cloud.albums) {
    const local = localAlbumById.get(album.id);
    if (!album.coverUrl && local?.coverBlob) {
      try {
        album.coverUrl = await uploadAlbumCover(uidKey, album.id, local.coverBlob);
        await saveAlbumCloud(uidKey, album);
      } catch {
        /* se reintenta en el próximo arranque */
      }
    }
  }

  const { albums, tracks } = mergeCloudLibrary(cloud, localAlbums, localTracks, uidKey);
  const stale = staleLocalItems(cloud, localAlbums, localTracks, uidKey);
  for (const id of stale.albumIds) await removeAlbum(id);
  for (const id of stale.trackIds) await removeTrack(id);
  for (const album of albums) await putAlbum(album);
  for (const track of tracks) await putTrack(track);
  albums.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  tracks.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  return { albums, tracks };
}

function bootForUser(user) {
  if (!bootCache.has(user.uid)) {
    const promise = syncLibrary(user, (text) => bootProgressCb?.(text)).catch((err) => {
      bootCache.delete(user.uid);
      throw err;
    });
    bootCache.set(user.uid, promise);
  }
  return bootCache.get(user.uid);
}

export default function App() {
  const audioRef = useRef(null);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const targetAlbumRef = useRef(null);
  const playOnLoadRef = useRef(false);
  const pendingRestoreRef = useRef(null);
  const toastTimer = useRef(null);

  const [albums, setAlbums] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ name: 'home' });
  const [query, setQuery] = useState('');
  const [queue, setQueue] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('all');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  const [albumModal, setAlbumModal] = useState(null);
  const [user, setUser] = useState(undefined); // undefined = comprobando sesión
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [bootError, setBootError] = useState('');
  const [bootText, setBootText] = useState('Preparando…');

  const tracksRef = useRef(tracks);
  const navRef = useRef({});
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    navRef.current = { queue, currentId, shuffle, repeat };
  }, [queue, currentId, shuffle, repeat]);

  const currentTrack = tracks.find((t) => t.id === currentId) || null;
  const currentAlbum = albums.find((a) => a.id === currentTrack?.albumId) || null;
  const coverUrl =
    useObjectUrl(currentAlbum?.coverBlob) || currentAlbum?.coverUrl || '';
  const albumsById = useMemo(
    () => Object.fromEntries(albums.map((a) => [a.id, a])),
    [albums]
  );
  const supportsFolder = useMemo(
    () => 'webkitdirectory' in document.createElement('input'),
    []
  );

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3400);
  }, []);

  useEffect(() => {
    const unsub = watchAuth((nextUser) => {
      setUser(nextUser);
      setAuthBusy(false);
      if (nextUser) {
        setAuthError('');
        setBootError('');
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    bootProgressCb = setBootText;
    return () => {
      bootProgressCb = null;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setReady(false);
      setAlbums([]);
      setTracks([]);
      setQueue([]);
      setCurrentId(null);
      setIsPlaying(false);
      audioRef.current?.pause();
      return;
    }
    let alive = true;
    setBootError('');
    setReady(false);
    bootForUser(user)
      .then(({ albums: savedAlbums, tracks: savedTracks }) => {
        if (!alive) return;
        setAlbums(savedAlbums);
        setTracks(savedTracks);
        setReady(true);
        try {
          const saved = JSON.parse(localStorage.getItem('onda-session') || 'null');
          if (!saved) return;
          if (typeof saved.volume === 'number') setVolume(saved.volume);
          if (saved.repeat in REPEAT_CYCLE) setRepeat(saved.repeat);
          if (typeof saved.shuffle === 'boolean') setShuffle(saved.shuffle);
          if (saved.trackId && savedTracks.some((t) => t.id === saved.trackId)) {
            const savedQueue = Array.isArray(saved.queue)
              ? saved.queue.filter((id) => savedTracks.some((t) => t.id === id))
              : [];
            setQueue(savedQueue.length ? savedQueue : savedTracks.map((t) => t.id));
            pendingRestoreRef.current = { trackId: saved.trackId, time: Number(saved.time) || 0 };
            setCurrentId(saved.trackId);
          }
        } catch {
          /* sesión corrupta: se ignora */
        }
      })
      .catch((err) => {
        if (!alive) return;
        console.error(err);
        setBootError(
          err?.code?.includes('permission-denied')
            ? authErrorMessage(err)
            : 'No se pudo cargar la biblioteca. Revisa tu conexión e intenta de nuevo.'
        );
      });
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const handleSignIn = useCallback(async (email, password) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      await signInUser(email, password);
    } catch (err) {
      setAuthError(authErrorMessage(err));
      setAuthBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!confirm('¿Cerrar sesión? Tu biblioteca seguirá guardada en la nube.')) return;
    bootCache.clear();
    audioRef.current?.pause();
    await signOutUser();
  }, []);

  const refreshingRef = useRef(false);
  const refreshLibrary = useCallback(async () => {
    if (!user || !ready || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const cloud = await fetchCloudLibrary(user.uid);
      const localAlbums = await getAlbums();
      const localTracks = await getTracks();
      const stale = staleLocalItems(cloud, localAlbums, localTracks, user.uid);
      for (const id of stale.albumIds) await removeAlbum(id);
      for (const id of stale.trackIds) await removeTrack(id);
      const { albums: mergedAlbums, tracks: mergedTracks } = mergeCloudLibrary(
        cloud,
        localAlbums,
        localTracks,
        user.uid
      );
      const cloudAlbumIds = new Set(mergedAlbums.map((a) => a.id));
      const cloudTrackIds = new Set(mergedTracks.map((t) => t.id));
      const nextAlbums = [
        ...mergedAlbums,
        ...localAlbums.filter((a) => !a.synced && !cloudAlbumIds.has(a.id)),
      ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const nextTracks = [
        ...mergedTracks,
        ...localTracks.filter((t) => !t.synced && !cloudTrackIds.has(t.id)),
      ].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
      for (const album of mergedAlbums) await putAlbum(album);
      for (const track of mergedTracks) await putTrack(track);
      setAlbums(nextAlbums);
      setTracks(nextTracks);
      setQueue((prev) => prev.filter((id) => nextTracks.some((t) => t.id === id)));
      if (navRef.current.currentId && !nextTracks.some((t) => t.id === navRef.current.currentId)) {
        audioRef.current?.pause();
        setCurrentId(null);
        setIsPlaying(false);
      }
    } catch {
      /* sin conexión: se conserva lo local */
    } finally {
      refreshingRef.current = false;
    }
  }, [user, ready]);

  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshLibrary();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [ready, refreshLibrary]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentId) return;
    const track = tracksRef.current.find((t) => t.id === currentId);
    if (!track) return;
    let cancelled = false;
    let objectUrl = '';

    const start = (blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      setTime(0);
      setDuration(track.duration || 0);
      audio.load();
      if (playOnLoadRef.current) {
        playOnLoadRef.current = false;
        audio.play().catch(() => {});
      }
    };

    if (track.blob) {
      start(track.blob);
    } else if (user) {
      setBusy('Descargando canción…');
      downloadTrackAudio(user.uid, track.id)
        .then(async (blob) => {
          if (cancelled) return;
          setBusy('');
          await putTrack({ ...track, blob });
          setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, blob } : t)));
          start(blob);
        })
        .catch(() => {
          if (cancelled) return;
          setBusy('');
          playOnLoadRef.current = false;
          setIsPlaying(false);
          notify('No se pudo descargar la canción. Revisa tu conexión.');
        });
    }

    return () => {
      cancelled = true;
      audio.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentId, user, notify]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const { currentId: cid, queue: currentQueue } = navRef.current;
    if (!cid) {
      if (currentQueue.length) {
        playOnLoadRef.current = true;
        setCurrentId(currentQueue[0]);
      }
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const next = useCallback((auto = false) => {
    const audio = audioRef.current;
    const { queue: currentQueue, currentId: cid, shuffle: sh, repeat: rp } = navRef.current;
    if (!audio || !currentQueue.length) return;
    if (rp === 'one' && auto) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    const idx = Math.max(0, currentQueue.indexOf(cid));
    let target;
    if (sh && currentQueue.length > 1) {
      do {
        target = currentQueue[Math.floor(Math.random() * currentQueue.length)];
      } while (target === cid);
    } else {
      let nextIdx = idx + 1;
      if (nextIdx >= currentQueue.length) {
        if (rp === 'off' && auto) {
          setIsPlaying(false);
          return;
        }
        nextIdx = 0;
      }
      target = currentQueue[nextIdx];
    }
    if (target === cid) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    playOnLoadRef.current = true;
    setCurrentId(target);
  }, []);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setTime(0);
      return;
    }
    const { queue: currentQueue, currentId: cid } = navRef.current;
    if (!audio || !currentQueue.length) return;
    const idx = Math.max(0, currentQueue.indexOf(cid));
    const target = idx <= 0 ? currentQueue[currentQueue.length - 1] : currentQueue[idx - 1];
    if (target === cid) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    playOnLoadRef.current = true;
    setCurrentId(target);
  }, []);

  const seek = useCallback((value) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setTime(value);
  }, []);

  const playTrack = useCallback((track, queueIds) => {
    const audio = audioRef.current;
    if (navRef.current.currentId === track.id) {
      audio?.play().catch(() => {});
      return;
    }
    setQueue(queueIds && queueIds.length ? queueIds : [track.id]);
    playOnLoadRef.current = true;
    setCurrentId(track.id);
  }, []);

  const onLoadedMetadata = (e) => {
    const audio = e.target;
    const dur = isFinite(audio.duration) ? audio.duration : 0;
    if (dur) setDuration(dur);
    const pending = pendingRestoreRef.current;
    if (pending && pending.trackId === navRef.current.currentId) {
      pendingRestoreRef.current = null;
      if (pending.time > 0 && (!dur || pending.time < dur - 0.5)) {
        audio.currentTime = pending.time;
        setTime(pending.time);
      }
    }
    if ('mediaSession' in navigator && dur > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: 1,
          position: Math.min(audio.currentTime, dur),
        });
      } catch {
        /* navegador sin soporte */
      }
    }
  };

  const onTimeUpdate = (e) => {
    const audio = e.target;
    setTime(audio.currentTime);
    if ('mediaSession' in navigator && isFinite(audio.duration) && audio.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime, audio.duration),
        });
      } catch {
        /* navegador sin soporte */
      }
    }
  };

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        /* noop */
      }
      return;
    }
    const artwork = [];
    if (coverUrl) artwork.push({ src: coverUrl, sizes: '512x512' });
    artwork.push({
      src: new URL('icon-512.png', document.baseURI).href,
      sizes: '512x512',
      type: 'image/png',
    });
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist || currentAlbum?.artist || 'ONDA',
        album: currentAlbum?.name || '',
        artwork,
      });
    } catch {
      /* noop */
    }
    const set = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {
        /* acción no soportada */
      }
    };
    set('play', () => toggle());
    set('pause', () => audioRef.current?.pause());
    set('previoustrack', () => prev());
    set('nexttrack', () => next(false));
    set('seekto', (details) => {
      if (details && typeof details.seekTime === 'number') seek(details.seekTime);
    });
    set('seekbackward', (details) =>
      seek(Math.max(0, (audioRef.current?.currentTime || 0) - (details?.seekOffset || 10)))
    );
    set('seekforward', (details) =>
      seek((audioRef.current?.currentTime || 0) + (details?.seekOffset || 10))
    );
  }, [currentTrack, currentAlbum, coverUrl, toggle, prev, next, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = !currentTrack
        ? 'none'
        : isPlaying
          ? 'playing'
          : 'paused';
    } catch {
      /* noop */
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (!ready) return;
    const save = () => {
      const audio = audioRef.current;
      try {
        localStorage.setItem(
          'onda-session',
          JSON.stringify({
            trackId: currentId,
            time: audio ? audio.currentTime : 0,
            volume,
            repeat,
            shuffle,
            queue,
          })
        );
      } catch {
        /* almacenamiento lleno */
      }
    };
    save();
    const id = setInterval(save, 3000);
    window.addEventListener('pagehide', save);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [ready, currentId, volume, repeat, shuffle, queue]);

  const defaultAlbumId = useCallback(
    () => (albums.find((a) => a.name === 'Sencillos') || albums[0] || {}).id,
    [albums]
  );

  const openPicker = useCallback(
    (albumId) => {
      const target = albumId || (view.name === 'album' ? view.id : defaultAlbumId());
      targetAlbumRef.current = target;
      if (fileRef.current) {
        fileRef.current.value = '';
        fileRef.current.click();
      }
    },
    [view, defaultAlbumId]
  );

  const handleFiles = useCallback(
    async (fileList, albumId) => {
      if (!albumId) {
        notify('Crea un álbum primero');
        return;
      }
      if (!user) return;
      const raw = Array.from(fileList || []).filter(isAudioFile);
      if (!raw.length) {
        notify('Esos archivos no son de audio');
        return;
      }
      const existing = new Set(
        tracksRef.current.filter((t) => t.albumId === albumId).map((t) => t.fileName)
      );
      const files = [];
      let skipped = 0;
      for (const file of raw) {
        if (existing.has(file.name)) {
          skipped += 1;
          continue;
        }
        existing.add(file.name);
        files.push(normalizeAudioFile(file));
      }
      if (!files.length) {
        notify('Esas canciones ya están en el álbum');
        return;
      }
      const album = albums.find((a) => a.id === albumId);
      setBusy(`Agregando ${files.length} ${files.length === 1 ? 'canción' : 'canciones'}…`);
      const added = [];
      for (const file of files) {
        const { artist, title } = parseFileName(file.name);
        const dur = await readDuration(file);
        const track = {
          id: uid(),
          albumId,
          title: title || file.name,
          artist: artist || album?.artist || '',
          duration: dur,
          blob: file,
          fileName: file.name,
          addedAt: Date.now(),
          synced: false,
          ownerUid: user.uid,
        };
        await putTrack(track);
        added.push(track);
      }
      setTracks((prev) => [...prev, ...added]);

      let pending = 0;
      for (let i = 0; i < added.length; i += 1) {
        const track = added[i];
        setBusy(`Subiendo a la nube… ${i + 1}/${added.length}`);
        try {
          await uploadTrackAudio(user.uid, track.id, track.blob);
          await saveTrackCloud(user.uid, track);
          const synced = { ...track, synced: true };
          await putTrack(synced);
          setTracks((prev) => prev.map((t) => (t.id === track.id ? synced : t)));
        } catch {
          pending += 1;
        }
      }
      setBusy('');
      const base =
        added.length === 1 ? `“${added[0].title}” agregada` : `${added.length} canciones agregadas`;
      const notes = [];
      if (skipped) notes.push(`${skipped} ya estaba${skipped === 1 ? '' : 'n'}`);
      if (pending) notes.push(`${pending} sin subir (revisa tu conexión)`);
      notify(notes.length ? `${base} · ${notes.join(' · ')}` : base);
    },
    [albums, notify, user]
  );

  const uploadTarget = useCallback(
    () => targetAlbumRef.current || (view.name === 'album' ? view.id : defaultAlbumId()),
    [view, defaultAlbumId]
  );

  const onFileInput = (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const target = uploadTarget();
    e.target.value = '';
    if (files.length) handleFiles(files, target);
  };

  const onFolderInput = (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const target = uploadTarget();
    e.target.value = '';
    if (files.length) handleFiles(files, target);
  };

  const openFolderPicker = useCallback(
    (albumId) => {
      targetAlbumRef.current = albumId || uploadTarget();
      if (folderRef.current) {
        folderRef.current.value = '';
        folderRef.current.click();
      }
    },
    [uploadTarget]
  );

  const createAlbum = async (data) => {
    if (!user) return;
    const album = {
      id: uid(),
      name: data.name,
      artist: data.artist,
      ytUrl: data.ytUrl || '',
      spotifyUrl: data.spotifyUrl || '',
      coverBlob: data.coverBlob || null,
      createdAt: Date.now(),
      synced: false,
      ownerUid: user.uid,
    };
    await putAlbum(album);
    setAlbums((prev) => [...prev, album]);
    setAlbumModal(null);
    setView({ name: 'album', id: album.id });
    try {
      let coverUrl = '';
      if (album.coverBlob) {
        try {
          coverUrl = await uploadAlbumCover(user.uid, album.id, album.coverBlob);
        } catch {
          /* sin portada remota: se sube al siguiente arranque */
        }
      }
      const synced = { ...album, coverUrl, synced: true };
      await saveAlbumCloud(user.uid, synced);
      await putAlbum(synced);
      setAlbums((prev) => prev.map((a) => (a.id === album.id ? synced : a)));
      notify('Álbum creado');
    } catch {
      notify('Álbum creado · quedó pendiente de subir a la nube');
    }
  };

  const saveAlbumEdits = async (album, data) => {
    if (!user) return;
    const updated = {
      ...album,
      name: data.name,
      artist: data.artist,
      ytUrl: data.ytUrl || '',
      spotifyUrl: data.spotifyUrl || '',
      ...(data.coverBlob ? { coverBlob: data.coverBlob } : {}),
    };
    await putAlbum(updated);
    setAlbums((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setAlbumModal(null);
    try {
      let coverUrl = updated.coverUrl || '';
      if (data.coverBlob) {
        try {
          coverUrl = await uploadAlbumCover(user.uid, updated.id, data.coverBlob);
        } catch {
          /* sin portada remota: se sube al siguiente arranque */
        }
      }
      const synced = { ...updated, coverUrl, synced: true };
      await saveAlbumCloud(user.uid, synced);
      await putAlbum(synced);
      setAlbums((prev) => prev.map((a) => (a.id === updated.id ? synced : a)));
      notify('Álbum actualizado');
    } catch {
      notify('Álbum actualizado · quedó pendiente de subir a la nube');
    }
  };

  const deleteTrackFlow = async (track) => {
    if (!confirm(`¿Eliminar “${track.title}” de tu biblioteca?`)) return;
    if (user && track.synced) {
      setBusy('Eliminando…');
      try {
        await deleteTrackCloud(user.uid, track.id);
      } catch {
        setBusy('');
        notify('No se pudo eliminar en la nube. Revisa tu conexión e intenta de nuevo.');
        return;
      }
      setBusy('');
    }
    await removeTrack(track.id);
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
    setQueue((prev) => prev.filter((id) => id !== track.id));
    if (navRef.current.currentId === track.id) {
      audioRef.current?.pause();
      setCurrentId(null);
      setIsPlaying(false);
    }
    notify('Canción eliminada');
  };

  const deleteAlbumFlow = async (album) => {
    if (!confirm(`¿Eliminar el álbum “${album.name}” y sus canciones?`)) return;
    const ids = tracks.filter((t) => t.albumId === album.id).map((t) => t.id);
    if (user) {
      setBusy('Eliminando…');
      try {
        for (const track of tracks.filter((t) => t.albumId === album.id)) {
          if (track.synced) await deleteTrackCloud(user.uid, track.id);
        }
        if (album.synced) await deleteAlbumCloud(user.uid, album.id);
      } catch {
        setBusy('');
        notify('No se pudo eliminar en la nube. Revisa tu conexión e intenta de nuevo.');
        return;
      }
      setBusy('');
    }
    for (const id of ids) await removeTrack(id);
    await removeAlbum(album.id);
    setTracks((prev) => prev.filter((t) => t.albumId !== album.id));
    setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    setQueue((prev) => prev.filter((id) => !ids.includes(id)));
    if (ids.includes(navRef.current.currentId)) {
      audioRef.current?.pause();
      setCurrentId(null);
      setIsPlaying(false);
    }
    setView({ name: 'home' });
    notify('Álbum eliminado');
  };

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return tracks
      .filter((t) => {
        const album = albumsById[t.albumId];
        return [t.title, t.artist, album?.name].some(
          (value) => value && value.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.addedAt - b.addedAt);
  }, [q, tracks, albumsById]);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.addedAt - b.addedAt),
    [tracks]
  );
  const songsView = q ? results : sortedTracks;
  const albumView = view.name === 'album' ? albumsById[view.id] : null;
  const albumTracks = albumView
    ? tracks.filter((t) => t.albumId === albumView.id).sort((a, b) => a.addedAt - b.addedAt)
    : [];
  const albumFiltered = q
    ? albumTracks.filter((t) => t.title.toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q))
    : albumTracks;

  if (user === undefined) {
    return (
      <div className="splash">
        <span className="splash-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <p>Comprobando sesión…</p>
      </div>
    );
  }

  if (!user) {
    return <Login onSignIn={handleSignIn} error={authError} busy={authBusy} />;
  }

  if (bootError) {
    return (
      <div className="splash">
        <h1>ONDA</h1>
        <p>{bootError}</p>
        <div className="splash-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reintentar
          </button>
          <button className="btn btn-ghost" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="splash">
        <span className="splash-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path
              d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <p>{bootText}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => next(true)}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
      />

      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setView({ name: 'home' });
            setQuery('');
          }}
          aria-label="Inicio"
        >
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-name">ONDA</span>
        </button>

        <div className="search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar canciones, artistas…"
            aria-label="Buscar"
          />
        </div>

        <button className="add-btn" onClick={() => openPicker()}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span>Agregar</span>
        </button>

        <button
          className="user-btn"
          title={user?.email || ''}
          aria-label={`Cerrar sesión de ${user?.email || ''}`}
          onClick={handleSignOut}
        >
          {(user?.email || '?').charAt(0).toUpperCase()}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus,.mpeg"
          multiple
          hidden
          onChange={onFileInput}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          webkitdirectory=""
          directory=""
          hidden
          onChange={onFolderInput}
        />
      </header>

      <main>
        {view.name === 'home' &&
          (q ? (
            <section>
              <div className="section-head">
                <h2>Resultados</h2>
                <span className="section-note">
                  {results.length} {results.length === 1 ? 'canción' : 'canciones'}
                </span>
              </div>
              {results.length ? (
                <TrackList
                  tracks={results}
                  albumsById={albumsById}
                  currentId={currentId}
                  isPlaying={isPlaying}
                  showAlbum
                  onPlay={(t) => playTrack(t, results.map((x) => x.id))}
                  onDelete={deleteTrackFlow}
                />
              ) : (
                <div className="empty">
                  <h3>Nada encontrado</h3>
                  <p>Prueba con otro nombre o sube más música.</p>
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="hero">
                <h1 className="hero-title">
                  Tu música.
                  <br />
                  <span>Sin anuncios.</span>
                </h1>
                <p className="hero-sub">
                  Sube tus canciones y escúchalas cuando quieras — incluso con la pantalla apagada,
                  con los controles en la pantalla de bloqueo.
                </p>
                <div className="hero-actions">
                  <button className="btn btn-primary" onClick={() => openPicker()}>
                    Agregar música
                  </button>
                  <button className="btn btn-ghost" onClick={() => setView({ name: 'songs' })}>
                    Ver canciones ({tracks.length})
                  </button>
                </div>
                <ul className="hero-features">
                  <li>Sin anuncios</li>
                  <li>Pantalla apagada</li>
                  <li>Solo tuyo</li>
                </ul>
              </section>

              <section>
                <div className="section-head">
                  <h2>Álbumes</h2>
                  <button className="text-btn" onClick={() => setAlbumModal('new')}>
                    + Nuevo álbum
                  </button>
                </div>
                <div className="album-grid">
                  {albums.map((album) => {
                    const count = tracks.filter((t) => t.albumId === album.id).length;
                    return (
                      <button
                        key={album.id}
                        className="album-card"
                        onClick={() => setView({ name: 'album', id: album.id })}
                      >
                        <AlbumCover album={album} />
                        <div className="album-name">{album.name}</div>
                        <div className="album-meta">
                          {count} {count === 1 ? 'canción' : 'canciones'}
                        </div>
                      </button>
                    );
                  })}
                  <button className="new-album" onClick={() => setAlbumModal('new')}>
                    <span className="plus">+</span>
                    <span>Nuevo álbum</span>
                  </button>
                </div>
              </section>
            </>
          ))}

        {view.name === 'album' &&
          (albumView ? (
            <section>
              <button className="back-btn" onClick={() => setView({ name: 'home' })}>
                ← Biblioteca
              </button>

              <div className="album-head">
                <AlbumCover album={albumView} className="cover-lg" />
                <div className="album-info">
                  <div className="album-kicker">Álbum</div>
                  <h1>{albumView.name}</h1>
                  <p className="album-meta-line">
                    {albumView.artist || 'Varios artistas'} · {albumTracks.length}{' '}
                    {albumTracks.length === 1 ? 'canción' : 'canciones'} ·{' '}
                    {fmtTotal(albumTracks.reduce((sum, t) => sum + (t.duration || 0), 0))}
                  </p>
                  <div className="album-actions">
                    <button
                      className="btn btn-primary"
                      disabled={!albumFiltered.length}
                      onClick={() =>
                        playTrack(
                          albumFiltered[0],
                          albumFiltered.map((t) => t.id)
                        )
                      }
                    >
                      ▶ Reproducir
                    </button>
                    {albumView.spotifyUrl && (
                      <a
                        className="btn btn-ghost"
                        href={albumView.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Spotify ↗
                      </a>
                    )}
                    {albumView.ytUrl && (
                      <a
                        className="btn btn-ghost"
                        href={albumView.ytUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Playlist en YouTube ↗
                      </a>
                    )}
                    <button className="btn btn-ghost" onClick={() => setAlbumModal(albumView)}>
                      Editar
                    </button>
                    {!albumView.builtIn && (
                      <button className="btn btn-danger" onClick={() => deleteAlbumFlow(albumView)}>
                        Eliminar álbum
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`dropzone ${dragging ? 'drag' : ''}`}
                onClick={() => openPicker(albumView.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFiles(e.dataTransfer.files, albumView.id);
                }}
              >
                <span className="dz-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path
                      d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>
                  <b>Arrastra tus archivos</b> o toca para elegir · MP3, M4A, WAV…
                </span>
              </div>

              {supportsFolder && (
                <div className="folder-hint">
                  <button className="folder-btn" onClick={() => openFolderPicker(albumView.id)}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                      <path
                        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Importar una carpeta completa de una vez
                  </button>
                </div>
              )}

              <div className="section-head">
                <h2>Canciones</h2>
              </div>

              {albumFiltered.length ? (
                <TrackList
                  tracks={albumFiltered}
                  albumsById={albumsById}
                  currentId={currentId}
                  isPlaying={isPlaying}
                  onPlay={(t) => playTrack(t, albumFiltered.map((x) => x.id))}
                  onDelete={deleteTrackFlow}
                />
              ) : (
                <div className="empty">
                  <h3>Este álbum está vacío</h3>
                  <p>Sube tus archivos de audio para empezar a escucharlo aquí.</p>
                </div>
              )}
            </section>
          ) : (
            <div className="empty">
              <h3>Álbum no encontrado</h3>
              <button className="btn btn-ghost" onClick={() => setView({ name: 'home' })}>
                Volver a la biblioteca
              </button>
            </div>
          ))}

        {view.name === 'songs' && (
          <section>
            <button className="back-btn" onClick={() => setView({ name: 'home' })}>
              ← Biblioteca
            </button>
            <div className="page-head">
              <h1>Canciones</h1>
              <p>
                {songsView.length} {songsView.length === 1 ? 'canción' : 'canciones'} ·{' '}
                {fmtTotal(songsView.reduce((sum, t) => sum + (t.duration || 0), 0))}
              </p>
              <div className="album-actions">
                <button
                  className="btn btn-primary"
                  disabled={!songsView.length}
                  onClick={() => playTrack(songsView[0], songsView.map((t) => t.id))}
                >
                  ▶ Reproducir todo
                </button>
              </div>
            </div>
            {songsView.length ? (
              <TrackList
                tracks={songsView}
                albumsById={albumsById}
                currentId={currentId}
                isPlaying={isPlaying}
                showAlbum
                onPlay={(t) => playTrack(t, songsView.map((x) => x.id))}
                onDelete={deleteTrackFlow}
              />
            ) : (
              <div className="empty">
                <h3>Tu biblioteca está vacía</h3>
                <p>Agrega tus canciones para empezar.</p>
              </div>
            )}
          </section>
        )}
      </main>

      <Player
        track={currentTrack}
        album={currentAlbum}
        isPlaying={isPlaying}
        time={time}
        duration={duration}
        volume={volume}
        shuffle={shuffle}
        repeat={repeat}
        onToggle={toggle}
        onNext={() => next(false)}
        onPrev={prev}
        onSeek={seek}
        onVolume={setVolume}
        onShuffle={() => setShuffle((v) => !v)}
        onRepeat={() => setRepeat((r) => REPEAT_CYCLE[r])}
      />

      {toast && <div className="toast">{toast}</div>}
      {busy && <div className="busy">{busy}</div>}
      {albumModal && (
        <AlbumModal
          album={albumModal === 'new' ? null : albumModal}
          onClose={() => setAlbumModal(null)}
          onSubmit={(data) =>
            albumModal === 'new' ? createAlbum(data) : saveAlbumEdits(albumModal, data)
          }
        />
      )}
    </div>
  );
}

function AlbumModal({ album, onClose, onSubmit }) {
  const editing = Boolean(album);
  const [name, setName] = useState(album?.name || '');
  const [artist, setArtist] = useState(album?.artist || '');
  const [spotifyUrl, setSpotifyUrl] = useState(album?.spotifyUrl || '');
  const [ytUrl, setYtUrl] = useState(album?.ytUrl || '');
  const [coverFile, setCoverFile] = useState(null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmit({
            name: name.trim(),
            artist: artist.trim(),
            spotifyUrl: spotifyUrl.trim(),
            ytUrl: ytUrl.trim(),
            coverBlob: coverFile || undefined,
          });
        }}
      >
        <h2>{editing ? 'Editar álbum' : 'Nuevo álbum'}</h2>
        <label>
          Nombre
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Real Hasta la Muerte"
            required
          />
        </label>
        <label>
          Artista
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label>
          Portada
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          Link de Spotify
          <input
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            placeholder="https://open.spotify.com/album/…"
            inputMode="url"
          />
        </label>
        <label>
          Link de YouTube
          <input
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            placeholder="Opcional"
            inputMode="url"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            {editing ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}
