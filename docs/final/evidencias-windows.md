# Evidencia local del Bloque 2

Comprobaciones del 22 de noviembre de 2026 en Windows. La demo Compose está en `http://127.0.0.1:18080` con el catálogo real guardado y la captura programada deshabilitada. El código del ensayo de Terraform y la demo corresponde a `57c423252fcaf6ca914719e01533478e371de89c`.

| Punto | Comprobación | Pendiente para el cierre |
| --- | --- | --- |
| B2.1 Contrato | Contrato v1 versionado y OpenAPI 3.0.3 publicado en `/api/projects/suggestions/openapi.json`. | Revisarlo con Cris. |
| B2.2 Sugerencias y preferencias | Chrome, PWA y Android mostraron recomendaciones del catálogo guardado, recalcularon al cambiar preferencias, guardaron el piso y recuperaron la selección al recargar. | Repetir en staging tras el CD del equipo. |
| B2.3 Acciones y estados | El smoke integrado comprobó aislamiento por cuenta, saldo provisional, exceso, descarte por habitación, desactivación y reconfirmación de $60.000 a $63.000. | Repetir el recorrido acordado en staging. |
| B2.4 Visor | Chrome comprobó SVG propio, apertura del plano de proyecto con el piso aplicado al recinto y vuelta al visor libre. En Android pasaron el recorrido táctil, vista general y rotación. También se probaron los estilos Mediterráneo y Contemporáneo y la vista Planchas. | Repetir en staging. |
| B2.5 Sesión y navegación | Chrome comprobó acceso privado, registro ficticio, visor, retorno y redirección al revocar la sesión. | Repetir en staging. |
| B2.6 PWA | Chrome instaló la PWA en modo independiente. Sin red abrió inicio y visor de ejemplo. Al reconectar y reintentar recuperó el proyecto y su piso. Un build anterior verificó el aviso de actualización y su recarga. | Repetir en staging. |
| B2.7 Android | APK de depuración instalado en `Habita3D_API_36`. Accedió a la API de Windows y guardó un laminado de Easy, seis cajas por $201.456. Mantuvo la selección después de recargar. | Repetir en el mismo staging utilizado para la entrega. |
| B2.8 Staging | Terraform creó 13 recursos aislados en Docker Desktop. En el puerto 18083 la aplicación informó la SHA esperada y readiness de 16 ms con dos publicaciones sintéticas. La demo del puerto 18080 informó la misma SHA, readiness de 26 ms y ocho publicaciones reales. | Fourdath habilita el runner y el entorno en GitHub. Guardar enlaces de CI/CD y la captura acotada sobre el staging final. |
| B2.9 Recuperación | Se restauró un respaldo con un proyecto, un recinto, un piso y dos publicaciones en PostgreSQL aislado. Ante la caída de Python, las sugerencias devolvieron 503 y el piso siguió guardado. Al recuperarse, volvieron dos sugerencias y un presupuesto de $78.000. La reversión de las imágenes de la aplicación a `1e03267` conservó PostgreSQL, el catálogo, el piso y el importe. Al volver a `57c4232`, las sugerencias se recuperaron. | Coordinar el ensayo de rollback por CD con el equipo. |
| B2.10 Manuales | Manuales de operación, plataformas y evidencias locales disponibles. | Incorporar Figma si está disponible y evidencias del staging compartido. |

## Datos reales y recorrido de navegador

La captura `66aa611a-29a9-4b5c-9717-ad906937571d` terminó con estado `complete` y ocho altas. El límite fue de dos publicaciones por combinación de tienda y categoría. La prueba de Chrome guardó la cerámica «Cerámica 46x46 cm Mixtura roble Café 1.9 m2» desde el catálogo. El presupuesto de FastAPI calculó siete cajas y la habitación conservó el piso al recargar, abrir el visor y regresar al proyecto.

Con la misma captura, una habitación de 12 m², 10 % de margen y $450.000 disponibles, el orden cambió al variar las preferencias declaradas. El estado de las capturas se mantuvo durante las tres consultas.

| Preferencia | Primera sugerencia | Cajas | Total CLP |
| --- | --- | ---: | ---: |
| Sin preferencias | Cerámica California gris, Easy | 5 | $66.865 |
| Cerámica y Sodimac | Cerámica Madera Jona Café, Sodimac | 6 | $82.302 |
| Laminado y Easy | Piso flotante Farco Elegance roble, Easy | 6 | $201.456 |

Archivos locales excluidos de Git

- `.local/final-check/browser-result.json`, `navegador-proyecto.png` y `navegador-visor.png`.
- `.local/final-check/live-capture.json`, `recovery-result.json` y `rollback-result.json`.
- `.local/final-check/viewer/` con las cuatro capturas de cambio de plano y recorrido táctil en Chrome.
- `.local/platform/evidence/` con las capturas de instalación, visor sin conexión y actualización de la PWA.
- `frontend/android/app/build/outputs/apk/debug/app-debug.apk`, SHA-256 `8d3401af0e2c180fae208759e36d0dc981ae4122a8e902b821269a97bcf4bc01`.
- `.local/platform/evidence/` con el presupuesto, el estado de sugerencias, el visor del proyecto, el recorrido táctil y el visor en horizontal en Android.
- `.local/final-adaptive/` con capturas de sugerencias en Chrome, PWA y Android, comparación del catálogo, disponibilidad de la demo, restauración y recuperación del servicio.

## GitHub Actions y dependencias

GitHub informa CI exitosa y CD omitido para la misma SHA de `main`, `d4b1ebc0fe4140a5eef692680dab0b1a578ff421`. La ejecución privada del runner Windows depende de la configuración del equipo. [CI de la base](https://github.com/Fourdath/Habita3D/actions/runs/40255408830) · [CD omitido](https://github.com/Fourdath/Habita3D/actions/runs/40255636311)

Pasaron 201 pruebas de Angular y su lint, 125 unitarias de NestJS, 46 E2E con PostgreSQL y 287 pruebas de Python. Los contenedores de producción se construyeron en Windows. FastAPI rechazó credenciales internas ausentes e inválidas con 401, y NestJS devolvió 429 con `Retry-After` tras 12 intentos fallidos de login. La primera ejecución de Angular coincidió con el arranque del emulador y excedió el tiempo de una prueba del visor. La repetición con la configuración de CI pasó las 201 pruebas.
