# Vista previa del dashboard

Abrí la ruta local `#preview` para evaluar la interfaz con datos ficticios. La cabecera identifica la muestra y ofrece un enlace de retorno a la cartera operativa. Los indicadores, nombres de ejemplo y actividad se dibujan a partir de una cohorte ilustrativa y permanecen fuera de SQLite. Los accesos rápidos abren las secciones operativas que correspondan.

## Temas

Usá el selector de la cabecera para cambiar entre Claro, Oscuro y Sistema. El cambio es inmediato. La elección se guarda en `localStorage` bajo `reac-preview-theme` y aplica al dashboard operativo, al mapa y a la vista previa. Sistema escucha el ajuste de apariencia del dispositivo. La composición nueva espera aprobación en `#preview`.

El componente `DashboardPreview` comparte la misma estructura React entre temas. Los tokens CSS semánticos cubren fondo, superficie, borde, texto principal y secundario, controles, series y foco. Se usan dos estilos de línea en el gráfico para distinguir las series por forma y color. La vista evita recursos externos. Los contrastes calculados de texto y acción en ambos temas superan 7.3:1. El contraste mínimo calculado entre las líneas principales y sus superficies supera 5.4:1.

La dirección visual toma ideas de densidad y navegación de Tabler, composición de shadcn/ui y jerarquía de gráficos de Tremor. Se implementó con componentes nativos y CSS local, sin añadir librerías ni copiar recursos externos. [shadcn/ui](https://ui.shadcn.com/blocks/dashboard) · [Tabler](https://github.com/tabler/tabler) · [Tremor](https://github.com/tremorlabs/tremor)

## Lectura de los indicadores

| Indicador | Fórmula para un panel operativo |
| --- | --- |
| Empresas registradas | Cantidad de IDs empresariales únicos en cartera |
| Nuevas esta semana | IDs incorporados desde el inicio de la semana calendario en la zona horaria del operador |
| Verificadas | IDs con al menos una fuente aprobada y evidencia atribuible |
| Pendientes de verificar | IDs en las colas de verificación inicial o revisión por baja confianza |
| Contactadas | IDs con evento explícito de contacto registrado dentro del período |
| Respondieron | IDs del grupo contactado con respuesta registrada dentro del período |
| Tasa de respuesta | IDs que respondieron ÷ IDs contactados |
| Reuniones | IDs contactados con reunión registrada |
| Propuestas enviadas | IDs contactados con envío de propuesta registrado. Un borrador no se cuenta |
| Clientes y conversión | IDs contactados con estado de cliente confirmado ÷ IDs contactados |
| Auditorías autorizadas | Cantidad de autorizaciones vigentes verificadas |
| Campañas realizadas | Cantidad de ejecuciones terminadas de prospección, con estado final trazable |
| Distribución | Empresas agrupadas por rubro o región. La longitud de cada barra es la cantidad ÷ total de cartera |

Los porcentajes no se muestran si el denominador es cero. El gráfico de evolución ofrece ventanas de cuatro y ocho semanas. La cobertura territorial muestra cantidades agrupadas y abre el mapa comercial separado. El enlace a un mapa operativo conserva la distinción entre conteos agregados y ubicaciones verificadas.

El dashboard operativo presenta ocho semanas de altas y contactos. Muestra el hito «Auditoría propuesta» cuando está registrado en el pipeline. El conteo de reuniones usa el estado comercial actual de fichas con contacto registrado. La conversión usa clientes con contacto registrado sobre empresas con ese hito. Estas métricas operativas se leen de SQLite.

## Revisión de la propuesta

Capturá el mismo tamaño de ventana en Claro y Oscuro. Probá también Sistema, recarga, foco con teclado y una pantalla de 390 px. El paso de aprobación del diseño queda pendiente. La interfaz principal permanece activa para operación.

La vista se probó en Chrome con cambios de tema, recarga, preferencia del sistema, selector de período y una ventana de 390 px. El gráfico dispone de una tabla desplegable con los valores de cada serie para el período seleccionado.
