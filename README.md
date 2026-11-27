# ONDA — tu música, sin anuncios

Reproductor de música personal hecho en React. Sube tus canciones y escúchalas sin anuncios, incluso con la pantalla del celular apagada.

**App en vivo:** https://ameri50.github.io/music/

## Qué incluye

- **Biblioteca sincronizada**: con tu cuenta de administrador, álbumes y canciones se guardan en Firebase (Firestore + Storage) y aparecen en todos tus dispositivos. El audio se cachea en IndexedDB para seguir sonando sin conexión.
- **Álbum de Anuel** ya creado, con enlace a la playlist oficial de YouTube y espacio para subir sus canciones.
- **Enlaces por álbum**: agrega links de Spotify o YouTube desde *Editar* (abren la app oficial; el audio se reproduce ahí).
- **Subida ilimitada**: arrastra MP3/M4A/WAV/FLAC/OGG o usa el botón *Agregar*; crea tus propios álbumes con portada.
- **Reproducción en segundo plano**: al bloquear el celular la música sigue sonando y aparecen los controles en la pantalla de bloqueo (Media Session API).
- **Reproductor completo**: play/pausa, siguiente/anterior, barra de progreso, volumen, aleatorio y repetir.
- **Recuerda dónde ibas**: al volver a abrir, restaura la última canción y su posición.

## Por qué no trae el audio de YouTube

Descargar o extraer el audio de una playlist de YouTube va contra sus términos y no es legal para música con derechos. Por eso el álbum de Anuel viene con el enlace a la playlist oficial y un espacio donde subes los archivos que ya tengas. Todo lo demás funciona igual.

## Cuenta y sincronización

Al abrir la app pide iniciar sesión con la **cuenta de administrador de Firebase** del proyecto `miapp-4a216` (la misma del panel de la tienda). Con esa sesión:

- Los álbumes se guardan en la colección `onda_albums` y las canciones en `onda_tracks`, filtrados por tu `uid`.
- El audio y las portadas van a Firebase Storage en `onda/<uid>/…`; Firestore solo guarda los metadatos.
- La primera vez que inicias sesión en un dispositivo, lo que ya tenías en local se sube solo a la nube (con barra de progreso).
- Al volver a abrir o cambiar de dispositivo, la nube manda: los cambios y borrados hechos en otro lado se reflejan (el audio se descarga y queda cacheado).
- Las reglas de Firestore/Storage no cambian: ya permiten solo a los administradores, así que cualquier otro correo verá un error de permisos.

> La biblioteca (audio incluido) se comparte con el resto del proyecto Firebase, ojo con la cuota gratuita de Storage/Firestore.

## Uso local

```bash
npm install
npm run dev
# abre http://localhost:5173/
```

## Build

```bash
npm run build
npm run preview
```

## En el iPhone (pantalla apagada)

1. Abre la página en Safari.
2. Toca **Compartir → Añadir a pantalla de inicio**.
3. Abre la app desde el ícono, dale play y bloquea el teléfono.
4. La música sigue sonando y puedes controlarla desde la pantalla de bloqueo.

En Android basta con reproducir y bloquear: el navegador muestra los controles en la notificación.

## Deploy

La build usa `base: './'` (rutas relativas), así que el mismo `dist/` funciona tanto en `https://ameri50.github.io/music/` como en Vercel (raíz del dominio) sin tocar nada.

- **GitHub Pages:** publica el contenido de `dist/` en la rama `gh-pages` (incluye un archivo `.nojekyll`).
- **Vercel:** conecta el repositorio; detecta Vite y publica `dist/` automáticamente.
