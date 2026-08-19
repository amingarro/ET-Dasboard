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

## Build

```bash
npm run build   # build de producción (export estático + compilar el proceso de Electron)
npm run dist    # además empaqueta con electron-builder (Linux: AppImage/deb)
```
