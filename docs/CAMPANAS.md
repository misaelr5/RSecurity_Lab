# Campañas comerciales

Una campaña reúne fichas existentes y búsquedas bajo un nombre, un objetivo y una meta de tamaño. Las fichas pueden participar en varias campañas conservando su historial y el lote que las incorporó inicialmente.

## Operación

1. Creá una campaña con nombre y, si corresponde, objetivo, región, rubro y cantidad de empresas prevista.
2. Incorporá fichas existentes desde Campañas o seleccioná una campaña activa al crear un lote de prospección. Región, rubro y cantidad de campaña describen la meta. La búsqueda aplica sus propios filtros.
3. Consultá empresas, lotes y métricas en el detalle. El vínculo incluye la fecha de incorporación y el lote asociado cuando la empresa ingresó por investigación.
4. Pausá o cerrá una campaña para detener incorporaciones. El detalle preserva membresías y lotes existentes. Podés volver a activarla.

Una empresa tiene una membresía por campaña. Una exclusión de contacto, un descarte o el archivo de la ficha bloquean incorporaciones nuevas. Si ocurren después, el vínculo anterior permanece. Agregar una ficha a una campaña conserva el estado de la empresa y su historial.

## Métricas

| Métrica | Criterio |
| --- | --- |
| Miembros | Una ficha por organización actualmente asociada. |
| Investigadas | Candidatos de los lotes asociados, deduplicados por nombre y localidad normalizados, estén o no incorporados a la cartera. |
| Verificadas | Miembros con al menos una observación pública revisada y asociada a una fuente. |
| Contactadas | Miembros con un hito explícito de contacto desde su incorporación. |
| Respuestas | Miembros contactados con un hito posterior de respuesta durante la pertenencia. |
| Reuniones | Miembros con el hito explícito Reunión desde su incorporación. |
| Propuestas | Miembros con el hito explícito Propuesta comercial enviada desde su incorporación. |
| Clientes | Miembros con el hito explícito Cliente desde su incorporación. |
| Excluidas | Miembros con exclusión vigente. |
| Borradores pendientes | Borradores sin revisión de miembros que siguen habilitados para contacto. |
| Lotes | Búsquedas explícitamente asociadas a la campaña. |
| Tasa de respuesta | Respuestas divididas por contactadas. Se muestra sin valor cuando no hay contactadas. |
| Conversión | Miembros con hito Cliente posterior al hito Contactado divididos por contactadas. Se muestra sin valor cuando no hay contactadas. |

El detalle desglosa los indicadores por localidad y rubro. Cada grupo calcula las tasas sobre sus propios miembros contactados. Una empresa presente en varias campañas puede contribuir a varias métricas si los hitos ocurrieron durante cada pertenencia. Los hitos registran actividad observada del grupo. Una campaña cerrada sigue mostrando cambios de actividad de los miembros históricos.

## Persistencia

SQLite v4 guarda campañas y membresías sin copiar fichas. La membresía usa una clave de campaña y organización, y su alta comparte transacción con la importación cuando corresponde. Los lotes de V3 conservan su identificador original en el historial.
