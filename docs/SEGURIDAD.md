# Seguridad, custodia y retención

## Acceso monousuario

- La API operativa requiere clave local y escucha en 127.0.0.1. Host, origen y contexto de navegador se comprueban antes del acceso. Se admite una sola sesión. Vence tras 30 minutos de inactividad u 8 horas, y se invalida al cerrar sesión o reiniciar.
- El servidor usa un verificador scrypt con sal aleatoria, limita los intentos y evita registrar credenciales. El aprovisionamiento Windows conserva una copia de recuperación de la clave protegida por DPAPI de la cuenta propietaria en operator.json.
- La sesión usa un token en sessionStorage, limitado al origen y pestaña. El cliente lo adjunta en Authorization solo a la API local. Las descargas pasan por la misma autenticación. La API usa CSP de mismo origen, valida entradas y evita ejecución de HTML importado. El control depende de un navegador y un sistema Windows de confianza.
- REAC_DEMO=1 solo funciona con reac-demo.sqlite bajo el workspace. Reservá esa base para datos ficticios. Las bases de operación nunca deben usar esa opción.

## Custodia en Windows

- Para datos reales configurá REAC_STORAGE=private. Los datos y copias se guardan fuera del repositorio bajo %LOCALAPPDATA%\ReacStudio\SecurityLab. El aprovisionamiento aplica ACL a la carpeta específica: propietario, SYSTEM y administradores. Se verificó esa lista en la carpeta, la base, el verificador y el lote real.
- El comando scripts/operator.ps1 -CopyKey copia la clave a la memoria del portapapeles del usuario. Pegala en la app y limpiá el portapapeles al terminar. Evitá conservarla en archivos de texto o capturas.
- SQLite y CSV dependen de los permisos del sistema de archivos. El estado de BitLocker no fue comprobable con los permisos disponibles. Si se prevé guardar documentación o datos sensibles, verificá cifrado del volumen y recuperación antes de hacerlo. [Documentación de BitLocker](https://learn.microsoft.com/windows/security/operating-system-security/data-protection/bitlocker/)
- El piloto contiene nombres empresariales y canales públicamente publicados. Evitá registrar datos personales que no aporten al contacto comercial. No envíes la base o los informes a servicios externos sin autorización.

## Política operativa de retención

| Datos | Revisión | Acción |
| --- | --- | --- |
| Fichas y fuentes públicas | 180 días desde la verificación | Volver a confirmar; marcar pendientes las fuentes que cambiaron |
| Fichas sin fecha | En cada revisión de cartera | Documentar la fuente o detener el uso para contacto |
| Exclusiones | Antes de preparar cualquier contacto | Conservar el mínimo necesario para mantener la exclusión |
| Copias SQLite | 90 días desde la creación o modificación | Verificar una copia reciente antes de retirar las antiguas |
| Exportaciones CRM | Tras cerrar cada transferencia | Conservar solo la copia de trabajo necesaria en la carpeta privada |

Configuración muestra qué alcanza los plazos. El sistema no purga automáticamente registros ni copias. Un responsable decide y documenta las eliminaciones dentro de la política de Reac Studio.

## Alcance técnico

El fixture usa una IP literal y un puerto interno. No resuelve nombres ni sigue redirecciones. Los directorios de descubrimiento se abren por acción del usuario y los activos públicos solo se guardan con atribución. El producto no usa esos datos como entrada para conexiones técnicas. Los resultados defensivos se importan como resúmenes inertes.

V3 mantiene la investigación comercial en la API autenticada. La sesión exclusiva de la CLI puede iniciar lotes y leer resúmenes durante 15 minutos. Codex recibe el texto de consulta y devuelve filtros validados. El backend lee evidencia local como datos y no visita las URL ni se las entrega a Codex. El catálogo y la base real residen en el perfil privado. Los filtros y el tamaño de cada lote se limitan en el servidor. Revisá las fichas y fuentes vencidas y administrá las copias según la política de retención.

V4 limita los tokens de investigación a crear, simular, cancelar, reanudar y consultar resúmenes. El token de historial separado dura cinco minutos y solo permite descargar exportaciones comerciales. Las sesiones CLI son acotadas y crear otra no interrumpe el seguimiento de un lote existente. El cierre de sesión invalida ambas. Cada revisión requiere una huella del contenido y las coincidencias dudosas exigen decisión humana.

Los insumos quedan en la copia SQLite privada para reanudación y trazabilidad. Se incluyen en la revisión periódica de retención junto con fuentes y copias. La exportación comercial elimina documentos, secretos, artefactos técnicos y notas internas. Las exclusiones y el archivo de empresas conservan sus identidades para impedir redescubrimiento automático.
