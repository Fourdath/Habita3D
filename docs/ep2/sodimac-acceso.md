# Adaptador Sodimac: acceso, procedencia y límites

Comprobación: **18/10/2026**, ubicación de referencia **La Florida, Región Metropolitana**.

## Acceso comprobado

Se consultó una página por categoría, con pausas superiores a cinco segundos entre solicitudes
al mismo host, sin cuenta, cookies personales, proxies ni resolución de desafíos. Ambas consultas
respondieron HTTP 200. El servidor entrega una página completa; el proceso conserva como máximo
la muestra acordada de diez publicaciones válidas por categoría.

| Categoría Habita3D | Categoría del sitio | Resultado observado en la primera página |
| --- | --- | --- |
| `ceramic` | `CATG10827`, `Ceramicas` | 48 entradas; el sitio informó 452 resultados totales, incluidos muros |
| `laminate` | `CATG10826`, `Pisos-Flotantes` | 49 entradas; el sitio informó 147 resultados totales, incluidos terceros y SPC |

Estos totales son observaciones de la fuente, no el tamaño del catálogo de Habita3D ni una promesa
de disponibilidad futura. No se recorrieron todas las páginas durante esta validación.

Ruta utilizada por el frontend de Sodimac:

```text
GET https://www.sodimac.cl/s/browse/v1/listing/cl
    ?categoryId=CATG10827
    &categoryName=Ceramicas
    &pgid=95
    &pid=4107aaf9-b3f4-4666-b8d5-bea868c34751
    &store=so_com
    &page=1
```

Para laminados cambian únicamente `categoryId` y `categoryName` según la tabla. No se aceptan
URLs arbitrarias. Los identificadores de ubicación corresponden al
[detalle público de La Florida](https://www.sodimac.cl/s/geo/v2/districts/cl?politicalId=4107aaf9-b3f4-4666-b8d5-bea868c34751&store=so_com).

La ruta es técnicamente accesible y usada por el sitio; **no se encontró una API pública
documentada para terceros ni una garantía contractual de estabilidad**. Si cambia su estructura,
el adaptador informa un error de formato y la captura anterior conserva su fecha.

## Selección y transformación

Código: [`sodimac.py`](../../python-service/app/sources/sodimac.py).

- Solo `sellerId=SODIMAC_CHILE`; se conserva el nombre del vendedor.
- Cerámica: `GSCCategoryId=G20041805` distingue piso de `G20041702` (muro). Si falta esa
  clasificación, el título debe indicar explícitamente cerámica para piso. Se excluyen muros,
  porcelanato, adhesivos y títulos ambiguos sin evidencia de uso en piso.
- Laminado: títulos de piso flotante/laminado y clasificación compatible `G20041804`. Se
  excluyen vinílicos/SPC incluso si aparecen dentro de la misma categoría del sitio.
- El precio base proviene de `internetPrice`, `eventPrice` o `normalPrice` sin tachar. Los
  precios CMR y campañas condicionadas se identifican por separado; no reemplazan el precio
  de compra general usado para comparar presupuestos.
- El precio de caja proviene de `prices[].price`; el precio publicado por m² y la cobertura,
  de `unitPrice.price` y `unitPrice.quantity`. Solo se reconoce caja si `unitForSale=Caja`.
  Se conserva cobertura desconocida si falta; no se obtiene a partir del largo/ancho de una pieza.
- Las URLs de producto se conservan sin parámetros publicitarios. Se conserva la URL de una
  imagen como referencia; no se descarga ni distribuye el archivo gráfico.
- El adaptador informa entradas recibidas y excluidas. El proceso común limita, valida y
  deduplica por identificador, de modo que las métricas usen denominadores explícitos.
- La paginación usa `currentPage`, `perPage` y `count`; no se supone una opción `full`.

### Disponibilidad

Los campos de despacho del listado observado estaban vacíos. No se convierten en stock cero
ni en disponibilidad confirmada. El resultado es `unknown`, salvo una señal explícita de
agotamiento. La comuna de entrega **no identifica una sucursal de retiro** y tampoco demuestra
inventario físico disponible. El precio observado no constituye una reserva ni una cotización
garantizada por la tienda.

## Robots y condiciones del sitio

Se obtuvo HTTP 200 para [`robots.txt`](https://www.sodimac.cl/robots.txt). Las reglas observadas
para `User-agent: *` restringen, entre otras, cuentas, compra, `/product/`, `/category/` y
`/static/`. La ruta `/s/browse/v1/listing/cl` no coincidió con una prohibición de ese archivo.
El cliente común vuelve a consultar las reglas y detiene rutas prohibidas o bloqueos HTTP;
el adaptador no ofrece una vía alternativa para eludirlos.

Los [términos de compra oficiales](https://www.sodimac.cl/sodimac-cl/content/comprar-terminos-condiciones),
sección 18, reservan derechos sobre contenidos, compilaciones e imágenes, limitan su reproducción
y explotación sin consentimiento y mencionan excepciones de la legislación aplicable. No se
obtuvo consentimiento ni se determinó que una excepción específica cubra este proyecto. Que
`robots.txt` permita una ruta no concede una licencia de reutilización. El alcance académico
documentado conserva hechos puntuales, precio y procedencia; evita descripciones extensas,
imágenes descargadas y la redistribución del catálogo completo. Antes de ampliar el uso o
publicarlo comercialmente corresponde revisar las condiciones vigentes y las autorizaciones
que sean necesarias.

## Evidencia y pruebas reproducibles

- [`sodimac_ceramic.json`](../../python-service/tests/fixtures/sodimac_ceramic.json) y
  [`sodimac_laminate.json`](../../python-service/tests/fixtures/sodimac_laminate.json) son
  **muestras recortadas** de campos públicos de las respuestas del 18/10/2026. No incluyen
  sesiones, cabeceras privadas ni archivos de imágenes. Los precios de estas pruebas son
  históricos, no precios actuales.
- [`test_sodimac.py`](../../python-service/tests/test_sodimac.py) comprueba separación caja/m²,
  exclusión de muros/terceros/SPC, promociones condicionadas, cobertura faltante, stock
  desconocido y errores de formato/paginación. Las pruebas unitarias no consultan la tienda.
- Una captura fallida no puede convertirse en una comprobación exitosa ni sustituirse por
  productos ficticios presentados como datos en vivo.
