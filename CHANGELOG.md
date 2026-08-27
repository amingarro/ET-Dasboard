# Changelog

Todas las novedades importantes de ET Dashboard, versión por versión.

## [0.1.18] - 2026-08-27

- Si el corrector ortográfico subraya una palabra mal escrita en cualquier página embebida, ahora el clic derecho muestra las sugerencias de corrección (con un click la reemplaza) y una opción para agregarla al diccionario.

## [0.1.16] - 2026-08-25

- Nuevo control flotante en la esquina de cada página embebida, con botones de Inicio, Atrás, Adelante y Copiar URL — para cuando una página te deja en un lugar sin salida (por ejemplo, un Figma abierto desde un ticket de Jira) y no hay forma de volver.
- Cumpleaños ya no es un botón ni una ventana aparte: ahora es una pestaña dentro de Configuración, y sumamos un aviso real (una notificación, no solo el ícono con la torta) para cuando le toca cumplir años a alguien.

## [0.1.15] - 2026-08-24

- Ahora se puede hacer click derecho en las páginas: aparece un menú con Atrás/Adelante/Recargar, cortar/copiar/pegar en campos de texto, y abrir/copiar enlaces.
- Cada servicio recuerda la página en la que estabas — al cerrar la app y volver a abrirla, cada uno arranca donde lo dejaste en vez de volver siempre a su pantalla inicial.

## [0.1.14] - 2026-08-24

- Slack se suma al dock como un servicio más, con su ícono mostrando los cuatro colores reales del logo.
- Nuevo widget de Cumpleaños arriba de Notas: cargá nombre y fecha de nacimiento de cada persona y el ícono te avisa (con nombre y todo) el día que alguien de la oficina cumple años.

## [0.1.13] - 2026-08-21

- Notas ahora se puede sincronizar con una carpeta en Google Drive, a mano con un botón o automáticamente en cada edición (activable en Configuración).
- Configuración se rediseñó: en vez de una columna larga con scroll, ahora tiene categorías en una barra lateral (Servicios del dock / Sincronización / Apariencia) y la versión instalada + el estado de actualizaciones quedan siempre visibles abajo.
- Corregido: al re-chequear actualizaciones, la marca de "Nueva versión disponible" ya no desaparecía y volvía a aparecer — ahora solo se atenúa mientras dura el chequeo.
- El color primario del tema claro (usado en el ícono activo del dock, toggles, botones y badges) ahora es menos saturado; el tema oscuro no cambió.

## [0.1.11] - 2026-08-20

- El botón "Actualizar" ahora baja el `.deb` nuevo y lo instala solo (con un permiso de administrador, como cualquier instalación de paquete) — antes solo abría la página de GitHub para descargarlo a mano.

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
