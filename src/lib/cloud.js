import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { deleteObject, getBlob, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { putAlbum, putTrack } from './db';

const COL_ALBUMS = 'onda_albums';
const COL_TRACKS = 'onda_tracks';

const audioPath = (uid, trackId) => `onda/${uid}/${trackId}`;
const coverPath = (uid, albumId) => `onda/${uid}/cover-${albumId}`;

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const signInUser = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signOutUser = () => signOut(auth);
// Marcador para saber que venimos de una redirección de Google: si al volver
// el resultado llega vacío, el navegador perdió la sesión entre sitios.
const REDIRECT_FLAG = 'onda-google-redirect';

const readRedirectFlag = () => {
  try {
    return sessionStorage.getItem(REDIRECT_FLAG);
  } catch {
    return null;
  }
};

const clearRedirectFlag = () => {
  try {
    sessionStorage.removeItem(REDIRECT_FLAG);
  } catch {
    /* modo privado sin almacenamiento */
  }
};

export async function completeGoogleRedirect() {
  const result = await getRedirectResult(auth);
  const pending = readRedirectFlag();
  clearRedirectFlag();
  if (!result?.user && pending) {
    const err = new Error('Google no devolvió la sesión tras la redirección');
    err.code = 'auth/redirect-lost';
    throw err;
  }
  return result;
}

const googleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

const isMobileBrowser = () => {
  const ua = navigator.userAgent;
  // iPadOS se identifica como Macintosh
  return (
    /iPhone|iPad|iPod|Android/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
};

const isIosDevice = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

export const isIosStandalone = () =>
  isIosDevice() &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true);

export const isInAppBrowser = () =>
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Twitter|MicroMessenger|Snapchat|Pinterest/i.test(
    navigator.userAgent || ''
  );

async function redirectToGoogle() {
  try {
    sessionStorage.setItem(REDIRECT_FLAG, String(Date.now()));
  } catch {
    /* sin almacenamiento: solo se pierde la detección */
  }
  await signInWithRedirect(auth, googleProvider());
  return null;
}

export async function signInWithGoogle() {
  // Safari en iPhone suele perder el resultado de la redirección (bloquea el
  // almacenamiento entre sitios), así que ahí se intenta primero la ventana
  // emergente y la redirección queda como respaldo.
  const popupFirst = isIosDevice() && !isIosStandalone();
  if (isMobileBrowser() && !popupFirst) {
    return redirectToGoogle();
  }
  try {
    return await signInWithPopup(auth, googleProvider());
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw err;
    }
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/web-storage-unsupported'
    ) {
      return redirectToGoogle();
    }
    throw err;
  }
}

// La biblioteca es compartida: cualquier sesión ve todo el catálogo.
export async function fetchCloudLibrary() {
  const [albumsSnap, tracksSnap] = await Promise.all([
    getDocs(collection(db, COL_ALBUMS)),
    getDocs(collection(db, COL_TRACKS)),
  ]);
  return {
    albums: albumsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    tracks: tracksSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export async function uploadAlbumCover(uid, albumId, blob) {
  const r = ref(storage, coverPath(uid, albumId));
  await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(r);
}

export async function downloadAlbumCover(uid, albumId) {
  return getBlob(ref(storage, coverPath(uid, albumId)));
}

export async function uploadTrackAudio(uid, trackId, blob) {
  const r = ref(storage, audioPath(uid, trackId));
  await uploadBytes(r, blob, { contentType: blob.type || 'audio/mpeg' });
}

export async function downloadTrackAudio(uid, trackId) {
  return getBlob(ref(storage, audioPath(uid, trackId)));
}

export async function saveAlbumCloud(uid, album) {
  await setDoc(doc(db, COL_ALBUMS, album.id), {
    uid: album.ownerUid || uid,
    name: album.name,
    artist: album.artist || '',
    spotifyUrl: album.spotifyUrl || '',
    ytUrl: album.ytUrl || '',
    coverUrl: album.coverUrl || '',
    builtIn: Boolean(album.builtIn),
    createdAt: Number(album.createdAt) || Date.now(),
  });
}

export async function saveTrackCloud(uid, track) {
  await setDoc(doc(db, COL_TRACKS, track.id), {
    uid: track.ownerUid || uid,
    albumId: track.albumId,
    title: track.title,
    artist: track.artist || '',
    duration: Number(track.duration) || 0,
    fileName: track.fileName || '',
    addedAt: Number(track.addedAt) || Date.now(),
  });
}

export async function deleteTrackCloud(uid, trackId) {
  try {
    await deleteObject(ref(storage, audioPath(uid, trackId)));
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') throw err;
  }
  await deleteDoc(doc(db, COL_TRACKS, trackId));
}

export async function deleteAlbumCloud(uid, albumId) {
  try {
    await deleteObject(ref(storage, coverPath(uid, albumId)));
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') throw err;
  }
  await deleteDoc(doc(db, COL_ALBUMS, albumId));
}

// Sube metadatos + audio a la nube. Los IDs locales se conservan para que
// la caché de audio (IndexedDB) siga sirviendo sin volver a descargar.
// Un archivo que falla no detiene al resto: queda pendiente para el próximo
// arranque. Devuelve cuántos elementos no se pudieron subir.
export async function pushLocalLibrary(uid, albums, tracks, onProgress) {
  const total = albums.length + tracks.length;
  let done = 0;
  let failed = 0;
  let firstError = null;
  const step = () => onProgress?.(done, total);

  for (const album of albums) {
    try {
      let coverUrl = album.coverUrl || '';
      if (album.coverBlob) {
        try {
          coverUrl = await uploadAlbumCover(uid, album.id, album.coverBlob);
        } catch (err) {
          failed += 1;
          firstError = firstError || err;
        }
      }
      const next = { ...album, coverUrl, synced: true, ownerUid: uid };
      await saveAlbumCloud(uid, next);
      await putAlbum(next);
    } catch (err) {
      failed += 1;
      firstError = firstError || err;
    }
    done += 1;
    step();
  }

  for (const track of tracks) {
    if (!track.blob) {
      done += 1;
      step();
      continue;
    }
    try {
      await uploadTrackAudio(uid, track.id, track.blob);
      const next = { ...track, synced: true, ownerUid: uid };
      await saveTrackCloud(uid, next);
      await putTrack(next);
    } catch (err) {
      failed += 1;
      firstError = firstError || err;
    }
    done += 1;
    step();
  }
  return { failed, firstError };
}

export function storageErrorMessage(err) {
  const raw = `${err?.customData?.serverResponse || ''} ${err?.message || ''}`;
  if (/billing|accountdisabled|state closed/i.test(raw)) {
    return 'Firebase Storage está deshabilitado: la facturación del proyecto está cerrada. Reactívala en Firebase → Uso y facturación.';
  }
  if (err?.code === 'storage/unauthorized') {
    return 'Firebase Storage rechazó la subida (revisa las reglas).';
  }
  if (err?.code === 'storage/retry-limit-exceeded' || err?.code === 'storage/canceled') {
    return 'Se cortó la subida. Revisa tu conexión.';
  }
  return '';
}

export function mergeCloudLibrary(cloud, localAlbums, localTracks, uid) {
  const localAlbumById = new Map(localAlbums.map((a) => [a.id, a]));
  const localTrackById = new Map(localTracks.map((t) => [t.id, t]));

  const albums = cloud.albums.map((album) => {
    const local = localAlbumById.get(album.id);
    return {
      ...local,
      ...album,
      coverBlob: local?.coverBlob || null,
      synced: true,
      ownerUid: album.uid || uid,
    };
  });
  const tracks = cloud.tracks.map((track) => {
    const local = localTrackById.get(track.id);
    return {
      ...local,
      ...track,
      blob: local?.blob,
      synced: true,
      ownerUid: track.uid || uid,
    };
  });
  return { albums, tracks };
}

// Locales ya sincronizados que desaparecieron de la nube (borrados en otro
// dispositivo). Los que nunca se sincronizaron no se tocan.
export function staleLocalItems(cloud, localAlbums, localTracks) {
  const albumIds = new Set(cloud.albums.map((a) => a.id));
  const trackIds = new Set(cloud.tracks.map((t) => t.id));
  return {
    albumIds: localAlbums.filter((a) => a.synced && !albumIds.has(a.id)).map((a) => a.id),
    trackIds: localTracks.filter((t) => t.synced && !trackIds.has(t.id)).map((t) => t.id),
  };
}

export function authErrorMessage(err) {
  const code = err?.code || '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found') ||
    code.includes('invalid-email')
  ) {
    return 'Correo o contraseña incorrectos.';
  }
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera unos minutos.';
  if (code.includes('network-request-failed')) return 'Sin conexión a internet.';
  if (code.includes('operation-not-allowed')) {
    return 'Ese método de inicio de sesión está desactivado en Firebase. Actívalo en Authentication → Sign-in method.';
  }
  if (code.includes('unauthorized-domain')) {
    return 'Google no está autorizado en este enlace (los dominios de vista previa de Vercel cambian en cada despliegue). Abre https://ameri50.github.io/music/ e inicia sesión ahí.';
  }
  if (code.includes('popup-blocked')) {
    return 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e intenta de nuevo.';
  }
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
    return 'Se canceló el inicio de sesión con Google.';
  }
  if (code.includes('web-storage-unsupported')) {
    return 'Safari está bloqueando el almacenamiento. Desactiva la navegación privada e intenta de nuevo.';
  }
  if (code.includes('redirect-cancelled-by-user')) {
    return 'Se canceló el inicio de sesión con Google.';
  }
  if (code.includes('redirect-lost')) {
    return isIosStandalone()
      ? 'Google entró pero la app instalada no pudo recuperar la sesión. Abre ameri50.github.io/music en Safari o entra con correo y contraseña.'
      : 'Google se abrió pero el navegador no devolvió la sesión. Toca de nuevo y elige la misma cuenta, o entra con correo y contraseña.';
  }
  if (code.includes('redirect-operation-pending')) {
    return 'Ya hay un inicio de sesión en curso. Espera un momento.';
  }
  if (code.includes('account-exists-with-different-credential')) {
    return 'Ese correo ya está registrado con contraseña. Entra con tu correo y contraseña.';
  }
  if (code.includes('disallowed_useragent')) {
    return 'Google bloqueó el navegador integrado de otra app. Abre esta página en Safari o Chrome.';
  }
  if (code.includes('permission-denied')) {
    return 'Esta cuenta no tiene permisos de administrador en Firebase.';
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}
