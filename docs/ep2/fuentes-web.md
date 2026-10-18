# Fuentes de materiales para Habita3D — investigación EP2

Fecha de comprobación: 18 de octubre de 2026. Alcance: consultas de muestra, sin recorrer categorías completas ni modificar el repositorio.

## Decisiones de referencia

- Ubicación activa: Región Metropolitana, Santiago, comuna La Florida. Sustituye la referencia inicial de Las Condes por decisión del equipo.
- Alcance del producto ampliado por el usuario: cerámicas para piso y piso flotante laminado, sin vinílicos/SPC en EP2. Este informe contiene pruebas de cerámicas; la categoría de laminados y sus campos específicos aún deben verificarse.
- Muestra acordada para implementar en EP2: hasta 10 publicaciones por categoría y tienda, máximo 40. La investigación no equivale a una captura completa de esa muestra; los conteos de cientos de productos que aparecen más abajo corresponden a los totales informados por las fuentes durante las pruebas.
- Frecuencia solicitada para el plan: tres procesos de comprobación a las 08:00, 12:00 y 16:00, en `America/Santiago`. Cada proceso puede requerir varias solicitudes espaciadas; la frecuencia no garantiza ausencia de bloqueos. La interfaz mostrará Última comprobación con la captura exitosa real en DD/MM/AAAA HH:MM.
- Conservar ubicación, URL de origen y fecha de captura junto con precios y disponibilidad.
- Mantener separados precio por caja, precio por m², cobertura, vendedor y promociones condicionadas.
- Una respuesta sin ubicación explícita puede usar un contexto predeterminado. No representa necesariamente disponibilidad nacional.

## Sodimac: JSON de catálogo confirmado

Ruta utilizada por el frontend, comprobada con HTTP 200 y respuesta JSON:

```text
https://www.sodimac.cl/s/browse/v1/listing/cl?categoryId=CATG10827&categoryName=Ceramicas&pgid=95&pid=4107aaf9-b3f4-4666-b8d5-bea868c34751&store=so_com
```

Parámetros de ubicación obtenidos de los servicios geográficos del sitio:

| Parámetro | Valor | Significado |
| --- | --- | --- |
| `pid` | `4107aaf9-b3f4-4666-b8d5-bea868c34751` | Identificador de La Florida |
| `pgid` | `95` | `priceGroupId` del detalle de comuna |

El mismo detalle contiene `sodimacPriceGroup: 96`; no confundir este campo con `priceGroupId`. La combinación confirmada para La Florida es `pgid=95` y el `pid` anterior. Durante la comprobación previa de Las Condes la combinación funcional fue `pgid=34`, mientras que `pgid=96` con el identificador de esa comuna devolvió HTTP 404.

Servicios geográficos consultados:

- [Regiones](https://www.sodimac.cl/s/geo/v2/states/cl).
- [Comunas de Metropolitana](https://www.sodimac.cl/s/geo/v2/districts/cl?statePoliticalId=a768f0a2-bb5d-4d51-8cad-03b48b25c4a4).
- [Detalle de La Florida](https://www.sodimac.cl/s/geo/v2/districts/cl?politicalId=4107aaf9-b3f4-4666-b8d5-bea868c34751&store=so_com).

Los productos están en `data.results`; la paginación, en `data.pagination`. La muestra de La Florida informó 454 resultados y devolvió 48 entradas en la primera página. En la prueba previa con Las Condes se verificó `&page=2`: HTTP 200, `currentPage: 2` y 48 entradas con identificadores distintos de la primera página; esa primera página tenía 49 entradas por un resultado patrocinado adicional. Se deben deduplicar los resultados por identificador de producto/SKU. No se verificó una opción `full` ni un parámetro para descargar toda la categoría en una consulta.

Alternativa sin solicitar la ruta anterior: la [página HTML de cerámicas](https://www.sodimac.cl/sodimac-cl/lista/CATG10827/Ceramicas) incluye un script `__NEXT_DATA__`. Los resultados están en `props.pageProps.results` y la paginación en `props.pageProps.pagination`. El contexto inicial está en `props.appCtx`.

Ejemplo observado: [Cerámica Velum Gris 45 × 45 cm, 2 m²](https://www.sodimac.cl/sodimac-cl/articulo/150286806/ceramica-x-2-m2), producto `150286806`, SKU `150286807`, marca HOLZTEK. Se observaron $15.980 por caja y $7.990/m². Son valores de la captura, sujetos a cambios y condiciones comerciales. Las especificaciones están en `props.pageProps.productData.attributes.specifications` del JSON incrustado en la página de detalle.

Disponibilidad: los campos `homeDeliveryShipping`, `pickUpFromStoreShipping`, `internationalShipping`, `primeShipping` y `expressShipping` del listado de La Florida estaban vacíos. En una consulta previa del detalle se observaron `stockUnits: 0` e `isOutOfStock: false` simultáneamente. Hace falta identificar y validar la semántica del dato de disponibilidad antes de presentarlo como stock real. Seleccionar comuna para entrega tampoco identifica por sí solo una sucursal concreta de retiro.

## Easy: HTML y ruta JSON de Next.js confirmados

La [búsqueda de cerámica para piso](https://www.easy.cl/search/ceramica%20piso) respondió HTTP 200 en Chrome normal automatizado. Se utilizó el selector normal de región y comuna para elegir Metropolitana y La Florida. En una prueba anterior con Las Condes se había confirmado también el encabezado “Entrega en Las Condes”.

El HTML incluye `__NEXT_DATA__`. Los productos están en:

```text
props.pageProps.serverProductsResponse.productList
props.pageProps.serverProductsResponse.recordsFiltered
```

También se confirmó HTTP 200 para la ruta JSON:

```text
https://www.easy.cl/_next/data/4Dl7YEcawCv5HCoeBFZoI/search/ceramica%20piso.json?search=ceramica%20piso
```

En esta ruta la raíz es `pageProps`, sin `props` adicional. El segmento `4Dl7YEcawCv5HCoeBFZoI` es el `buildId` de la captura: debe leerse del HTML y puede cambiar con cada despliegue de Easy.

La consulta sin selección explícita devolvió 40 productos y `recordsFiltered: 342`. La consulta JSON con el contexto de Las Condes devolvió 40 productos y `recordsFiltered: 301`. Tras seleccionar La Florida, las páginas 1 y 2 devolvieron HTTP 200, 40 productos cada una y `recordsFiltered: 315`, sin identificadores repetidos entre ambas páginas. Son observaciones de distintos contextos; no se realizó un experimento aislando cada cookie por separado.

La selección normal del sitio guardó estos identificadores públicos de ubicación:

```text
X-Constructor-Region: Metropolitana
X-Constructor-Commune-Code: 13110
```

También guarda un conjunto de vendedores elegibles en `X-Constructor-Sellers`. Los valores deben obtenerse de la selección actual del sitio. No se copiaron credenciales de una cuenta personal. En la comprobación de La Florida se guardó el código `13110`, pero el encabezado volvió a “Tu ubicación” durante la captura posterior al cambio: se debe verificar la persistencia del selector y del contexto durante la implementación definitiva, en lugar de depender únicamente del texto del encabezado.

Ejemplo de datos: producto `109329`, SKU `1357773`, “Cerámica piso 45x45 cm Mississippi natural 2,23 m2”, marca Celima. `prices` contenía CLP, `normalPrice: 19156` y `offerPrice: 12243`; `pricesM2` contenía 8590 y 5490 respectivamente. También apareció `availableQuantity: 1`: falta validar si este campo refleja unidades físicas o disponibilidad normalizada del buscador. No asumir que el número representa el inventario completo.

El HTML contiene enlaces `/search/ceramica%20piso?page=2` y siguientes, con `rel="next"`. Se confirmó HTTP 200 para la segunda página JSON agregando `&page=2` a la ruta anterior; devolvió 40 productos distintos de la primera página. No se ha confirmado una opción `full` ni un parámetro de tamaño ilimitado.

## Implementación propuesta

1. Crear un adaptador Python por tienda y una configuración común para La Florida.
2. Leer los JSON del frontend o del HTML; usar un navegador para inicializar la ubicación cuando sea necesario.
3. En ambas tiendas recorrer `page=1,2,...` respetando la paginación y el total devueltos, sin asumir un tamaño ilimitado.
4. Aplicar una pausa inicial de 5 segundos entre consultas como política conservadora; ajustar según las respuestas del sitio. Respetar `Retry-After` ante HTTP 429. Ante un bloqueo persistente, detener la extracción y registrar el error.
5. Conservar identificadores, vendedor, título, marca, categoría, moneda, precios normales/promocionales, unidad, cobertura, disponibilidad original, ubicación, URL y fecha.
6. Separar el dato original de la normalización y conservar valores desconocidos como desconocidos. No convertir automáticamente un campo vacío en “sin stock”.
7. Probar cada adaptador con muestras guardadas y una comprobación manual pequeña contra el sitio.

Las rutas observadas son utilizadas por los sitios y no se encontró documentación que las presente como API estable para terceros. Se debe revisar y documentar robots.txt, condiciones de uso y alcance de reutilización para la EP2. La accesibilidad técnica de una URL no resuelve por sí sola esos aspectos.

## Evidencia técnica temporal

Las respuestas, cabeceras y resúmenes de prueba se conservaron temporalmente en el equipo de investigación y no forman parte del repositorio. Este informe registra los hallazgos y sus límites; las verificaciones deben repetirse al implementar los adaptadores. No se hizo una extracción completa ni se implementó todavía un scraper en Habita3D.
