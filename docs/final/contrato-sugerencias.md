# Contrato histórico de sugerencias del bloque 1

> Referencia del bloque 1 antes de integrar la interfaz. Para la entrega final, usar el [contrato vigente v1](contrato-sugerencias-v1.md), con confirmación mediante `quoteId`.


Los ejemplos de esta página corresponden a la versión del bloque 1.

## Identidad y configuración

- Las rutas de proyecto requieren **Authorization: Bearer &lt;sesión&gt;**. El
  identificador del proyecto es un entero y el de habitación es un UUID v4.
  Se devuelve 404 si la cuenta no tiene acceso al recurso.
- En POST /api/projects y PATCH /api/projects/{id}, **suggestionsEnabled** es
  booleano opcional. Si se omite al crear, queda activado. Un PATCH con
  {"suggestionsEnabled": false} desactiva por proyecto y conserva sus elecciones.
- En POST /api/projects/{id}/rooms y PATCH /api/projects/{id}/rooms/{roomId},
  **preferredCategory** admite ceramic, laminate o null, y **preferredSource**
  admite sodimac, easy o null. Utilizar null para limpiar la preferencia y
  omitir el campo para conservarla. Se devuelven ambos campos en la habitación.
- Al crear y editar superficie, se conservan las convenciones de EP2 de área
  o dimensiones y decimales como cadenas. Los montos CLP son enteros seguros.

## Consultar sugerencias

**GET /api/projects/{id}/rooms/{roomId}/suggestions**

Al cargar una habitación con superficie, consultar esta ruta y repetirla
después de guardar cambios de área, margen, proyecto o preferencias.
Las sugerencias usan el catálogo persistido. El argumento **exclude** permite
reenviar hasta 40 claves SHA-256 separadas por comas, sin espacios. La interfaz
conserva esa lista por habitación durante la sesión para implementar «Descartar».
Las respuestas privadas de sugerencias usan Cache-Control: private, no-store.

Ejemplo abreviado con datos de prueba. **publication** sigue el mismo formato
de [catálogo](../ep2/bloque-2-backend.md) y los nombres de campo se muestran
tal como llegan a Angular.

~~~json
{
  "roomId": "29afa99e-bba4-4e7d-9df6-140bd28d3503",
  "status": "within_budget",
  "ruleVersion": "floor-rules-v1",
  "availableBudgetClp": 80000,
  "budgetProvisional": true,
  "items": [
    {
      "publication": {
        "publicationKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "name": "Cerámica de ejemplo",
        "category": "ceramic",
        "source": "easy",
        "pricePerBoxClp": 15000,
        "coveragePerBoxM2": "2",
        "availability": "unknown",
        "checkedAt": "2026-11-22T15:10:00.000Z"
      },
      "boxes": 5,
      "costClp": 75000,
      "budgetExcessClp": 0,
      "reasons": ["El costo de las cajas cabe en el presupuesto disponible."],
      "isPriceStale": false
    }
  ]
}
~~~

| Estado | Qué presenta la interfaz |
| --- | --- |
| within_budget | Hasta tres publicaciones calculables dentro de los límites. Si el saldo es provisional, indicar que quedan otros costos pendientes. |
| over_budget | Las opciones que menos exceden el límite. Mostrar budgetExcessClp por producto. |
| no_candidates | Lista vacía. Indicar que no hay publicaciones calculables para sugerir con el catálogo actual y las exclusiones. |
| disabled | Lista vacía, ruleVersion y availableBudgetClp en null. Mantener presupuesto y catálogo visibles. |

Mostrar «Disponibilidad sin confirmar» para unknown, también en el catálogo
general. Si isPriceStale es true, mostrar el aviso de 24 horas y la fecha
real de la última comprobación. La disponibilidad y la vigencia se muestran
por separado. Ante 502/503, mostrar un error temporal y permitir reintentar.

## Aceptar y confirmar el precio

**POST /api/projects/{id}/rooms/{roomId}/suggestions/accept**

Enviar la clave y el costo mostrado por todas las cajas de esa habitación.

~~~json
{
  "publicationKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "expectedCostClp": 75000
}
~~~

- **200, status price_changed.** Incluye costClp, boxes, publication e
  isPriceStale. La selección anterior se conserva. Mostrar el nuevo costo y,
  si el usuario confirma, repetir la petición con ese expectedCostClp.
- **200, status accepted.** También devuelve room con la selección guardada.
  Refrescar el presupuesto y la vista del proyecto.
- **409.** SUGGESTIONS_DISABLED, SUGGESTION_UNAVAILABLE o SUGGESTION_CHANGED.
  Mostrar el motivo y volver a consultar el proyecto o la lista según
  corresponda. Un cambio concurrente requiere calcular otra vez.
- **400/401/404/429.** Entrada inválida, sesión ausente o vencida, recurso
  inaccesible o límite de solicitudes superado. Respetar Retry-After si existe.

La elección manual existente mediante PATCH de la habitación sigue disponible
para la navegación por el catálogo. El botón de sugerencias utiliza la ruta
de confirmación de costo descrita aquí. La aplicación utiliza la sesión de la
cuenta y la URL de NestJS. La credencial X-Materials-Token pertenece al operador
y a servicios internos.
