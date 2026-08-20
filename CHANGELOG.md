# Changelog

Todas las novedades importantes de ET Dashboard, versión por versión.

## [0.1.10] - 2026-08-20

- El botón "Actualizar" ahora descarga la nueva versión adentro de la app y la instala con un click en "Reiniciar e instalar" — antes solo abría la página de GitHub. Solo funciona en la versión AppImage o Windows; la versión .deb sigue actualizándose con `apt`.

## [0.1.9] - 2026-08-20

- Corregido: el ícono de la app no se veía en Configuración, en el dock ni en las notificaciones de la versión instalada.
- Corregido: el ícono de la app no aparecía en el dock/Actividades de GNOME ni en el Alt-Tab de la versión instalada en Linux.
- Corregido: el brillo animado del botón "Buscar actualizaciones" se veía por encima del botón en vez de detrás.
- El chequeo de actualizaciones ahora tarda al menos 3 segundos, para que el spinner se note antes de mostrar el resultado.
- Transición suave al cambiar de página en el dock, en vez de un cambio abrupto.
- Los botones del menú lateral ahora muestran el cursor de mano al pasar el mouse.
- Se quitó la barra de menú (Archivo/Editar/Ver/Ventana) de la ventana de la app.
- Se sacó el botón de prueba de notificaciones de Configuración.

## [0.1.6] - 2026-08-20

- Pantalla de carga animada (círculos superpuestos) al abrir la app.
- El menú lateral ahora arranca expandido (ícono + nombre) en instalaciones nuevas.
- Cada ícono del dock muestra un anillo de carga con el color del servicio mientras su página todavía está cargando.
- Nuevo ícono de la app, también visible en el diálogo de Configuración.
- Configuración: muestra la versión instalada y un botón para buscar actualizaciones.

## [0.1.5] - 2026-08-20

- Corregido: el ícono de la bandeja del sistema no aparecía en Wayland (GNOME/Ubuntu).

## [0.1.4] - 2026-08-19

- Corregido: ventana en blanco al abrir la app empaquetada en Linux.
- Corregido: fallo/pantalla invisible en notebooks con GPU híbrida (Intel + NVIDIA).

## [0.1.3] - 2026-08-19

- Corregido: error de configuración que rompía el empaquetado para Linux.

## [0.1.2] - 2026-08-19

- Corregido: fallaba el empaquetado del `.deb` de Linux por falta de email de autor.

## [0.1.1] - 2026-08-19

- Primera versión: Gmail, GitHub, Bitbucket, Trello y Harvest en una sola ventana.
- Ícono en la bandeja del sistema y notificaciones nativas.
- Íconos de marca reales (Font Awesome) para cada servicio.
- Se sumó Jira/Atlassian como sexto/séptimo servicio.
- Pipeline de release automático para Windows, macOS y Linux.
