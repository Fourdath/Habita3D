# Easy: acceso, procedencia y límites de los datos

Comprobación: **18/10/2026**, referencia Metropolitana / La Florida. Este documento describe el adaptador de `python-service/app/sources/easy.py`; los precios de las muestras son históricos y no garantizan un valor al comprar.

## Rutas y comprobaciones

| Consulta pública | Resultado observado |
| --- | --- |
| [robots.txt](https://www.easy.cl/robots.txt) | HTTP 200; el grupo `User-agent: *` restringe ordenamiento, presentación, carro y rutas `/filter/`; no restringe las dos búsquedas utilizadas. |
| [Cerámica para piso](https://www.easy.cl/search/ceramica%20piso) con contexto La Florida | HTTP 200; 40 entradas recibidas, `recordsFiltered: 315`. |
| [Piso flotante](https://www.easy.cl/search/piso%20flotante) con contexto La Florida | HTTP 200; 40 entradas recibidas, `recordsFiltered: 404`. Sin los vendedores de la comuna, la misma búsqueda informó 495. |
| [Términos y condiciones](https://www.easy.cl/legals/terms-and-conditions) | HTTP 200 y lectura en navegador normal; el sitio indicaba última actualización 04/03/2026. |

Cada HTML contiene `__NEXT_DATA__` y los registros se leen desde `props.pageProps.serverProductsResponse.productList`. El total está en `recordsFiltered`. Se utiliza `?page=2` y siguientes cuando la muestra aceptada aún no llega al límite. El catálogo observado pagina de 40 en 40; el coordinador detiene la captura al reunir hasta **10 publicaciones válidas por categoría** y conserva el número realmente recibido/excluido para las métricas.

La ruta JSON `/_next/data/{buildId}/search/...json` también existe, pero una comprobación devolvió HTTP 502. El adaptador utiliza el HTML normal con los mismos datos públicos y no depende de un `buildId` fijo. No hay resolución de desafíos ni evasión de bloqueos.

## Ubicación y vendedores

En el navegador normal se eligió Metropolitana y La Florida; el encabezado confirmó **Entrega en La Florida**. Se reproducen únicamente los tres valores públicos del selector:

| Cookie de contexto | Valor |
| --- | --- |
| `X-Constructor-Region` | `Metropolitana` |
| `X-Constructor-Commune-Code` | `13110` |
| `X-Constructor-Sellers` | Lista pública de vendedores elegibles obtenida del selector. |

Los IDs de vendedores están en `LA_FLORIDA_SELLERS` con fecha y procedencia; `EASY_SELLER_IDS` permite reemplazarlos como una lista separada por comas si Easy modifica el contexto. Los valores se codifican como lo hace el selector. No se publican sesiones de navegador, cookies de cuenta, direcciones personales, tokens ni claves de API. El servicio de comuna del sitio exige una clave de frontend y **no forma parte del adaptador**.

La respuesta de catálogo no repite explícitamente la comuna. Por eso cada captura registra una advertencia: se envió el contexto verificado, pero no se garantiza precio exclusivo local ni inventario físico de una sucursal. Los vendedores elegibles pueden variar; se deben revisar si cambia el comportamiento del sitio.

## Selección y significado de los campos

- Solo se admiten publicaciones con `isMarketplace: false` y vendedor vacío o identificado como Easy. La lista geográfica puede contener vendedores externos; ese filtro se aplica después y los excluye.
- La búsqueda no determina por sí sola la categoría. Cerámicas requiere evidencia de uso en piso en nombre o tipo de producto; admite piso/muro y excluye muro exclusivo. Laminados exige nombre/tipo compatible y categoría Pisos Flotantes. Se excluyen vinílicos, PVC, LVT y SPC.
- `contentUnit: m2box` identifica venta por caja. La cobertura se toma de especificación explícita o de un único valor en m² en el título cuando esa unidad de caja está presente. Nunca se reconstruye dividiendo precios; si falta, se conserva como desconocida y la normalización puede rechazar el cálculo.
- Se separan precio normal por caja, oferta general, precio informado por m² y promociones. No se aplican automáticamente cupones, precio de marca/tarjeta ni ofertas condicionadas a una tarjeta.
- `availableQuantity` se conserva como dato reportado; su semántica no se ha confirmado como inventario físico. La disponibilidad normalizada permanece `unknown`, incluso si la fuente informa `1`.
- La URL, SKU, identificador, vendedor, marca, categoría y evidencia mínima acompañan al registro. El coordinador añade la fecha real de captura exitosa y los metadatos comunes.

## Uso responsable y derechos

La revisión de los términos se concentró en disposiciones generales y la sección II.3 sobre precios: el valor definitivo corresponde al proceso de compra y las campañas tienen condiciones y vigencia propias; las ofertas web pueden diferir de las tiendas físicas. La documentación no presenta estas rutas como una API contratada ni como una autorización general de reutilización. Que robots permita una ruta tampoco concede una licencia sobre imágenes o textos.

Para la demo académica se limita la muestra, se atribuye la tienda y se conserva el enlace de origen; no se replica el sitio ni se publican descripciones extensas o datos personales. Las imágenes se referencian mediante sus URL originales. Antes de una publicación comercial o una extracción de mayor alcance corresponde revisar nuevamente las condiciones y los permisos aplicables.

El cliente compartido verifica robots por host, identifica el proyecto, aplica al menos cinco segundos entre consultas al mismo host, limita los reintentos y respeta `Retry-After`. Ante bloqueo persistente o formato inesperado, falla de forma explícita y no sustituye la captura por valores inventados.

## Pruebas reproducibles

`tests/fixtures/easy_ceramic.json` y `easy_laminate.json` contienen hasta diez publicaciones públicas por categoría de esta comprobación, recortadas a los campos necesarios; incluyen fecha, URL y contexto. Son **fixtures de prueba**, no una actualización en vivo ni una promesa de vigencia. `tests/test_easy_source.py` verifica exclusiones, cobertura, promociones, paginación, cambio de formato y las tres cookies públicas enviadas.
