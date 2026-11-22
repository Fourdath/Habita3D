# Entrega final de Habita3D

El bloque 1 implementa el recomendador por habitación, sus APIs, preferencias
persistentes y las comprobaciones de seguridad, datos y despliegue. La interfaz
de las sugerencias, la PWA, Android y la demo en Windows se integran en el bloque 2.

| Documento | Contenido |
| --- | --- |
| [Contrato para Angular](contrato-sugerencias.md) | Propuesta implementada, con ejemplos para revisar entre ambos bloques. |
| [Decisión de arquitectura](../adr/0004-sugerencias-por-habitacion.md) | Alcance, reglas, presupuesto parcial, consistencia y alternativas. |
| [Modelo de datos](../architecture/data-model.md) | Proyectos, habitaciones, preferencias, capturas y migraciones. |
| [Operación del bloque 1](operacion-bloque-1.md) | Comprobaciones después del despliegue, diagnóstico y recuperación. |
| [Seguridad y datos de la demo](seguridad-y-datos.md) | Permisos, amenazas, privacidad y revisión de dependencias. |
| [Validación del bloque 1](validacion-bloque-1.md) | Resultados locales, evaluación reproducible y controles pendientes en staging Windows. |

## Qué se entrega al bloque 2

1. Los endpoints NestJS con la migración aditiva. Los proyectos existentes
   reciben sugerencias habilitadas y preferencias vacías.
2. OpenAPI en /api/docs-json y Swagger en /api/docs. La API pública Angular
   sigue entrando por NestJS. Los endpoints de procesamiento de FastAPI usan
   la credencial interna que ya comparten los contenedores.
3. Respuestas de ejemplo de sugerencias y confirmación de costos. Al integrar
   la pantalla, revisar el [contrato](contrato-sugerencias.md) entre ambos
   responsables.
4. Prueba de integración con datos sintéticos y procedimiento para ensayar la
   comparación y los fallos sobre la versión de staging.

## Retroalimentación de EP1

| Observación docente | Implementación y evidencia |
| --- | --- |
| Justificar la arquitectura. | [Arquitectura](../architecture/overview.md), [persistencia de EP2](../adr/0003-persistencia-y-actualizacion-ep2.md) y [ADR de las sugerencias](../adr/0004-sugerencias-por-habitacion.md). |
| Separar CI y CD. | [CI](../../.github/workflows/ci.yml) prueba cambios y valida Terraform. [CD](../../.github/workflows/deploy-local.yml) despliega el commit de main aprobado y verifica la aplicación. El equipo debe ejecutar y registrar CD en su Windows. |
| Profundizar lo implementado en Python. | [Datos y normalización](../ep2/bloque-1-datos.md), [cálculo decimal de pisos](../../python-service/app/services/floor_budget.py), [reglas del recomendador](../../python-service/app/services/floor_recommendations.py) y pruebas automatizadas. |

El cierre en equipo vincula la versión evaluable con el staging Windows, la
demostración integrada, el prototipo, el tablero y los aportes de los integrantes.
