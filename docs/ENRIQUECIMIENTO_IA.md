# Enriquecimiento con evidencia

Prepará una propuesta desde Orca o ingresala manualmente en una ficha existente. El backend recibe campos estructurados y una referencia pública de la empresa. La procedencia indica quién preparó la propuesta. La verificación y aprobación siguen a cargo del operador.

## Revisar una propuesta

1. Identificá la ficha y abrí su sitio para comprobar el dato comercial publicado. Usá una URL HTTPS del dominio oficial registrado y la fecha efectiva de consulta.
2. Prepará la descripción del hecho, el proveedor de la fuente y los campos que la evidencia respalda. Los campos admitidos son razón social, provincia, dirección, tipo de aplicación, etiqueta de contacto, correo y teléfono. El adaptador recibe valores concretos y una descripción breve.
3. Creá la propuesta. La vista muestra el valor actual, el propuesto y si el campo está habilitado para incorporar. Cuando la propuesta viene de un candidato de investigación, conserva referencias al lote y al candidato.
4. Marcá los campos que cotejaste y confirmá con el nombre del operador. También podés rechazar la propuesta y conservar su historial. Si cambió la ficha o la validez de la evidencia, volvé a cargar la comparación.

Los contactos que ya tienen valor se preservan. Para otros campos completos, un valor diferente requiere una fuente más reciente que la verificación registrada. Se admiten campos faltantes con evidencia de hasta 180 días. La exclusión vigente bloquea la creación y aplicación, incluso si se registró después de preparar la propuesta.

## Estructura y control

La sesión local puede enviar una propuesta a `POST /api/v1/prospects/:id/enrichment`. El cuerpo incluye `provider` (`ORCA` o `MANUAL`), `source` (`url`, `consultedAt`, `provider`, `statement` y, opcionalmente, `terms`) y `fields` con valores concretos.

La revisión recibe `decision` (`APROBAR` o `RECHAZAR`), `reviewer`, `acknowledge: true`, `contentVersion` y, al aprobar, la lista de campos elegidos. El servidor comprueba la huella de la comparación y aplica la decisión en una transacción. Conserva el valor anterior en el historial de revisión y agrega una fuente y una observación cuando aplica cambios. Se preservan estado comercial, consentimiento, seguimiento, lote, borradores y fuente principal previos.

El servidor procesa la referencia como un dato. La consulta externa, la presentación del contenido y la confirmación suceden por decisión explícita. Las pruebas usan fuentes ficticias y nunca consultan la red.
