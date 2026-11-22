# Contrato v1 de sugerencias por habitación

Propuesta de integración entre Angular y NestJS para revisar con Cris. La rama base `d4b1ebc` contiene el catálogo persistido, el presupuesto por cajas y la comparación demostrativa de EP1. Las rutas de este documento están conectadas en el cliente y requieren la implementación del Bloque 1 para funcionar con datos reales.

## Rutas y autenticación

Todas las operaciones usan JSON y `Authorization: Bearer <sesión Habita3D>`. NestJS comprueba que el proyecto y la habitación pertenecen a la sesión. Un proyecto ajeno o una habitación fuera del proyecto devuelve `404`. Cada recurso nuevo es aditivo respecto de las rutas existentes.

| Método | Ruta | Entrada | Respuesta |
| --- | --- | --- | --- |
| GET | `/api/projects/:id` | Identificador de proyecto entero positivo | Proyecto existente con `suggestionsEnabled` y preferencias en cada habitación |
| PATCH | `/api/projects/:id/suggestions/settings` | `{"suggestionsEnabled":false}` | `200` con el mismo objeto y el valor guardado |
| PATCH | `/api/projects/:id/rooms/:roomId/suggestions/preferences` | `{"preferredCategory":"ceramic","preferredSource":"sodimac"}` | `200` con la habitación completa y los valores guardados |
| GET | `/api/projects/:id/rooms/:roomId/suggestions` | Parámetro opcional `exclude` repetido por clave descartada | `200` con saldo, motivo vacío y hasta tres opciones |
| POST | `/api/projects/:id/rooms/:roomId/suggestions/accept` | `{"publicationKey":"<clave>","quoteId":"<cotización>"}` | `200` con selección guardada o `409` con nueva cotización |

`roomId` es un UUID v4. `publicationKey` es la clave textual existente del catálogo. `exclude` admite hasta 40 claves distintas del catálogo, se aplica antes del ranking y se conserva solo en memoria de la sesión del cliente. Ejemplo de la consulta tras dos descartes: `?exclude=<clave1>&exclude=<clave2>`. La siguiente consulta a otra habitación empieza con sus propios descartes.

`preferredCategory` acepta `ceramic`, `laminate` o `null`. `preferredSource` acepta `sodimac`, `easy` o `null`. `null` borra una preferencia. En la respuesta integrada siempre se incluyen ambos campos. `suggestionsEnabled` es booleano y comienza en `true` para proyectos anteriores. Guardar preferencias o ajustes conserva la selección anterior.

## Responsabilidad de los datos

- Angular envía identificadores, preferencias, ajuste del proyecto, descartes y la cotización que el usuario acaba de ver. Las dimensiones, el margen y los presupuestos se guardan mediante las rutas EP2 existentes. La interfaz muestra los importes, estados, explicaciones y el orden devueltos.
- NestJS obtiene propietario, proyecto, habitación, preferencias, costos comprometidos y publicaciones con su última observación persistida. Pasa el contexto y las publicaciones a la recomendación interna de FastAPI, con la credencial interna y el identificador de solicitud. Ninguna de estas operaciones inicia capturas ni consulta directamente a las tiendas.
- El motor usa cajas completas y el menor valor entre saldo global y límite de habitación, si existe. Marca el saldo provisional si faltan costos de otras habitaciones. Excluye productos agotados o sin costo calculable, conserva la disponibilidad desconocida como tal y aplica la prioridad del plan final por tipo, tienda y costo. Si ninguna opción cabe, devuelve las más cercanas por exceso. NestJS valida la respuesta interna y emite el contrato público.
- NestJS genera una `quoteId` opaca vinculada a sesión o propietario, proyecto, habitación, publicación, entradas del cálculo y observación de precio. Al aceptar, recalcula con el último precio persistido y valida la cotización dentro de una operación consistente con el guardado. Si cambió, responde con la nueva cotización y conserva la selección previa. Repetir una aceptación válida para la misma publicación debe conservar una sola relación de piso.

## Ejemplos de consulta

Datos sintéticos para pruebas. Con saldo global de $80.000 y límite de habitación de $100.000, la habitación dispone de $80.000. Fechas en ISO 8601, importes en pesos chilenos enteros seguros en JavaScript. `quoteId` de ejemplo no es una credencial real.

```json
{
  "availableBudgetClp": 80000,
  "provisionalBudget": false,
  "emptyReason": null,
  "suggestions": [
    {
      "publicationKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "name": "Cerámica de prueba",
      "source": "sodimac",
      "category": "ceramic",
      "availability": "unknown",
      "checkedAt": "2026-11-22T15:00:00Z",
      "priceStale": false,
      "boxes": 8,
      "totalClp": 80000,
      "fitsBudget": true,
      "budgetExcessClp": 0,
      "reasons": ["Coincide con el tipo de piso preferido", "Cabe en el presupuesto disponible"],
      "quoteId": "cotizacion-sintetica-v1"
    }
  ]
}
```

| Caso | Variación reproducible respecto del ejemplo | Estado visible |
| --- | --- | --- |
| Éxito | Respuesta del ejemplo | 8 cajas, $80.000, dentro del presupuesto, disponibilidad sin confirmar y última comprobación |
| Exceso | La alternativa disponible más cercana cuesta $92.000, con `fitsBudget: false`, `budgetExcessClp: 12000` | Exceso de $12.000 |
| Parcial | Una habitación distinta carece de costo, con `provisionalBudget: true` | Saldo provisional |
| Sin opciones | `suggestions: []`, `emptyReason: "no_calculable_options"` | Sin opciones calculables |
| Descartadas | `suggestions: []`, `emptyReason: "all_dismissed"` | Se descartaron todas las opciones de la habitación |
| Vigencia | `priceStale: true` cuando han pasado más de 24 horas desde `checkedAt` | Aviso junto a la fecha de la última comprobación |

Cuando hay resultados, `emptyReason` es `null`. Si las sugerencias están desactivadas, Angular conserva acceso al catálogo y al presupuesto y suspende sus consultas de sugerencias. Si otro cliente desactivó la función mientras estaba abierta, el servidor devuelve `409` con `code: "suggestions_disabled"` para la consulta o la aceptación.

## Aceptación y reconfirmación

Primer envío con `publicationKey` del ejemplo y `quoteId: "cotizacion-sintetica-v1"`. Si cambia la cotización, el servidor responde `409` con el siguiente cuerpo.

```json
{
  "status": "price_changed",
  "quote": {
    "publicationKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "name": "Cerámica de prueba",
    "source": "sodimac",
    "category": "ceramic",
    "availability": "unknown",
    "checkedAt": "2026-11-22T16:00:00Z",
    "priceStale": false,
    "boxes": 8,
    "totalClp": 85000,
    "fitsBudget": false,
    "budgetExcessClp": 5000,
    "reasons": ["Excede el presupuesto disponible"],
    "quoteId": "cotizacion-sintetica-v2"
  }
}
```

Angular muestra $80.000 y $85.000 y espera la decisión explícita. Si el usuario confirma, repite el POST con la cotización v2. Si el precio sigue vigente, la respuesta es `{"status":"accepted","room":{...}}` con `room` igual a la forma completa de la habitación devuelta en EP2, incluyendo `publication`, las preferencias y la nueva `publicationKey`. Angular actualiza la habitación y consulta de nuevo el presupuesto. Si el precio cambió de nuevo, se repite el mismo flujo de confirmación.

## Errores y estados

| HTTP | Ejemplo de respuesta | Estado visible |
| --- | --- | --- |
| 400 | `{"code":"invalid_recommendation_request"}` | Revisar datos de la operación |
| 401 | `{"code":"session_expired"}` | Volver a iniciar sesión y recuperar el recorrido |
| 403 | `{"code":"forbidden"}` | La cuenta carece del permiso general requerido |
| 404 | `{"code":"room_not_found"}` | Habitación inexistente o ajena |
| 409 | `{"code":"suggestions_disabled"}` | Cambio de configuración concurrente |
| 409 | `{"code":"publication_unavailable"}` | La publicación dejó de ser elegible. Consultar sugerencias de nuevo |
| 409 | `{"status":"price_changed","quote":{...}}` | Confirmar el nuevo costo o cancelar |
| 429 | `{"code":"rate_limited"}` | Esperar y reintentar |
| 503 | `{"code":"recommendations_unavailable"}` | El servicio no está disponible. Reintentar después de recuperarlo |

La pantalla incluye estados de carga y falta de conexión. Si fallan las sugerencias, conserva el piso guardado y permite navegar al catálogo. Antes de aprobar la integración, contrastar los códigos, DTO, autenticación y ejemplos con OpenAPI de NestJS y probar la misma secuencia desde navegador, PWA y Android.

## Comprobación del cliente durante el desarrollo

En la rama local del Bloque 2, con base `d4b1ebc`, pasaron 20 pruebas de API, recomendaciones y proyectos. También se ejecutó el siguiente recorrido en Chrome en Windows a 1280 × 900 y 390 × 844, usando Playwright para responder las solicitudes `/api/**` con datos sintéticos del contrato:

1. Abrir un proyecto privado, iniciar sesión con la cuenta ficticia y comprobar que las solicitudes del proyecto usan su sesión. Verificar el saldo provisional, la disponibilidad y la antigüedad del precio.
2. Guardar preferencias en la sala. Descartar la propuesta inicial, comprobar que la consulta excluye esa clave y muestra el reemplazo de $92.000 con $12.000 de exceso. Abrir el dormitorio y comprobar que sigue disponible la propuesta inicial.
3. Aceptar la propuesta de $80.000. Responder con `409` y la cotización de $85.000. Comprobar que se mantiene la selección previa hasta confirmar y que el segundo envío usa la nueva cotización. Verificar actualización del presupuesto y restauración de la selección después de recargar.
4. Responder con `503` al consultar otra habitación. Recuperar el servicio simulado y pulsar «Volver a consultar». Desactivar las sugerencias y comprobar que el botón de catálogo mueve el foco al catálogo funcional.

Ambos tamaños completaron el recorrido sin errores de JavaScript sin capturar. Quedan pendientes la revisión del contrato con Cris y la repetición contra las rutas reales de NestJS y FastAPI.
