# Prospección comercial V3

## Inicio en Windows

Estos nombres corresponden al piloto V3 restaurado en la carpeta privada. En una instalación distinta, elegí la base y el catálogo de esa instalación. La clave local se crea con `scripts/operator.ps1` cuando el perfil todavía carece de operador.

```powershell
Set-Location 'D:\Reac_Security_Lab_Kit\reac-security-lab'
npm.cmd run build
$env:REAC_PORT = '4326'
$env:REAC_STORAGE = 'private'
$env:REAC_DATABASE = 'reac-prospeccion-v3.sqlite'
$env:REAC_RESEARCH_CATALOG = 'piloto-v3-catalogo.json'
$env:REAC_CODEX_ENABLED = '1'
npm.cmd start
```

Abrí `http://127.0.0.1:4326/#research`. Para entrar usá `scripts/operator.ps1 -CopyKey`, pegá la clave en la app y limpiá el portapapeles. Desde el dashboard, **Nueva búsqueda con IA** abre el formulario. Completá la consulta y ajustá filtros específicos si hace falta. Los campos explícitos prevalecen sobre la interpretación.

## Desde Orca

Pedile a Codex «Buscá cinco empresas de Traslasierra con reservas y cargalas desde el catálogo de Security Lab». La CLI entrega el identificador del lote y los conteos. Si buscás empresas fuera del catálogo, pedile que coteje los datos de primera parte, redacte un JSON en una carpeta privada y lo procese directamente. El operador puede hacer ese mismo recorrido mediante el formulario o `Descubrimiento`.

```powershell
.\scripts\research.ps1 -Port 4326 -Query 'Buscá 5 empresas de Traslasierra con reservas' -UseCodex
.\scripts\research.ps1 -Port 4326 -Query 'Procesá estas fuentes' -File 'ruta-al-lote.json' -Verified
```

Usá `-Verified` solo si cotejaste las fuentes, identidad y evidencia del archivo. Para reintentar una operación de la CLI luego de una interrupción, conservá el GUID de `-RequestId` y la solicitud original. La clave del operador se lee mediante DPAPI y el script devuelve solo el resumen. La sesión de CLI no habilita informes, datos sensibles ni rutas del laboratorio.

## Verificación y seguimiento

- El catálogo contiene hasta 100 filas con evidencia de primera parte. Para actualizarlo, cotejá el contenido, guardá JSON v1 en la carpeta de datos y reiniciá. [Políticas de proveedores](PROVEEDORES.md)
- La incorporación automática requiere una fuente del mismo sitio corporativo o un subdominio, fecha de los últimos 180 días, confianza alta y un lote cotejado. Entre los resultados por encima de la confianza mínima elegida, las fichas que no cumplen el criterio automático quedan para confirmación. Los campos conservan fuente y procedencia. Los duplicados exactos conservan su ficha y las identidades compartidas requieren revisión. Las exclusiones se respetan siempre.
- Abrí **Historial de búsquedas** para ver resultados y cancelar un trabajo activo. **Empresas prospectadas** distingue fichas, candidatos e hitos de contacto. **Mapa de prospectos** tiene filtros y muestra la precisión de la ubicación. **Exportaciones** descarga CSV, JSON, el formato portable y el CSV de traslado para Reac Leads.
- El puntaje mide oportunidad comercial. Las fichas nuevas reciben borradores pendientes de revisión. El universo que filtra el dashboard proviene del catálogo o de un archivo aportado. La investigación abierta se hace desde Orca en fuentes permitidas y entra mediante el mismo servicio.
