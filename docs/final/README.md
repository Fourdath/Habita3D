# Entrega final de Habita3D

La entrega integra el visor SVG a 3D, el catálogo de pisos, el presupuesto y
las sugerencias por habitación en navegador, PWA y Android. Los resultados de
GitHub Actions y los ensayos en Windows se registran con su propia versión.
La [guía de cierre en Windows](cierre-windows.md) reúne las comprobaciones que
faltan para publicar la versión evaluable.

| Documento | Contenido |
| --- | --- |
| [Contrato vigente v1](contrato-sugerencias-v1.md) | Entradas, estados, ejemplos y confirmación con `quoteId`. |
| [Arquitectura](../architecture/overview.md) y [decisión adaptativa](../adr/0004-recomendaciones-adaptativas.md) | Límites entre servicios, cálculo por cajas, saldo y consistencia de la selección. |
| [Modelo de datos](../architecture/data-model.md) | Proyectos, planos, habitaciones, preferencias, capturas y migraciones. |
| [Operación en Windows](operacion-windows.md) | Despliegue, verificación, diagnóstico y recuperación. |
| [PWA y Android](plataformas-windows.md) | Instalación, funcionamiento parcial sin red y pruebas en emulador. |
| [Seguridad y datos de la demo](seguridad-y-datos.md) | Permisos, amenazas, privacidad y revisión de dependencias. |
| [Evidencias](evidencias-windows.md) | Pruebas locales, integración automatizada, captura real y comparación de sugerencias. |

## Documentación de la API

En el staging local, Swagger está en `/api/docs` y su OpenAPI general en
`/api/docs-json`. El JSON `/api/projects/suggestions/openapi.json` describe
el contrato de sugerencias. Angular envía la sesión a NestJS y el servicio
Python recibe una credencial interna para el procesamiento especializado.

## Retroalimentación de EP1

| Observación docente | Implementación y evidencia |
| --- | --- |
| Justificar la arquitectura. | [Arquitectura](../architecture/overview.md), [persistencia de EP2](../adr/0003-persistencia-y-actualizacion-ep2.md) y [ADR vigente de sugerencias](../adr/0004-recomendaciones-adaptativas.md). |
| Separar CI y CD. | [CI](../../.github/workflows/ci.yml) prueba cambios y valida Terraform. [CD](../../.github/workflows/deploy-local.yml) comprueba la CI de `main`, despliega la SHA aprobada y verifica la aplicación en Windows. [Comprobación de cierre](cierre-windows.md). |
| Profundizar lo implementado en Python. | [Datos y normalización](../ep2/bloque-1-datos.md), [cálculo decimal de cajas](../../python-service/app/services/floor_budget.py) y [recomendación](../../python-service/app/api/recommendations.py). Las pruebas cubren ranking, permisos, presupuesto, cambio de precio y pérdida del servicio. |

La [validación del bloque 1](validacion-bloque-1.md) conserva los resultados
anteriores a la integración con la interfaz. El [README del proyecto](../../README.md)
registra el alcance, los aportes y el estado de la versión evaluable.
