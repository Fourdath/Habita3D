# Bloque 3: interfaz Angular y selección de pisos por habitación

Implementación y comprobación local en Windows: **25/10/2026**. Se conserva el inicio
rediseñado y el estudio 3D que abre primero la vista general; el recorrido interior
continúa siendo una acción explícita del usuario.

## Integración de las ramas

- Punto de partida de la interfaz: `bd7ba2d`.
- Respaldo de todo el frontend local: `c5e20ff`, en `feature/home-redesign`.
- Backend y datos del equipo: `origin/main` en `ce7a27d`, merge de la PR #6.
- Rama de trabajo: `codex/ep2-block3-integration`; merge local `0b2848b`.
- La combinación fue limpia. Los cambios remotos del frontend eran sus dependencias
  y la imagen Nginx; no reemplazaron los componentes del inicio o del visor.
- No se hizo push, force-push, merge remoto, tag, release ni cambios en GitHub Actions.

Esto distingue compatibilidad de Git de integración funcional: el frontend EP1 podía
combinarse sin conflictos, pero todavía no consumía el catálogo ni el presupuesto EP2.

## Recorrido implementado

1. Abrir **Mis proyectos** desde el inicio o el estudio (`/projects`). Registrarse
   o iniciar sesión con una cuenta ficticia. El token de usuario se conserva en
   `sessionStorage` de la pestaña; al recargar se comprueba con `/api/auth/me`.
   Las contraseñas no se guardan en el navegador y una respuesta 401 invalida la sesión.
2. Crear, listar, editar o eliminar proyectos propios y su presupuesto de pisos.
3. Añadir y editar varias habitaciones: área directa o largo/ancho, margen inicialmente
   10 %, límite opcional y vínculo a un recinto del modelo. Cambiar de modalidad envía
   únicamente las magnitudes nuevas. No se permite vincular dos habitaciones al mismo
   recinto 3D dentro del proyecto.
4. Consultar el catálogo persistido. Solo se filtra por tipo de piso, tienda y rango
   de precio por m². Se muestran precio/unidad, cobertura, vendedor, fuente, foto,
   enlace, última comprobación y disponibilidad explícitamente desconocida si procede.
   Los precios decimales por m² conservan hasta dos decimales en pantalla.
5. Elegir un producto para una habitación: se guarda exclusivamente su `publicationKey`.
   Se vuelve a consultar el proyecto y su presupuesto. Angular no calcula cajas,
   desperdicio, costos ni excesos, ni guarda una copia del precio en la habitación.
6. Mostrar el total y el subtotal del backend, cajas y costos por habitación y excesos
   globales/individuales. `total_cost_clp: null` es **Pendiente**, nunca cero ni un
   resultado favorable. Se conserva el subtotal calculable cuando faltan elecciones.
7. Abrir **Ver historial de precios**: tabla paginada con observación inicial y cambios
   guardados, fecha, precio, unidad y cobertura. No se extrapolan precios pasados ni
   se presupone que dos envases distintos sean comparables.
8. Abrir **Ver proyecto en 3D**. La URL incluye proyecto y habitación; al recargar se
   recuperan de NestJS las selecciones. El motor relaciona `sceneRoomId` con los meshes
   `room-floor` y aplica una apariencia de cerámica o laminado solo a esos suelos.
   Los muros/cielos y la selección de otras habitaciones no se sustituyen.

El estudio muestra la fotografía y los datos comerciales de la habitación elegida.
La textura es **orientativa por categoría**, no una reproducción del SKU. Cambiar
el estilo visual conserva los pisos seleccionados. En modo proyecto se oculta el
presupuesto demostrativo EP1 para evitar mezclarlo con los datos reales.

## Estados y límites

- Catálogo vacío, carga, error de red, fotografía ausente, cobertura desconocida,
  habitación sin piso, presupuesto parcial y límites excedidos tienen estados propios.
- `/materials/status` aporta `latestJob` y los intentos por grupo: una captura fallida
  avisa sin adelantar las fechas de las publicaciones retenidas. Un fallo al consultar
  el estado se distingue de una comprobación de precios exitosa.
- Catálogo, historial, proyectos y presupuesto usan NestJS por `/api`. La interfaz
  no llama a las tiendas ni contiene `MATERIALS_API_TOKEN`, ni ofrece captura/importación.
- EP2 vincula las habitaciones al **plano de ejemplo**. El contrato actual no almacena
  archivos de planos por proyecto. La carga SVG libre sigue disponible en la demo;
  se desactiva en modo proyecto para no aplicar vínculos guardados a otra geometría.
- La sesión dura lo indicado por el backend y persiste al recargar la misma pestaña;
  al cerrar sesión se revoca su token y se limpia el estado privado de la interfaz.
- La estimación pública EP1 se conserva claramente rotulada como ejemplo. Sus
  cifras no proceden de tiendas y sus proyectos no pasan a pertenecer a una cuenta EP2.
- Se mantiene la limitación previa de primera persona: requiere teclado/mouse y que
  el navegador permita Pointer Lock. El estudio orbital funciona sin capturar el mouse.

## Validación realizada

- Angular: lint correcto, 170 pruebas correctas y build de producción correcto.
- Backend: lint/build correctos; 118 pruebas unitarias correctas; 33 pruebas HTTP
  correctas. Se omitieron las 6 pruebas que requieren una base **desechable** para no
  introducir fixtures en el catálogo de demostración.
- Python: Ruff correcto y 281 pruebas correctas, con fixtures identificados y sin
  scraping en las pruebas automáticas.
- Auditorías npm: cero vulnerabilidades críticas en ambos árboles; pasa el umbral
  crítico utilizado por CI. Siguen figurando 13 hallazgos altos en cada árbol de
  dependencias, además de moderados/bajos. Los manifests y lockfiles son los de
  `main`, sin dependencias nuevas en esta integración. No se presenta esto como una
  auditoría de seguridad completa ni se ocultan esos hallazgos.
- Docker Compose: las cuatro imágenes se construyeron y los cuatro servicios
  alcanzaron `healthy`. `scripts/ep2-smoke.py` sin flags de fixtures confirmó frontend,
  PostgreSQL, FastAPI, contrato de catálogo y estado de capturas por `/api`.
- Se hizo un `pg_dump -Fc` antes de migrar la base local; el respaldo está fuera de
  Git en `.local/ep2-integration/before-ep2.dump`. Se conservaron contraseña y volumen
  PostgreSQL. Se añadió una credencial interna local nueva, sin imprimirla ni versionarla.
- Con autorización del usuario se creó una cuenta ficticia y un proyecto con dos
  habitaciones, una por área directa y otra por dimensiones. La captura protegida
  se limitó a **una publicación por combinación**, cuatro en total. Las cuatro
  combinaciones Sodimac/Easy y cerámica/laminado terminaron `complete`.
- Ejecución real: `5e3c76c1-dba2-4f74-b599-e77a1e1a936b`. Se importaron cuatro
  publicaciones reales, sin fixtures, con el programador **desactivado**.
- En el navegador se verificaron filtros combinados, historial inicial real, guardado
  independiente, total parcial al dejar una habitación sin elección, límites excedidos,
  recuperación al recargar y apariencia distinta por suelo en la vista superior.
- En ese ensayo el living devolvió 6 cajas y $103.722; el dormitorio, 7 cajas y
  $157.087; total $260.809. Son resultados de las publicaciones comprobadas en esa
  ejecución, no precios prometidos para fechas posteriores.
- Los cambios de precio y la conservación de elecciones ante respuestas revisadas
  se prueban de forma aislada. No se alteró un precio real de PostgreSQL para simular
  un cambio ni se hizo una segunda captura que excediera la autorización.

## Repetir la comprobación

Con Docker Desktop en modo Linux y las credenciales locales configuradas:

```powershell
./scripts/start-local.ps1
./scripts/verify-local.ps1
# http://127.0.0.1:8080/projects
```

Crear una cuenta ficticia propia, un proyecto y habitaciones; elegir pisos del
catálogo y abrir el visor. Recargar la página y comprobar la habitación seleccionada.
En un clon nuevo el catálogo puede estar vacío: seguir el manual del bloque 2 para
la primera captura protegida. No usar `--disposable-fixtures` en esta demo.

## Pendientes del cierre del equipo

No se configura el runner, el environment de despliegue, Variables/Secrets,
protección de `main`, Figma, tablero ni tag/release desde esta integración.
Su preparación y la CI remota posterior al push siguen siendo comprobaciones del
equipo. Tampoco se da por terminado el diseño de la futura adaptación inteligente.
La prueba manual en este Windows no acredita el primer despliegue automático CD.
