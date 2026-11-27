# ONDA — tu música, sin anuncios

Reproductor de música personal hecho en React. Sube tus canciones y escúchalas sin anuncios, incluso con la pantalla del celular apagada.

**App en vivo:** https://ameri50.github.io/music/

## Qué incluye

- **Biblioteca local**: tus archivos de audio viven en tu dispositivo (IndexedDB). Nada se sube a un servidor.
- **Álbum de Anuel** ya creado, con enlace a la playlist oficial de YouTube y espacio para subir sus canciones.
- **Enlaces por álbum**: agrega links de Spotify o YouTube desde *Editar* (abren la app oficial; el audio se reproduce ahí).
- **Subida ilimitada**: arrastra MP3/M4A/WAV/FLAC/OGG o usa el botón *Agregar*; crea tus propios álbumes con portada.
- **Reproducción en segundo plano**: al bloquear el celular la música sigue sonando y aparecen los controles en la pantalla de bloqueo (Media Session API).
- **Reproductor completo**: play/pausa, siguiente/anterior, barra de progreso, volumen, aleatorio y repetir.
- **Recuerda dónde ibas**: al volver a abrir, restaura la última canción y su posición.

## Por qué no trae el audio de YouTube

Descargar o extraer el audio de una playlist de YouTube va contra sus términos y no es legal para música con derechos. Por eso el álbum de Anuel viene con el enlace a la playlist oficial y un espacio donde subes los archivos que ya tengas. Todo lo demás funciona igual.

## Uso local

```bash
npm install
npm run dev
# abre http://localhost:5173/music/
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

## Deploy en GitHub Pages

El proyecto ya está configurado con `base: '/music/'` para servir en `https://ameri50.github.io/music/`. Publica el contenido de `dist/` en una rama `gh-pages` y activa GitHub Pages en el repositorio.
