# Proveedores de descubrimiento comercial pasivo

Para el flujo comercial V3 aplican los términos contrastados en [Proveedores V3](PROVEEDORES.md). Las restricciones de uso comercial de Córdoba Turismo provincial excluyen sus datos del catálogo operativo. Las fichas V3 usan fuentes corporativas.

Consulta de documentación oficial del 17 de enero de 2027. La decisión del piloto es **usar guías públicas como punto de partida, corroborar los datos en el sitio oficial de cada empresa y registrar los hechos con su fuente**. Las fichas solo incorporan información comercial publicada. La app presenta enlaces para navegación voluntaria y recibe captura o importación estructurada.

## Fuentes regionales

| Región | Fuente y cobertura | Uso en el piloto |
| --- | --- | --- |
| Villa Dolores | [Alojamientos de la Municipalidad de Villa Dolores](https://villadolores.gov.ar/alojamientos-villa-dolores/) | Descubrir establecimientos y corroborar domicilio o denominación. Confirmar el canal comercial y los servicios actuales en la web del establecimiento. |
| Traslasierra | [Guía de alojamientos de la Dirección de Turismo de Nono](https://www.nonoturismo.gob.ar/guiadeservicios/alojamiento/) y [ficha provincial del destino](https://cordobaturismo.gov.ar/localidades/nono/) | Buscar prestadores por categoría y contrastar localidad. La guía municipal publica prestadores registrados a título informativo. [Información de la Dirección de Turismo](https://www.nonoturismo.gob.ar/inicio/) |
| Córdoba Capital | [Dónde dormir, Turismo de Córdoba Capital](https://turismo.cordoba.gob.ar/que-hacer-en-cordoba-capital/alojamiento/) y [alojamientos accesibles, Córdoba Turismo](https://cordobaturismo.gov.ar/alojamientos-con-condiciones-de-accesibilidad/cordoba-capital/) | Detectar alojamientos y cruzar denominación, domicilio y sitio declarado. Corroborar reservas o consultas en el sitio oficial. |
| Córdoba Capital, innovación | [iNNOVAB](https://innovab.cordoba.gob.ar/) y [presentación municipal](https://cordoba.gob.ar/innovab-la-nueva-plataforma-que-conecta-talentos-empresas-y-oportunidades/) | Usar fichas visibles al público para descubrir organizaciones de innovación. La sede y los servicios comerciales se corroboran en fuentes oficiales de cada entidad. |

Las páginas públicas citadas son navegables sin una clave de API. Para esas secciones no se verificó una API de descubrimiento con cuotas, tarifa o licencia de reutilización masiva. El alcance operativo es la consulta de fichas puntuales y el registro de hechos verificados redactados por el operador. Los datos publicados solo para consulta pueden quedar desactualizados. El sitio de la empresa prevalece para su oferta y canales comerciales, y la ficha conserva las referencias revisadas.

## Proveedores evaluados

### Google Places API (New) · no integrado

- Requiere un proyecto con facturación y credenciales. La cuota por minuto se aplica por método y proyecto y se consulta en la consola. Se factura según el campo solicitado de mayor nivel. El campo websiteUri pertenece a Enterprise. [Uso y facturación](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) · [Campos por SKU](https://developers.google.com/maps/documentation/places/web-service/data-fields.md)
- La tabla global consultada indica 5.000 usos mensuales sin cargo para **Text Search Pro**, con USD 32 por 1.000 en el primer escalón facturable, y 1.000 para **Text Search Enterprise**, con USD 35 por 1.000. **Place Details Enterprise** indica 1.000 usos mensuales sin cargo y USD 20 por 1.000 en el primer escalón. Consultar licencia, precios y campo específico antes de habilitar cualquier proyecto. [Precios globales](https://developers.google.com/maps/billing-and-pricing/pricing)
- La política restringe el almacenamiento, la copia y la exportación del contenido de Maps. El identificador de lugar se puede conservar indefinidamente y las demás excepciones son específicas. El flujo de cartera requiere guardar datos y exportarlos a un CRM. Por eso el piloto usa hechos corroborados directamente en las fuentes institucionales o empresariales. [Políticas de Places](https://developers.google.com/maps/documentation/places/web-service/policies) · [Condiciones específicas del servicio](https://cloud.google.com/maps-platform/terms/maps-service-terms)

### Nominatim público de OpenStreetMap · no integrado

- Geocodificador público. El máximo es **una solicitud por segundo para toda la aplicación**. Exige identificación mediante Referer o User-Agent, atribución y cumplimiento de ODbL. La política requiere poder cambiar de servicio y recomienda caché. Prohíbe autocompletado, consultas sistemáticas y descarga de todos los puntos de interés de una zona. [Política del servicio](https://operations.osmfoundation.org/policies/nominatim/) · [Licencia y atribución](https://www.openstreetmap.org/copyright)
- Puede evaluarse para geocodificar manualmente una dirección confirmada. Para estudiar un catálogo de puntos de interés, la propia política remite a extractos o al volcado de OSM, que requieren revisar ODbL y cobertura por separado. La aplicación no necesita coordenadas para el piloto. [Política sobre consultas sistemáticas](https://operations.osmfoundation.org/policies/nominatim/)

### Wikidata · candidato futuro para enriquecimiento

- Los datos estructurados son **CC0**. Es una opción para corroborar una entidad conocida por identificador QID o una localidad. La disponibilidad de pequeñas empresas y de su sitio o canal vigente no está garantizada. Las referencias originales siguen siendo necesarias. [Licencia](https://www.wikidata.org/wiki/Wikidata:Licensing)
- El endpoint SPARQL es público. La documentación indica un máximo de **60 segundos por consulta**, 60 segundos de procesamiento por cliente en cada ventana de 60 segundos, 30 consultas con error por minuto y cinco consultas paralelas por IP. Requiere User-Agent identificable y respetar `429` y `Retry-After`. Son límites del servicio, no capacidad garantizada. Una prueba futura debería usar una consulta acotada a un QID, disparada por el operador, con una sola conexión simultánea, sin lotes y con caché. [Manual de WDQS](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#Query_limits) · [Política de User-Agent](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)

## Registro operativo de la fuente

1. Abrí voluntariamente un catálogo regional, buscá por localidad o rubro y elegí una ficha.
2. Contrastá denominación, localidad, contacto comercial y función observable en fuentes oficiales. Guardá la URL exacta, fecha de consulta, nombre del proveedor y una descripción propia del hecho.
3. Clasificá la aplicación por el uso que muestra la fuente, por ejemplo comercio electrónico, reservas o portal. Una promesa comercial pública puede clasificarse como evidencia de oferta. La arquitectura y tecnologías sin fuente explícita quedan sin verificar.
4. Mantené separados los hechos públicos y la propuesta de un diagnóstico autorizado. Los datos faltantes quedan vacíos. Una fuente de descubrimiento no constituye permiso para automatizar consultas, escanear ni contactar.

