# Entrega Parcial 2: planificación y acuerdos

Actualizado el 18/10/2026.

Esta carpeta registra el alcance definido para la EP2 y el trabajo por ejecutar.
**La documentación no acredita que las funcionalidades de EP2 ya estén implementadas.**

| Documento | Contenido |
| --- | --- |
| [Acuerdos](acuerdos.md) | Decisiones funcionales, restricciones y registro de la ronda de definición. |
| [Plan de trabajo](plan-de-trabajo.md) | Tres bloques para el equipo, contratos, dependencias, backlog y criterios de aceptación. |
| [Fuentes web](fuentes-web.md) | Pruebas de muestra de Sodimac/Easy, ubicación, JSON, paginación y limitaciones verificadas. |
| [Opciones de staging](staging.md) | Candidatas de alojamiento gratuito sin tarjeta y verificaciones pendientes. |

## Alcance resumido

- Cerámicas para piso y piso flotante laminado de Sodimac y Easy, con La Florida
  como comuna de referencia.
- Hasta diez publicaciones por categoría y tienda: máximo cuarenta.
- Extracción Python, procesamiento FastAPI, integración NestJS, persistencia
  PostgreSQL e interfaz Angular.
- Proyectos con varias habitaciones, superficie en m² o largo/ancho, margen de
  material inicial del 10 % editable y límites presupuestarios opcionales.
- Presupuesto con los últimos precios comprobados, historial informativo de precios
  y previsualización 3D orientativa del piso por habitación.
- Filtros por tipo de piso, tienda y precio por m².
- Comprobaciones programadas a las 08:00, 12:00 y 16:00 en `America/Santiago`.
  Mostrar la captura exitosa real como **Última comprobación: DD/MM/AAAA HH:MM**.
- Staging de costo cero y sin tarjeta bancaria; proveedor pendiente de validación.

Los registros de prueba de usuarios serán ficticios. Los productos y precios de la
demostración integrada deberán provenir de las fuentes web reales acordadas.
