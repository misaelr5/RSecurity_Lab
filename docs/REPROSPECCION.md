# Reprospección V4

## Buscar empresas nuevas

En **Reprospectar**, elegí región, localidades, rubros y tipos de aplicación. La solicitud usa el catálogo local o un lote con fuentes públicas cotejadas. La API compara nombre y localidad, dominio, registro, correo y teléfono con la cartera vigente, archivadas, descartadas, alias e investigaciones anteriores. Una coincidencia dudosa queda para revisión. Los registros que quedaron fuera del cupo siguen disponibles para una próxima búsqueda.

Desde Orca podés pedir «Reprospectá 50 empresas nuevas de Córdoba Capital del rubro software y cargalas en Reac Security Lab». Para investigar fuera del catálogo, cotejá fuentes corporativas públicas desde Orca y entregá el JSON v1 a la CLI. Marcá `-Verified` solo cuando las fichas ya tengan evidencia corroborada.

```powershell
.\scripts\research.ps1 -Query 'Reprospectá 50 empresas de Córdoba Capital del rubro software' -Regions 'Córdoba Capital' -Industries 'Software' -Quantity 50 -UseCodex -File $lote -Verified
.\scripts\research.ps1 -Query 'Simulá 30 alojamientos con reservas' -Regions 'Traslasierra' -Cities 'Villa Dolores','Mina Clavero','Nono' -ApplicationTypes 'Reservas' -Simulate
```

La simulación solo lee las fuentes ya disponibles, no abre un turno de Codex e indica que la cuota efectiva de ChatGPT es desconocida. Los conteos corresponden a esas fuentes. La cantidad solicitada es un objetivo.

## Actualizar fichas

Para «Actualizá las fichas de las empresas investigadas en los últimos 30 días», elegí el modo **Actualizar prospectos**. La ventana considera alta o verificación de la ficha y la nueva evidencia se prepara para revisión. Podés enfocar una ficha con `-OrganizationId`. Una propuesta conserva estados, historia y exclusiones. [Enriquecimiento con IA](ENRIQUECIMIENTO_IA.md)

```powershell
.\scripts\research.ps1 -Query 'Actualizá las fichas investigadas en los últimos 30 días' -Mode update -RecentDays 30 -File $lote
.\scripts\research.ps1 -CancelJob $idDelLote
.\scripts\research.ps1 -ResumeJob $idDelLote
```

La reanudación usa el mismo ID y solicitud persistida cuando la transacción anterior no guardó resultados. Si cambió el catálogo, creá un lote nuevo. El mismo `-RequestId` permite reintentar la petición sin duplicarla. Cada ejecución admite hasta 100 fichas y hay un trabajo en curso por base.

## Guardar y revisar

**Guardar esta búsqueda** conserva filtros e instrucciones. En **Búsquedas guardadas** podés editar, duplicar, exportar y ejecutar la configuración actual, con acceso a sus lotes anteriores. El archivo de fuentes de una ejecución se conserva para recuperación del lote y queda fuera de la configuración reutilizable.

La **Bandeja de revisión** distingue verificadas, pendientes, coincidencias, incompletas, excluidas y errores. Cada decisión registra responsable y fecha. Las aprobaciones requieren una versión de la ficha vigente. Vincular una coincidencia agrega la fuente al historial de la ficha elegida. La acción conserva el registro candidato y los datos actuales de la empresa. El rechazo en grupo admite hasta 25 candidatas.
