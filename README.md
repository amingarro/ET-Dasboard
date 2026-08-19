# ET Dashboard

Dashboard de escritorio que junta Gmail, GitHub, Bitbucket, Trello y Harvest en una sola ventana, en vez de tener todo repartido en pestañas de Chrome.

- **Modo pantalla completa** para cada servicio, con el dock oculto que aparece al acercar el mouse al borde (o siempre visible, configurable).
- **Grupos**: arrastrá un ícono del dock sobre otro para verlos divididos lado a lado (split, redimensionable); cualquier ícono suelto se ve solo, a pantalla completa. Se arma y se desarma como quieras, no hay un modo global.
- Sesión persistente por sitio (login se mantiene entre reinicios).
- Tema claro/oscuro/sistema.

Ver [`CLAUDE.md`](./CLAUDE.md) para el detalle de arquitectura y las decisiones técnicas del proyecto.

## Por qué es una app de escritorio

Gmail, GitHub, Bitbucket y Trello bloquean ser cargados en un `<iframe>` desde otro origen (`X-Frame-Options` / CSP). Una página web normal no puede evitar eso. Esta app usa Electron para interceptar esas respuestas HTTP y sacarles esos headers antes de que el navegador los aplique — por eso se instala como aplicación en vez de ser un sitio.

## Desarrollo

```bash
npm install
npm run dev     # levanta Next.js + Electron juntos
```

## Build local

```bash
npm run build   # build de producción (export estático + compilar el proceso de Electron)
npm run dist    # además empaqueta con electron-builder para el sistema operativo actual
```

## Instalación (versiones publicadas)

Cada release para Windows, macOS y Linux se genera desde GitHub Actions ([`.github/workflows/release.yml`](./.github/workflows/release.yml)) — pestaña **Actions** del repo → workflow **"Build and release"** → **Run workflow**. Es manual (no se dispara solo en cada push) para no gastar de más la cuota de minutos de Actions, sobre todo en macOS que consume 10x más rápido por ser un repo privado. Cada corrida suma un patch de versión (`1.0.0` → `1.0.1` → `1.0.2`...) y sube los instaladores de las 3 plataformas a una nueva release en la pestaña **Releases** del repo.

Ningún instalador está firmado (no hay certificado de firma de código todavía), así que Windows y macOS van a advertir que es de un editor no verificado — es esperable, no significa que esté roto.

### Linux

Bajá el `.AppImage` o el `.deb` de la release.

- **AppImage**: dale permiso de ejecución y corrélo — no necesita instalación.
  ```bash
  chmod +x "ET Dashboard-*.AppImage"
  ./"ET Dashboard-*.AppImage"
  ```
- **.deb** (Ubuntu/Debian):
  ```bash
  sudo apt install ./et-dashboard_*.deb
  ```

### Windows

Bajá el `.exe` (instalador NSIS) y ejecutalo. Como no está firmado, Windows SmartScreen va a mostrar "Se protegió su PC" — click en **"Más información"** → **"Ejecutar de todas formas"**.

### macOS

Bajá el `.dmg`, abrilo y arrastrá la app a *Applications*. Como no está firmada, Gatekeeper va a bloquear el primer intento de apertura ("no se puede abrir porque proviene de un desarrollador no identificado"):

- Click derecho (o Ctrl+click) sobre la app → **Abrir** → confirmar en el diálogo. Después de la primera vez abre normal con doble click.
- O por terminal: `xattr -cr "/Applications/ET Dashboard.app"` y después abrila normal.
