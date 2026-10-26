# Entrega Parcial 2: planificación y acuerdos

Actualizado el 25/10/2026.

Esta carpeta registra el alcance definido para la EP2 y el trabajo por ejecutar.
El bloque 1 de datos/FastAPI está implementado y tiene un
[manual de ejecución y contratos](bloque-1-datos.md). El bloque 2 está implementado y probado localmente; véase su [manual](bloque-2-backend.md). El [bloque 3](bloque-3-interfaz.md) integra Angular y los suelos por habitación, con un ensayo manual en Windows. La instalación del runner y el primer despliegue automático siguen pendientes; no se acredita el cumplimiento completo de EP2.

| Documento | Contenido |
| --- | --- |
| [Acuerdos](acuerdos.md) | Decisiones funcionales, restricciones y registro de la ronda de definición. |
| [Plan de trabajo](plan-de-trabajo.md) | Tres bloques para el equipo, contratos, dependencias, backlog y criterios de aceptación. |
| [Fuentes web](fuentes-web.md) | Pruebas de muestra de Sodimac/Easy, ubicación, JSON, paginación y limitaciones verificadas. |
| [Opciones de staging](staging.md) | Candidatas de alojamiento gratuito sin tarjeta y verificaciones pendientes. |
| [Bloque 1: datos y FastAPI](bloque-1-datos.md) | Ejecución en Windows, capturas, contratos, presupuestos, métricas y pruebas. |
| [Bloque 2: backend](bloque-2-backend.md) | Catálogo, persistencia, proyectos, habitaciones, presupuestos y APIs para Angular. |
| [Bloque 2: staging](bloque-2-staging.md) | Docker/Terraform, seguridad de CI/CD y preparación del runner Windows. |
| [Bloque 3: interfaz](bloque-3-interfaz.md) | Sesión, proyectos, catálogo, presupuesto y suelos por habitación; integración de ramas y pruebas en Windows. |
| [Diseño adaptativo](diseno-adaptativo.md) | Especificación preliminar del recomendador de pisos por habitación (entregable 8): entradas, reglas, explicación, control y evaluación. |
| [Validación bloque 2](evidencias/bloque-2-validacion.md) | Resultados verificados y validaciones externas pendientes. |
| [Acceso Sodimac](sodimac-acceso.md) | Categorías, procedencia, condiciones y límites del adaptador. |
| [Acceso Easy](easy-acceso.md) | Contexto geográfico público, extracción HTML/JSON y límites del adaptador. |

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
- Demo prevista en un computador Windows del equipo, sin costo ni tarjeta;
  integración manual probada en Windows; runner y primer despliegue automático pendientes.

Los registros de prueba de usuarios serán ficticios. Los productos y precios de la
demostración integrada deberán provenir de las fuentes web reales acordadas.
