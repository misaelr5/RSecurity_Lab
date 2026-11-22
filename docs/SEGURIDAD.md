# Seguridad interna

La app está diseñada para un solo operador en Windows. API y fixture escuchan en 127.0.0.1 y la API comprueba Host, Origin y el contexto del navegador. La app no establece una cuenta ni una sesión de usuario. Cualquier proceso local que alcance loopback puede usar la API. El perímetro actual es una máquina bajo control del operador.

- CSP limita recursos al mismo origen. Las páginas y datos se sirven sin caché. Los formularios envían JSON y el navegador interpreta los valores cargados como texto.
- Las entradas se validan con Zod. SQLite recibe los valores por parámetros. Los nombres de tablas son internos. La aplicación no incorpora un ejecutor de shell.
- El fixture usa una IP literal y un puerto interno. No resuelve nombres ni sigue redirects. Tiene límite de tiempo, concurrencia y tasa. El modo documental solo procesa datos y registra trazabilidad. Los activos públicos nunca pasan al ejecutor.
- Resguardar el directorio data con una cuenta dedicada de Windows y cifrado de disco o almacenamiento con permisos restrictivos si se incorporan datos sensibles. Este proyecto no verifica esas configuraciones. Antes de un uso compartido se necesitan autenticación, autorización y un transporte seguro.
- Proteger los respaldos como la base original. Conservá en un inventario su dueño, finalidad y plazo. El MVP no borra copias automáticamente. Definí una política de retención y eliminación antes de usar datos reales.
- Usá una base exclusiva para la demo y nombres separados para operación. El respaldo se aísla por nombre de base. Las copias antiguas del directorio anterior se recuperan solo con --legacy.
