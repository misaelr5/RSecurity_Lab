# Mapa comercial

La ruta local **Mapa** muestra fichas de la cartera por localidad, rubro, estado y campaña. El botón de cada marcador abre los prospectos agrupados y la lista ofrece acceso a su ficha e historial, web oficial y próximo seguimiento, si está registrado. Se puede ajustar el mapa al resultado visible o ver toda la provincia. Los colores representan etapas comerciales. Los marcadores agrupados con estados distintos tienen su propia leyenda. Los controles se pueden usar con teclado y los prospectos sin coordenadas permanecen en la lista.

## Precisión y fuentes

- El único cálculo de posiciones usa centroides de localidades publicadas por Georef. Una provincia registrada fuera de Córdoba, una localidad sin coincidencia o una ciudad ambigua sin región confiable conservan la ficha sin punto. La aplicación no afirma ni calcula la posición de una dirección. La vista y las exportaciones muestran **Localidad aproximada**.
- Georef permite reutilización comercial de los datos publicados bajo CC BY 4.0. Su API oficial es gratuita y declara límites de 10 solicitudes por segundo, 40 por minuto, 2.000 por hora y 10.000 por día. Se consultó un catálogo acotado de localidades, sin enviar nombres de empresas, direcciones ni otras entradas privadas. Los centroides e identificadores de cada localidad están fijados en el código y no se consulta Georef al usar el mapa. [Condiciones y cuotas de Georef](https://www.argentina.gob.ar/georef/condiciones-de-uso-y-licencia) · [API y formatos](https://www.argentina.gob.ar/georef/referencia-completa-de-la-api)
- El contorno dibujado es el límite público de Córdoba de la Dirección General de Catastro / IDECOR, consultado en la capa WFS idecor:provincia en WGS84. Se simplificó su anillo de 5.288 puntos a 112 con una tolerancia de 0,008 grados y se redondearon los puntos a cuatro decimales. Esta geometría derivada se publica bajo la misma licencia CC BY-SA 4.0 y se usa como referencia visual. Los archivos de prospectos exportados no incluyen ese contorno. [Fuente provincial](https://www.idecor.gob.ar/3087-2/) · [Licencia IDECOR](https://www.idecor.gob.ar/terminos-y-condiciones/)
- Se evaluaron MapLibre GL JS y el adaptador React react-map-gl. La versión de MapLibre con CSP estricta requiere preparar su worker y un mapa base. Se mantiene un SVG vectorial local con proyección equirectangular ajustada, selección y agrupación por cercanía para evitar dependencias y peticiones de mapas durante el piloto. Hereda el tema de la aplicación. [Documentación MapLibre](https://maplibre.org/maplibre-gl-js/docs/) · [Integración React](https://visgl.github.io/react-map-gl/docs/get-started)

## API local

Las rutas se sirven con el alcance de autenticación del resto de la API local:

- GET /api/v1/map/prospects, con los filtros opcionales q, city, industry, campaign y status. campaign acepta el UUID del lote o none.
- GET /api/v1/map/export?format=geojson|csv|json, con los mismos filtros. El archivo contiene identificador estable, nombre comercial, localidad, rubro, coordenadas y procedencia. Quedan fuera contactos, nota interna, sitio, estados de negociación, identificadores de campaña, seguimiento, documentos y credenciales.
- GeoJSON expresa cada punto como [longitud, latitud]. Conserva las filas sin ubicación con geometría null. En CSV, las coordenadas se emiten como números reales y cada celda de texto usa la misma protección contra fórmulas que otras exportaciones del proyecto. JSON conserva la ubicación nula o la coordenada junto a su nivel de precisión y atribución.

La alternativa para ampliar cobertura es agregar localidades al catálogo oficial en una actualización revisada. Un proveedor de calles o direcciones necesitaría validación de confianza, modelo de coordenadas precisas y un procedimiento separado que preserve el perímetro de datos operativos.

En la instancia V3, las 14 fichas nuevas tienen ubicación aproximada por localidad. El GeoJSON de cartera exportado contiene 24 fichas, incluidas las diez del piloto inicial.
