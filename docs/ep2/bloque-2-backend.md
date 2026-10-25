# Bloque 2: backend, persistencia e integración

Implementación del 24/10/2026. Este bloque proporciona las APIs que consumirá el
bloque 3. La interfaz Angular actual conserva el recorrido demostrativo de EP1;
todavía no es la pantalla del catálogo de EP2. El [manual de staging](bloque-2-staging.md)
describe Docker, Terraform y el despliegue al computador Windows del equipo.

## Qué está implementado

- Prisma/PostgreSQL: publicaciones, capturas procesadas, trabajos de captura,
  historial, propietario de proyecto y habitaciones con selección persistida.
- Catálogo con los filtros acordados, paginación, procedencia y última comprobación.
- Importación transaccional e idempotente de resultados del bloque 1.
- Coordinación de captura protegida, exclusión entre procesos y tres franjas chilenas.
- Cálculo de presupuestos en FastAPI sobre los precios persistidos, sin capturar al navegar.
- Salud de dependencias, correlación y duración de solicitudes.
- Pruebas deterministas y prueba de integración con PostgreSQL y FastAPI.

No se necesita cambiar de proveedor ni registrar una tarjeta. El compañero instalará
el runner de Windows después; su instalación y el primer despliegue allí siguen
pendientes de validación. Preparar el workflow no acredita que ya se haya ejecutado.

## Puesta en marcha

Seguir [bloque-2-staging.md](bloque-2-staging.md). Copiar `.env.example` a `.env`,
generar contraseñas propias y configurar `MATERIALS_API_TOKEN` con al menos 24
caracteres; el ejemplo `replace-...` no sirve como credencial. No subir `.env` a Git.
Por defecto `MATERIALS_SCHEDULE_ENABLED=false`: arrancar o probar la aplicación
no empieza a consultar las tiendas automáticamente. Activar el programador de NestJS
cuando el operador haya validado las fuentes y mantenga el equipo encendido.

La migración aditiva `20261024000000_ep2_catalogue_rooms` conserva los proyectos de
EP1. Los proyectos antiguos sin propietario y los creados por la vista previa
demostrativa no se asignan a una cuenta ficticia automáticamente; el CRUD privado
de EP2 no los lista. Crear proyectos EP2 después de iniciar sesión.

## Contrato del catálogo

Todas las rutas siguientes tienen prefijo `/api`. Las lecturas son públicas;
modificar precios e iniciar capturas exige una credencial de operador del servidor,
distinta del token Bearer de una cuenta de demostración.

| Método y ruta | Resultado |
| --- | --- |
| `GET /materials` | `{items,total,page,limit}`. Filtros opcionales `source=sodimac|easy`, `category=ceramic|laminate`, `minPricePerM2`, `maxPricePerM2`. |
| `GET /materials/:publicationKey` | Publicación y resultado del último intento de su grupo. La clave es SHA-256 de 64 caracteres hexadecimales. |
| `GET /materials/:publicationKey/history` | `{publicationKey,currency,priceType,seller,communeCode,items,total,page,limit}`; observación inicial y cambios de precio/envase, del más antiguo al más reciente. |
| `GET /materials/status` | Almacenamiento PostgreSQL, cantidad, última captura importada, último trabajo y resultados por fuente/categoría. |
| `POST /materials/import` | Resultado completo de `CaptureResult` del bloque 1. Requiere `X-Materials-Token`; 201 con `runId`, `status`, `replayed`, `updatedCount`, `retainedCount`. |

El catálogo y el historial usan `page` desde 1 y `limit` acotado. El orden del
catálogo es estable por `publicationKey`; los valores mínimo y máximo son cadenas
decimales positivas o cero, y el mínimo no puede superar el máximo. No se añade un
buscador textual ni filtros de marca/color/formato al alcance aprobado.

Ejemplo de campos de una publicación; la clave y valores deben obtenerse de la API:

```json
{
  "publicationKey": "<clave del catálogo>",
  "source": "sodimac",
  "category": "ceramic",
  "seller": "Sodimac",
  "name": "<nombre publicado>",
  "pricePerBoxClp": 10000,
  "saleUnit": "box",
  "coveragePerBoxM2": "2",
  "pricePerM2Clp": "5000",
  "currency": "CLP",
  "priceType": "public",
  "availability": "unknown",
  "communeCode": "13110",
  "checkedAt": "2026-10-24T12:00:00.000Z",
  "lastCheckedDisplay": "24/10/2026 09:00"
}
```

Este ejemplo es ilustrativo, no una oferta actual. La respuesta incluye además SKU,
identificador externo, marca e imagen opcionales, URL del producto, promociones
separadas, evidencia y versión del extractor. Los precios por caja son pesos enteros;
superficies, coberturas y precios por m² son cadenas decimales para conservar precisión.
Ausencia de cobertura sigue siendo `null`, y stock no demostrado sigue siendo `unknown`.

### Importación e historial

1. Validar estructura, moneda, fuente/vendedor, ubicación, clave, URLs, fechas,
   precios/coberturas, métricas, muestras y partición entre actualizados y retenidos.
2. Abrir una transacción y tomar un bloqueo PostgreSQL exclusivo para importaciones.
3. Un `run_id` repetido con el mismo contenido devuelve `replayed: true` sin escribir;
   el mismo ID con contenido distinto devuelve 409.
4. Actualizar solo las claves de `updated_publication_keys`. Una observación más
   antigua no reemplaza un precio reciente; el resultado identifica `staleKeys`.
5. Crear historial inicial o de cambio de precio/cobertura/unidad. El mismo precio
   con comprobación nueva actualiza `checkedAt` sin inventar un cambio.
6. Confirmar captura, publicaciones e historial juntos. Cualquier rechazo revierte
   la transacción completa. La muestra almacenada admite hasta diez publicaciones
   por tienda y categoría; no elimina selecciones para hacer espacio a otro muestreo.

`lastAttempt` corresponde al último resultado importado de la fuente/categoría.
Si FastAPI no respondió, puede no existir una nueva captura importada: la interfaz
también debe revisar `latestJob` de `/materials/status` o `/captures/status` para
avisar del fallo global. Ningún fallo adelanta `checkedAt` de un precio retenido.
El historial conserva la cobertura/unidad de cada observación; un cambio de envase
no debe representarse como una comparación homogénea sin mostrar ese contexto.

## Proyectos, habitaciones y presupuestos (bloque 2)

Las operaciones EP2 requieren `Authorization: Bearer <accessToken>` obtenido con
el registro/inicio de sesión existente. El propietario procede de la sesión y no
se acepta como campo del cuerpo. Un ID perteneciente a otra cuenta devuelve 404.
Los proyectos demostrativos antiguos sin propietario no aparecen en estas consultas.

| Método y ruta (prefijo `/api`) | Entrada / resultado |
| --- | --- |
| `POST /projects` | `{ "name": "Casa", "budgetClp": 300000 }`. Devuelve proyecto con `id` entero, nombre, presupuesto y fechas. |
| `GET /projects` | Hasta 100 proyectos propios, del más reciente al más antiguo. |
| `GET /projects/:id` | Proyecto propio con `rooms` y datos de la publicación elegida en cada habitación. |
| `PATCH /projects/:id` | Modifica `name` y/o `budgetClp`. |
| `DELETE /projects/:id` | 204; elimina las habitaciones por cascada, no el catálogo ni el historial de precios. |
| `POST /projects/:id/rooms` | Crea una habitación. |
| `PATCH /projects/:id/rooms/:roomId` | Modifica superficie, nombre, margen, límite presupuestario o selección. |
| `DELETE /projects/:id/rooms/:roomId` | 204. |
| `GET /projects/:id/budget` | Calcula con las últimas publicaciones persistidas; no inicia capturas. |

Ejemplo de habitación por superficie:

```json
{
  "name": "Dormitorio",
  "areaMode": "area",
  "areaM2": "10.5",
  "wastePercent": "10",
  "budgetClp": 120000,
  "publicationKey": "<clave SHA-256 del catálogo>",
  "sceneRoomId": "dormitorio-1"
}
```

Para dimensiones, usar `"areaMode": "dimensions"`, `"lengthM": "4"` y
`"widthM": "3"`, sin `areaM2`. Al cambiar de modalidad con PATCH, enviar la
modalidad nueva y la superficie o ambas dimensiones nuevas en el mismo cuerpo;
las magnitudes de la modalidad anterior se eliminan de forma atómica.

Las superficies/coberturas/márgenes se devuelven como cadenas decimales para
mantener precisión entre JSON, Prisma y FastAPI. Se aceptan números JSON finitos
o cadenas decimales con hasta seis decimales: superficie directa >0 y <=1.000.000
m², largo/ancho >0 y <=10.000 m, margen de 0 a 100 %. Los importes presupuestarios
son números JSON de pesos enteros entre 0 y 10^15. El margen omitido es 10 % y
el límite de la habitación omitido es null. Se admiten hasta 100 habitaciones.

`publicationKey`, `budgetClp` y `sceneRoomId` pueden borrarse explícitamente con
null en `PATCH /projects/:id/rooms/:roomId`. El presupuesto total de un proyecto
siempre es un importe entero y no admite null. Seleccionar un piso no duplica el precio dentro de la habitación:
se guarda la relación con la publicación. Campos de propietario o precio enviados
por el cliente se rechazan. Cada modificación se serializa por proyecto para
evitar que escrituras simultáneas pierdan selecciones o superen el límite de habitaciones.

### Respuesta del presupuesto

La estructura conserva el contrato snake_case de `/floors/budget` de FastAPI,
añadiendo `project_id`, `total_rooms` y `unselected_room_ids`. Su
`calculation_basis` vale `latest_persisted_publications`. Las selecciones y los
precios se leen bajo una única instantánea PostgreSQL `RepeatableRead`; la
transacción termina antes de consultar FastAPI. NestJS no duplica la fórmula de
cajas/costos ni mantiene versiones de presupuesto.

`rooms` contiene los resultados de las habitaciones con publicación elegida. Las
habitaciones sin elección aparecen en `unselected_room_ids`; deben mostrarse como
pendientes en la interfaz. Si falta alguna selección o un producto no se puede
calcular, se devuelve el subtotal calculable pero `total_cost_clp`, las diferencias
globales y `fits_budget` son null. Un proyecto vacío tampoco se presenta como de
costo cero. Un precio nuevo actualiza el cálculo en la próxima consulta y conserva
la habitación y el piso elegido. Cada resultado incluye la fecha del precio y su
presentación chilena `DD/MM/AAAA HH:MM`, sin prometer stock si es desconocido.

`POST /projects/preview` continúa siendo una demostración pública EP1 con valores
ficticios; no representa el presupuesto con precios web y sus proyectos no tienen
propietario. La interfaz EP2 debe utilizar las rutas privadas anteriores.


## Coordinación de capturas

| Método y ruta | Uso |
| --- | --- |
| `POST /captures` | Captura manual protegida por `X-Materials-Token`; cuerpo `{}` para las cuatro combinaciones. Opcionales `sources`, `categories`, `limitPerCategory` de 1 a 10. |
| `GET /captures/status` | Programación configurada y último trabajo, con inicio/fin, estado y código de error. No inicia capturas. |

NestJS llama a `/materials/captures` de FastAPI por la red interna y después importa
su resultado. El token no se envía al navegador ni a las tiendas. El cliente HTTP
limita tamaño y tiempo, no sigue redirecciones ni reintenta una extracción: ante un
fallo se conserva el último dato válido. Python mantiene sus pausas, límites,
reintentos acotados y bloqueo de evidencia del bloque 1.

El programador consulta la hora de `America/Santiago`, incluyendo sus cambios de
hora. Intenta las franjas de 08:00, 12:00 y 16:00 durante una ventana inicial de
15 minutos; no recupera franjas antiguas cuando el equipo se enciende horas después.
Un registro persistido impide repetir la misma franja después de reiniciar. Un
bloqueo de sesión PostgreSQL impide capturas simultáneas entre instancias, mientras
otro bloqueo transaccional distinto protege la importación. No se mantiene una
transacción abierta mientras se espera a una tienda.

Si el proceso se interrumpe, el bloqueo de sesión se libera. Al reiniciar, NestJS
cierra los trabajos huérfanos como fallidos bajo ese mismo bloqueo, conserva los
precios y no repite solicitudes de la franja interrumpida. Un intento manual
protegido permite recuperar una captura cuando el operador decida hacerlo.

Solo NestJS programa el flujo integrado. No ejecutar simultáneamente
`python -m app.capture --schedule`: ese comando del bloque 1 produce evidencia
local, pero no coordina la importación PostgreSQL ni los trabajos de NestJS.

## Observabilidad, errores y versión

- `GET /health`: liveness de NestJS, compatible con EP1.
- `GET /health/ready`: consulta PostgreSQL y `/health` de FastAPI. Devuelve 200 con
  `services.postgres=ok`, `services.python=ok` y `version=APP_VERSION`; 503 si falla
  una dependencia. No contiene credenciales ni diagnostica disponibilidad comercial.
- `X-Request-ID` se valida/genera, se devuelve al cliente y se propaga a FastAPI.
  Los logs JSON registran servicio, evento, resultado y `duration_ms`, sin cuerpos,
  contraseñas ni cabeceras de autenticación.
- 400: entradas/importación inválidas; 401: credencial/sesión ausente o incorrecta;
  404: recurso inexistente o de otro propietario; 409: captura ocupada o conflicto
  de importación; 502: respuesta inválida del especialista; 503: servicio o configuración
  no disponibles. Consultar el estado para distinguir un precio anterior de un fallo.

## Comprobaciones reproducibles

Las pruebas no llaman a Sodimac ni a Easy. El fixture
`backend/test/fixtures/ep2-capture.json` contiene datos **sintéticos** identificados
por `evidence.test_fixture`; `origin=live` es el valor del contrato del bloque 1 y
no convierte esos datos de prueba en una captura real. La evidencia real del bloque 1
permanece en `evidencias/bloque-1-calidad.json`.

- Backend: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.
- Integración PostgreSQL: aplicar migraciones en una base desechable y ejecutar
  e2e con `RUN_DATABASE_TESTS=true`. Incluye transacciones, historial, retención,
  propietarios, exclusión entre capturas, recuperación de interrupciones y reinicio.
- Docker + FastAPI real: `python scripts/ep2-smoke.py --disposable-fixtures` contra
  un conjunto de prueba aislado con `MATERIALS_API_TOKEN` configurado. Escribe datos
  sintéticos; no usar esa opción contra el catálogo de la demo.
- Staging existente: `python scripts/ep2-smoke.py --base-url <URL-local>` sin esa
  opción, o `scripts/verify-local.ps1`; estas verificaciones son de lectura.
- Python: lint, pruebas y contrato OpenAPI versionado, incluida la franja enviada
  por NestJS como `scheduled_for`.

Consultar [evidencias del bloque 2](evidencias/bloque-2-validacion.md) para resultados
y límites reales de la ejecución. La verificación nativa Windows y el primer
despliegue desde su runner se documentarán después de que el compañero los ejecute.
