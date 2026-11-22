# Evidencia local del Bloque 2

Comprobaciones del 22 de noviembre de 2026 en Windows. Rama `codex/final-block-2-windows` basada en `d4b1ebc`. La instalación Compose de prueba quedó en `http://127.0.0.1:18080` con identidad `local-final-windows-check`, volúmenes propios y la captura programada deshabilitada.

| Punto | Comprobación | Pendiente para el cierre |
| --- | --- | --- |
| B2.1 Contrato | Contrato v1 versionado, con campos, rutas, errores y ejemplos. | Revisión con Cris y alineación con OpenAPI real. |
| B2.2 Sugerencias y preferencias | Chrome en escritorio y a 390 × 844 con respuestas del contrato. Pasaron las tarjetas, preferencias, saldo provisional, exceso y vigencia. Chrome con la API actual pasó el catálogo y su aviso de disponibilidad desconocida. | Repetir con el recomendador de Cris. |
| B2.3 Acciones y estados | Con respuestas sintéticas pasaron descarte por habitación, reemplazo, cambio de costo de $80.000 a $85.000, confirmación, desactivación y recuperación de un 503. | Verificar persistencia de preferencias y confirmación de precio mediante la API integrada. |
| B2.4 Visor | Chrome pasó SVG propio de un recinto → proyecto con nueve recintos y piso en el recinto vinculado → SVG libre → recarga con el plano de ejemplo. Tanto el perfil táctil Pixel 7 como el emulador Android giraron, avanzaron y volvieron a la vista general. Android también pasó la rotación a horizontal. | Repetir en la SHA de staging. |
| B2.5 Sesión y navegación | Chrome pasó acceso privado, registro ficticio, apertura de proyecto, visor, retorno y redirección con el proyecto seleccionado tras revocar la sesión. | Repetir el recorrido de la demo en la SHA de staging. |
| B2.6 PWA | Chrome instaló e inició la app en modo independiente. Sin red abrió el inicio y el visor de ejemplo, y avisó al consultar proyectos. Tras reconectar y reintentar recuperó el mismo proyecto. Un build de prueba verificó el aviso de actualización y la recarga. | Repetir en la SHA de staging. |
| B2.7 Android | APK de depuración compilado e instalado en el AVD `Habita3D_API_36`. Pasaron el acceso a la API por Capacitor, el registro, proyecto, habitación, selección y persistencia, presupuesto de cinco cajas por $85.405 y visor. El estado de sugerencias sin API quedó visible y el catálogo siguió disponible. | Repetir el recorrido de sugerencias con la API integrada. |
| B2.8 Staging | Docker Desktop en modo Linux. Compose local pasó readiness. Tras agregar el checksum del proveedor para `windows_amd64`, Terraform creó 13 recursos aislados y pasó readiness en el puerto 18081. La captura en Compose obtuvo ocho publicaciones reales. | Habilitar y ejecutar el CD con Fourdath para la SHA integrada. |
| B2.9 Recuperación | El respaldo se restauró en la base separada `habita3d_restore_1795336277718`. Coincidieron tres proyectos, tres habitaciones, tres selecciones y ocho publicaciones. Al detener Python la API de presupuesto respondió `503` y conservó el piso. Después de iniciarlo, readiness volvió a `ok` y el presupuesto volvió a $102.486. El rollback local del frontend a `1e03267` en el puerto temporal 18082 también conservó las ocho publicaciones y pasó readiness. | Ensayo coordinado de rollback por CD y comprobación de recuperación del recomendador integrado. |
| B2.10 Manuales | Manuales de operación, plataformas y evidencias locales disponibles. | Incorporar Figma y evidencias del commit de staging cuando el equipo los confirme. |

## Datos reales y recorrido de navegador

La captura `66aa611a-29a9-4b5c-9717-ad906937571d` terminó con estado `complete` y ocho altas. El límite fue de dos publicaciones por combinación de tienda y categoría. La prueba de Chrome guardó la cerámica «Cerámica 46x46 cm Mixtura roble Café 1.9 m2» desde el catálogo. El presupuesto de FastAPI calculó siete cajas y la habitación conservó el piso al recargar, abrir el visor y regresar al proyecto.

Archivos locales excluidos de Git

- `.local/final-check/browser-result.json`, `navegador-proyecto.png` y `navegador-visor.png`.
- `.local/final-check/live-capture.json`, `recovery-result.json` y `rollback-result.json`.
- `.local/final-check/viewer/` con las cuatro capturas de cambio de plano y recorrido táctil en Chrome.
- `.local/platform/evidence/` con las capturas de instalación, visor sin conexión y actualización de la PWA.
- `frontend/android/app/build/outputs/apk/debug/app-debug.apk`, SHA-256 `3a74bd180f12ddf5ae3211bcfdeaab901d2315dd9690de98b240006b6b82abe55`.
- `.local/platform/evidence/` con el presupuesto, el estado de sugerencias, el visor del proyecto, el recorrido táctil y el visor en horizontal en Android.

## GitHub Actions y dependencias

GitHub informa CI exitosa y CD omitido para la misma SHA de `main`, `d4b1ebc0fe4140a5eef692680dab0b1a578ff421`. La ejecución privada del runner Windows depende de la configuración del equipo. [CI de la base](https://github.com/Fourdath/Habita3D/actions/runs/40255408830) · [CD omitido](https://github.com/Fourdath/Habita3D/actions/runs/40255636311)

Pasaron las 185 pruebas de Angular, lint y build de producción. La auditoría npm de producción reportó cero hallazgos críticos, tres altos y cinco moderados. El build de producción generó el frontend con avisos de presupuesto CSS y versiones de navegador.
