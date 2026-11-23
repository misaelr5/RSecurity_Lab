# Campañas comerciales

Una campaña reúne fichas existentes y búsquedas bajo un nombre, un objetivo y una meta de tamaño. Las fichas pueden participar en varias campañas conservando su historial y el lote que las incorporó inicialmente.

## Operación

1. Creá una campaña con nombre y, si corresponde, objetivo, región, rubro y cantidad de empresas prevista.
2. Incorporá fichas existentes desde Campañas o seleccioná una campaña activa al crear un lote de prospección. Región, rubro y cantidad de campaña describen la meta. La búsqueda aplica sus propios filtros.
3. Consultá empresas, lotes y métricas en el detalle. El vínculo incluye la fecha de incorporación y el lote asociado cuando la empresa ingresó por investigación.
4. Pausá o cerrá una campaña para detener incorporaciones. El detalle preserva membresías y lotes existentes. Podés volver a activarla.

Una empresa tiene una membresía por campaña. La exclusión de contacto bloquea incorporaciones nuevas. Si se aplica después, el vínculo anterior permanece y el detalle muestra la exclusión vigente. Agregar una ficha a una campaña no crea una comunicación ni cambia su estado.

## Métricas

| Métrica | Criterio |
| --- | --- |
| Miembros | Una ficha por organización actualmente asociada. |
| Verificadas | Miembros con al menos una observación pública revisada y asociada a una fuente. |
| Contactadas | Miembros con un hito explícito de contacto desde su incorporación. |
| Respuestas | Miembros contactados con un hito posterior de respuesta durante la pertenencia. |
| Propuestas | Miembros contactados con un hito posterior de auditoría propuesta. |
| Clientes | Miembros con estado comercial actual Ganado. |
| Excluidas | Miembros con exclusión vigente. |
| Lotes | Búsquedas explícitamente asociadas a la campaña. |
| Tasa de respuesta | Respuestas divididas por contactadas. Se muestra sin valor cuando no hay contactadas. |
| Conversión | Miembros contactados actualmente ganados divididos por contactadas. Se muestra sin valor cuando no hay contactadas. |

Los indicadores combinan el historial del pipeline y el estado actual de la cartera. Una empresa presente en varias campañas puede contribuir a varias métricas si los hitos ocurrieron durante cada pertenencia. Las tasas describen el grupo de empresas y su actividad registrada.

## Persistencia

SQLite v4 guarda campañas y membresías sin copiar fichas. La membresía usa una clave de campaña y organización, y su alta comparte transacción con la importación cuando corresponde. Los lotes de V3 conservan su identificador original en el historial.
