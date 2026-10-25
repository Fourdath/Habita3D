# Plan definitivo de trabajo para la Entrega Parcial 2 de Habita3D

Fecha de revisión: 24 de octubre de 2026.

Estado: **bloque 1 de datos/FastAPI implementado**. El bloque 2 está implementado y probado localmente; el bloque 3 y el primer despliegue en el Windows del compañero siguen pendientes. Véanse el [manual de backend](bloque-2-backend.md), [staging](bloque-2-staging.md) y [evidencias](evidencias/bloque-2-validacion.md). El [manual del bloque 1](bloque-1-datos.md) registra los contratos, la ejecución y las limitaciones; las casillas siguientes distinguen avances verificados de integración pendiente. Esto no certifica toda la EP2.

## Alcance acordado

Actualización del 18 de octubre de 2026, posterior a la investigación de fuentes:

- Fuentes elegidas por el equipo: Sodimac y Easy. El bloque 1 incluye adaptadores de ambas categorías, revisión de robots y documentación de condiciones; no se afirma una API contractual ni una licencia de reutilización para terceros. Véanse [Sodimac](sodimac-acceso.md) y [Easy](easy-acceso.md).
- Ubicación de referencia: La Florida, Región Metropolitana, Santiago. La selección de una sucursal específica de retiro requiere una definición adicional si se incluye ese alcance.
- Alcance funcional acordado en la ronda de preguntas: pisos de **cerámica y piso flotante laminado**, con cálculo del costo de compra del piso según superficie y cobertura. No se incluyen vinílicos/SPC, insumos de instalación ni mano de obra en EP2. Se aplicará un **10 % inicial de material adicional, editable por habitación**, para cortes/desperdicios. La extracción de ambas categorías se validó en el bloque 1.
- Cobertura acordada: **hasta 10 publicaciones por categoría y tienda**, máximo **40 publicaciones** entre las dos categorías y las dos fuentes. Registrar conteos reales y evitar duplicados; no inventar productos para completar la muestra.
- Comprobaciones programadas: **08:00, 12:00 y 16:00**, en hora de Chile (`America/Santiago`), mediante tres procesos de actualización con solicitudes limitadas/espaciadas por tienda. Mostrar **“Última comprobación: DD/MM/AAAA HH:MM”** usando la captura exitosa real de cada publicación. Consultar la aplicación no dispara una nueva extracción de precios. El mecanismo de programación debe validarse con el alojamiento gratuito sin tarjeta. El presupuesto usará siempre los últimos precios comprobados disponibles, conservando habitaciones y pisos elegidos; el usuario descartó versiones históricas de presupuestos. Se aprueba **“Ver historial de precios”** por publicación como opción informativa adicional, con tabla/gráfico de valores observados y fechas.
- Cada proyecto incluirá **varias habitaciones**, cada una con sus propios metros cuadrados y selección de piso. La superficie podrá ingresarse directamente en m² o calcularse a partir del largo y ancho. Se definirá **un presupuesto total por proyecto y límites opcionales por habitación**. El modelo de datos, los contratos, los cálculos y la interfaz deben contemplar ese alcance.
- Filtros del catálogo para EP2: **tipo de piso, tienda y precio por m²**. Los filtros por marca, color y formato se posponen. El precio por m² requiere una unidad/cobertura verificable; no inventarlo cuando falte información.
- Se incluirá **previsualización 3D orientativa del piso elegido por habitación**, reutilizando el visor existente y vinculando cada producto con una apariencia representativa. Indicar cuando la apariencia sea aproximada; mostrar fotografía, datos y precio reales del producto seleccionado. No se exige reproducción exacta de cada SKU dentro de este alcance acordado.
- Retroalimentación EP1: el usuario confirma que el profesor no entregó comentarios ni correcciones. Registrar este contexto y resolver los pendientes técnicos verificados, sin atribuir al docente observaciones que no realizó.
- Diseño/prototipo: tras indicar que existe y requiere actualización, el usuario aclaró que el integrante encargado solo compartió el código y la información del repositorio; no dispone de un enlace de prototipo. Usar esas pantallas como referencia actual. El usuario pedirá detalles en una reunión posterior; dejar la actualización y el enlace del prototipo como tareas, sin bloquear la planificación ni asumir un Figma accesible.
- Flujo aceptado: extracción Python de los JSON del frontend de las tiendas → validación y procesamiento mediante FastAPI → integración con NestJS → persistencia en PostgreSQL → consulta y visualización Angular.
- Se verificó paginación mediante `page` en ambas fuentes. No se ha confirmado una opción `full`.
- Las consultas de muestra no requirieron contratar una API ni pagar por acceso. Staging debe ser **completamente gratuito y sin tarjeta bancaria**. La opción actual prevista es el computador Windows de un integrante para la demo en clase; se validará la ejecución integral al implementar el bloque 2. La demo usará cuentas ficticias y materiales/precios reales.

## Especificación para implementar

### Contratos comunes y responsabilidades

El primer cambio compartido debe fijar esquemas, endpoints, errores y ejemplos JSON versionados, junto con el modelo de datos. Los nombres exactos de rutas y entidades se concretarán en ese cambio técnico; no requieren otra ronda de preguntas de alcance.

| Contrato | Contenido mínimo |
| --- | --- |
| Publicación normalizada | Fuente, identificadores de producto/SKU, vendedor, categoría, nombre, marca si existe, URLs de producto e imagen, moneda CLP, precio público por envase, unidad, cobertura, precio por m² comparable, disponibilidad conocida/desconocida, contexto La Florida y captura exitosa. Promociones condicionadas separadas. |
| Captura | ID de ejecución, franja prevista, inicio/fin, estado por fuente, resultados aceptados/rechazados, duplicados y errores. Repetir la misma captura no duplica productos ni historial. |
| Proyecto/habitación | Propietario, nombre, presupuesto total, habitaciones, modalidad de superficie, m² o largo/ancho, margen adicional, límite presupuestario opcional, publicación elegida y vínculo con la habitación del visor cuando exista. |
| Resultado de presupuesto | Cajas/envases necesarios, costo por habitación y total, diferencias con los límites y fecha de los precios utilizados. Utilizar siempre los últimos precios comprobados disponibles; no crear versiones históricas de presupuesto. |
| Historial de precios | Publicación, precio y tipo comparable, fecha de observación inicial/cambio. La comprobación sin cambio renueva la fecha de verificación, no crea una variación ficticia. |

FastAPI concentra la adquisición y el procesamiento útil: validación, normalización y cálculo compartido de cantidades/costos. NestJS coordina las operaciones, valida el contrato y administra PostgreSQL. Angular consulta NestJS; no obtiene precios directamente de las tiendas ni mantiene una segunda implementación independiente del cálculo.

### Reglas de cálculo y vigencia

- Superficie: m² positivos ingresados directamente, o largo × ancho en metros. Validar la modalidad elegida.
- Superficie de compra = superficie × (1 + margen/100). Margen inicial: 10 %, editable por habitación.
- Cajas/envases = redondeo hacia arriba de superficie de compra / cobertura por envase. Costo = envases × precio vigente por envase. Usar cálculos decimales controlados y probar bordes de redondeo.
- Total del proyecto = suma de los costos de sus habitaciones. Mostrar excesos respecto del presupuesto global y límites opcionales; conservar las elecciones del usuario.
- Cuando falta cobertura o precio válido, marcar que no puede calcularse el costo de ese producto; no completar datos con estimaciones presentadas como reales.
- Al consultar/recalcular, usar una lectura coherente de los últimos precios guardados. Las selecciones, superficies y márgenes persisten; los precios se actualizan con las capturas.
- La previsualización es orientativa. Vincular cada selección con el suelo de su habitación; si solo se conoce el área, no afirmar dimensiones reales inferidas para el dibujo.

### Política de extracción y fallos

- Mantener una muestra identificada de hasta diez publicaciones por categoría y tienda. No sustituirla íntegramente en cada captura: el historial debe seguir publicaciones estables.
- Ejecutar las tres franjas en `America/Santiago`, con registro del horario previsto y la captura real. El programador gratuito puede retrasarse; no prometer inicio exacto ni mostrar una comprobación que no ocurrió.
- Limitar solicitudes por fuente y espaciarlas inicialmente al menos cinco segundos, ajustando a las restricciones verificadas. Tres ejecuciones no equivalen a tres peticiones HTTP totales ni garantizan ausencia de bloqueos.
- Evitar trabajos superpuestos y reintentos ilimitados; respetar `Retry-After` ante 429 y detener/revisar bloqueos persistentes.
- Persistir resultados válidos por fuente aunque otra falle, con estado parcial explícito. Un fallo no convierte el precio en cero, no elimina la selección y no avanza la fecha de comprobación del registro fallido.
- Una retirada/no disponibilidad debe basarse en evidencia explícita; no deducirla de una caída temporal ni confundir disponibilidad desconocida con ausencia de stock.
- El botón de historial y la navegación consultan la base propia. Una ejecución manual protegida para demo utiliza los mismos límites y exclusión que la programación.

### Diseño preliminar de adaptación futura

Documentar una propuesta de reglas para ordenar alternativas por habitación usando presupuesto, superficie, tipo de piso preferido, datos publicados de uso y disponibilidad conocida. La decisión futura debe explicar el ajuste al presupuesto y la cantidad/costo considerados, y permitir que el usuario acepte, cambie o rechace la sugerencia. Evaluar después su utilidad y la comprensión de la explicación. Para EP2 se entrega esta especificación; el motor adaptativo completo queda para una etapa posterior.

## Tres bloques para trabajar en paralelo

La asignación se expresa como Integrante 1/2/3 para que el equipo distribuya responsables. Se conserva la división por datos, backend e interfaz, y se explicita el dueño de infraestructura para que esa tarea no quede sin responsable.

| Bloque | Responsable principal | Entregables |
| --- | --- | --- |
| **1. Datos y Python/FastAPI** | Integrante 1 | Adaptadores de las dos fuentes/categorías, normalización, cálculos compartidos, manejo de errores, capturas, métricas de calidad y pruebas Python. Colabora en la ejecución programada y documenta acceso/procedencia. |
| **2. Backend, persistencia e infraestructura** | Integrante 2 | Prisma/migraciones, NestJS, importación idempotente, catálogo/filtros/historial, proyectos y habitaciones; coordinación de Terraform, CI/CD, staging, variables/secrets y salud del despliegue. |
| **3. Angular y experiencia 3D** | Integrante 3, idealmente quien ya trabaja en el visor | Pantallas/prototipo, catálogo y tres filtros, habitaciones y presupuestos, selecciones, vista 3D orientativa, historial y comprobación; pruebas del recorrido y demo. |

**Actualización 24/10/2026:** bloques 1 y 2 implementados; interfaz bloque 3 pendiente. Runner Windows por instalar según confirmación del equipo. Las pruebas locales no sustituyen esa validación externa.

Cada integrante mantiene las pruebas, Dockerfile, documentación, controles de seguridad y logs de su componente. Bloque 2 coordina CI/despliegue y la verificación final; bloque 1 participa en cron y métricas; bloque 3 aporta los flujos de aceptación. Correlación de solicitudes e integración se acuerdan entre los tres. Esta distribución puede ajustarse dentro del equipo sin cambiar el alcance.

Para trabajar sin bloquearse, publicar primero los contratos y ejemplos: Angular usa datos de desarrollo identificados como ficticios; NestJS implementa las consultas; Python entrega el formato acordado. La aceptación final exige sustituir esas muestras por datos web reales integrados.

Ramas separadas por bloque, PR pequeños y pruebas por componente; conservar autoría personal de commits y revisión entre integrantes. La ejecución en vivo de las fuentes se separa de los tests deterministas de PR, evitando extracciones innecesarias en cada cambio.

## Hitos y dependencias

1. **Preparación:** sincronizar y revisar el estado real del repositorio antes de editar; fijar contratos/modelo; validar acceso de las fuentes y el registro gratuito sin tarjeta. Actualizar arquitectura y backlog.
2. **Avance paralelo:** adaptadores y FastAPI; modelo/API NestJS; pantallas y previsualización con contratos de desarrollo. Preparar infraestructura/CI desde el inicio.
3. **Primera integración:** una publicación real atraviesa Python → NestJS → PostgreSQL → Angular y participa en el costo de una habitación.
4. **Cobertura funcional:** ampliar a las cuatro combinaciones categoría/tienda, hasta cuarenta publicaciones; varias habitaciones, presupuestos, filtros, historial y previsualización.
5. **Entrega operativa:** desplegar automáticamente, verificar las tres franjas, salud, logs, métrica de tiempos y fallo controlado; calcular calidad de los datos.
6. **Cierre:** documentación, diseño adaptativo preliminar, prototipo/enlace cuando el compañero lo facilite, tablero, demo, participación y tag/release del commit desplegado.

El orden expresa dependencias entre tareas; no se fija un calendario de entrega en este documento.

### Staging: validación temprana

La opción prioritaria prevista es la demo local en el computador Windows del compañero. El bloque 1 puede ejecutarse desde PowerShell/Visual Studio Code; Figma sirve como referencia de diseño. Las alternativas cloud de [opciones de staging](staging.md) quedan como investigación opcional y no bloquean esta implementación.

Validar durante el bloque 2: persistencia, primer despliegue local, Terraform, acceso de las tiendas desde ese computador, conectividad para la demo y automatización. Para las capturas programadas el computador debe estar encendido y conectado; una franja perdida no se convierte en una captura ficticia.

Las respuestas y decisiones quedan registradas en [registro de acuerdos](acuerdos.md). El backlog cubre toda la pauta; los endpoints y la caché de evidencia del bloque 1 no sustituyen la integración NestJS/PostgreSQL/Angular. El progreso de Python se acredita con pruebas y [evidencia de captura](evidencias/bloque-1-calidad.json).

## Fuentes y alcance

- Pauta del proyecto: `ProyectoFinal (1).pdf`. Requisitos EP2: páginas 35–40. Rúbrica: páginas 50–51. Reglas generales aplicables: páginas 9–20 y 24–31.
- Material de clases: `2.1.pdf`. Se revisaron sus 80 páginas físicas. Incluye diapositivas repetidas; sus números internos no siempre coinciden con las páginas del archivo.
- Itinerario adjunto: recuperación de información y preparación de datos; API/feeds/datos abiertos; scraping estático y dinámico; uso responsable. Web Mining, Web Semántica, Laboratorio 2 y EP2 figuran en la semana del 19–24 de octubre. La imagen no fija una hora ni un día exacto de cierre.
- Repositorio: `Fourdath/Habita3D`. La revisión inicial se basó en `origin/main` `e21ab6033455162daea2b48c89ff1b65d54e9243`, merge de EP1; después se inspeccionó el visor del checkout local en `bd7ba2d`. Las brechas iniciales de abajo son una referencia histórica, no una nueva certificación del estado remoto; sincronizar y verificar antes de implementar.

Los PDF del curso se citan por nombre y páginas; no se incorporan en esta carpeta. La investigación técnica está en [fuentes web](fuentes-web.md).

Las técnicas y los nombres de tablas/endpoints sugeridos a continuación son propuestas de implementación. Los requisitos obligatorios proceden de la pauta, no de que una tecnología aparezca en una diapositiva.

## Resultado que debe demostrar EP2

Fuente web real → obtención automatizada → validación y procesamiento FastAPI → NestJS → PostgreSQL o índice → consulta desde NestJS → visualización Angular.

Además: staging funcional desplegado automáticamente, controles de calidad y seguridad, observabilidad inicial, una evaluación cuantitativa de los datos y especificación preliminar de la futura adaptación.

## Base existente y brechas de la revisión inicial

- Existe Angular/Ionic con visor 3D, formulario y configuración inicial de Capacitor; NestJS modular con autenticación básica; FastAPI; PostgreSQL; Docker Compose; CI y Terraform preliminar.
- FastAPI todavía calcula con `DEMO_TIERS` y responde `source: demo`. No hay adquisición web real.
- Prisma tiene `Project`, `User` y `Session`. No hay tablas implementadas para materiales, ofertas, procedencia ni capturas. El proyecto guarda el nombre, pero no superficie/presupuesto; la recomendación se devuelve sin persistir.
- El visor también usa catálogos y precios locales de demostración.
- El cliente NestJS–FastAPI ya valida respuestas, impone un timeout y devuelve errores controlados. Se puede extender.
- CI tiene pruebas, lint, auditoría de dependencias, Gitleaks, construcción, Compose y Terraform plan; faltan escaneo explícito de seguridad del código, escaneo de imágenes y despliegue persistente.
- Hay endpoints de salud, pero NestJS no comprueba PostgreSQL. No se encontraron logs estructurados/correlacionados ni métricas de respuesta implementadas.
- GitHub Actions devuelve 0 Variables y 0 Secrets configurados a nivel de repositorio. No hay tags ni releases.
- En la revisión inicial faltaba el enlace al prototipo y el README indicaba que la protección de main estaba pendiente. Revalidar ambos estados al implementar; el diseño disponible para esta planificación es el del repositorio.

## Criterios de evaluación

| Criterio | Peso | Entregable comprobable |
| --- | ---: | --- |
| Continuidad y correcciones EP1 | 5 % | Retroalimentación vinculada con tareas, cambios, pruebas, arquitectura y documentación actualizadas. |
| Fuente web, procedencia y uso responsable | 10 % | Fuente pertinente, método permitido y revisión documentada de uso, procedencia y actualización. |
| Recuperación, limpieza y calidad | 15 % | Adquisición automatizada, validación, normalización, deduplicación, actualización y fallos controlados. |
| Python e integración NestJS | 15 % | Procesamiento útil de datos reales, contratos, pruebas, validación, timeout y resiliencia. |
| Persistencia, indexación y consulta | 10 % | Datos externos guardados con procedencia y fechas, índices, claves únicas y relación con proyectos. |
| Evaluación de la información | 10 % | Al menos una métrica pertinente aplicada, resultados reproducibles y limitaciones explicadas. |
| Integración de extremo a extremo | 12 % | Flujo real completo visible al usuario, ejecutado en staging. |
| Diseño adaptativo/inteligente | 8 % | Especificación concreta de entradas, usuario, decisión, mecanismo, explicación, control y evaluación futura. |
| Pipeline, staging, seguridad y observabilidad | 10 % | Pruebas, análisis, despliegue automático, salud, logs correlacionados y tiempos de respuesta. |
| Documentación, trazabilidad y demostración | 5 % | README/APIs/datos/staging/métricas documentados y demo reproducible con participación del grupo. |

## Backlog de implementación

### A. Continuidad y decisiones iniciales

- [ ] **EP2-01 — Registrar la continuidad y correcciones EP1.** El usuario confirma que no recibieron retroalimentación docente. Dejar constancia y relacionar los pendientes técnicos verificados con tareas, responsables y evidencias; incorporar comentarios del profesor si llegan posteriormente. No atribuir las observaciones de la revisión técnica al docente.
- [ ] **EP2-02 — Actualizar arquitectura y gestión.** Diagramas de flujo de datos y despliegue, modelo de datos y ADR para fuente, actualización y staging. Actualizar tablero/backlog y dejar claro qué está terminado, en progreso o postergado.
- [ ] **EP2-03 — Actualizar y enlazar los entregables formales.** El prototipo existente requiere actualización; recibir su enlace y adaptar las pantallas al alcance acordado. Registrar tablero y participantes, y corregir en README el estado de protección de main si continúa desactualizado. La versión EP2 se etiqueta al cierre con su propio tag o release.

Aceptación: existe una trazabilidad observación → tarea/cambio → prueba/documento, y los enlaces del equipo son verificables.

### B. Fuente de materiales y contrato de datos

- [x] **EP2-04 — Validar el alcance piloto acordado.** Sodimac y Easy ya fueron seleccionadas; se verificaron muestras de cerámicas en sus JSON. Se incluirán cerámicas para piso y piso flotante laminado, comenzando por productos vendidos directamente por cada tienda, hasta 10 publicaciones por categoría y tienda (máximo 40). Validado en el bloque 1: diez publicaciones por cada combinación, con precio por caja y cobertura verificable; véase la evidencia de calidad. La pauta no fija una cantidad mínima de tiendas, productos ni categorías. La revisión de condiciones de acceso corresponde a EP2-05.
- [ ] **EP2-05 — Documentar el acceso y las restricciones.** URL, cobertura, datos disponibles, método API/feed/datos abiertos/HTML/JSON-LD, límites, autenticación si aplica, términos/licencia, robots.txt cuando corresponda, privacidad, atribución y condiciones de reutilización. Verificar el acceso permitido antes de automatizarlo. No evadir restricciones.
- [ ] **EP2-06 — Fijar el contrato y la actualización.** Campos obligatorios/opcionales, unidades, moneda, disponibilidad y datos ausentes. Programar comprobaciones a las 08:00, 12:00 y 16:00 en `America/Santiago`, con límites por fuente y registro del resultado de cada ejecución. Mostrar la captura exitosa real en Última comprobación. Definir detección de cambios, tratamiento de datos antiguos/fallos y selección estable de la muestra. No inventar stock o características que no publique.

Aceptación: una fuente real proporciona una muestra utilizable con procedencia, y el equipo puede explicar por qué sus datos sirven para comparar terminaciones.

### C. Adquisición y procesamiento Python

- [x] **EP2-07 — Implementar adquisición automatizada.** Adaptador para el método elegido, paginación cuando aplique, límites de solicitudes y tiempo de espera. Preferir una API oficial adecuada cuando exista. Usar navegador automatizado solo si los datos realmente lo requieren.
- [x] **EP2-08 — Limpiar y validar.** Nombres, categorías, formatos numéricos, moneda, medidas y unidades; registros incompletos y precios inválidos. Conservar el dato original o evidencia permitida suficiente para explicar la transformación.
- [x] **EP2-09 — Normalizar costos comparables.** Distinguir caja, pieza, litro y m². Calcular precio por unidad comparable solo cuando exista cobertura/rendimiento verificable. Para un piso por habitación: superficie de compra = superficie × (1 + margen/100); cajas = techo(superficie de compra/cobertura por caja); costo = cajas × precio por caja. El margen inicial acordado es 10 %, editable por habitación. Marcar como no comparable el registro sin cobertura necesaria.
- [x] **EP2-10 — Deduplicar, actualizar y conservar historial.** Clave estable para una publicación, considerando fuente, identificador externo, vendedor y contexto. Repetición idempotente sin duplicar productos. No fusionar productos distintos solo por nombre. Conservar el precio inicial y los cambios de precio comparable con sus fechas; actualizar la última comprobación exitosa sin crear un cambio duplicado cuando el valor siga igual. Los presupuestos usan los últimos precios disponibles; el historial se consulta como información adicional.
- [x] **EP2-11 — Manejar fallos.** Timeout, reintentos limitados y seguros, fuente caída, datos inválidos o cambio de formato. Conservar la última captura válida si esa es la estrategia elegida y mostrar su fecha; no reemplazarla silenciosamente con precios ficticios.
- [x] **EP2-12 — Exponer el procesamiento en FastAPI.** Endpoints y modelos de entrada/salida documentados para procesar/normalizar información real. Python terminado: `/materials/*` y `/floors/budget` con procedencia real; el endpoint demostrativo EP1 se conserva compatible. La integración NestJS, validación de contratos y persistencia están implementadas en el bloque 2.

Aceptación: la aplicación inicia un proceso automático que obtiene y transforma información real; una segunda ejecución no duplica datos y una fuente caída produce un error comprensible o una respuesta degradada explícita.

### D. Modelo, persistencia y consultas NestJS

- [x] **EP2-13 — Extender el modelo Prisma y crear migraciones.** Entidades para fuentes/publicaciones/ofertas, historial de precios y ejecuciones; extender proyectos y añadir habitaciones con superficie o dimensiones, margen, presupuesto opcional y piso elegido. Relacionar las selecciones con las publicaciones persistidas. Los nombres y la cantidad de tablas no son imposiciones de la pauta.
- [x] **EP2-14 — Guardar datos y procedencia.** Identificador externo, URL, fuente/proveedor, nombre/categoría, precio decimal y moneda, unidad de venta, cobertura si existe, disponibilidad observada, fecha/hora, método/versión del extractor y estado de la ejecución. Añadir restricciones únicas, claves foráneas e índices adecuados.
- [x] **EP2-15 — Persistir sin duplicar y conservar contexto del proyecto.** Upsert/transacciones según el caso. Guardar superficie/presupuesto/selección o resultado necesario para relacionar datos externos con propios y reconstruir una comparación. NestJS sigue siendo el administrador principal de PostgreSQL; Python devuelve datos procesados y no escribe directamente esas tablas salvo decisión técnica justificada.
- [x] **EP2-16 — Exponer consultas útiles.** Endpoints NestJS para catálogo/ofertas y resultados, con DTO, filtros, orden y paginación. Documentar los contratos y proteger las operaciones de actualización/importación para evitar que cualquier usuario dispare extracciones o modificaciones.

Aceptación: tras reiniciar la aplicación, los datos recuperados pueden consultarse por NestJS y usarse dentro de un proyecto. Se puede reconstruir su fuente y fecha.

### E. Frontend e integración del producto

- [ ] **EP2-17 — Mostrar materiales reales e historial en Angular.** Precio y unidad, cobertura cuando exista, disponibilidad conocida/desconocida, proveedor, enlace de origen y Última comprobación en DD/MM/AAAA HH:MM, hora de Chile. Añadir estados de carga, vacío, error y datos antiguos. Incluir la opción adicional Ver historial de precios, con tabla/gráfico de las observaciones guardadas, consultando NestJS sin disparar extracciones de las tiendas.
- [ ] **EP2-18 — Dar utilidad a los datos.** Seleccionar/comparar cerámica o laminado por habitación, con superficie, presupuesto, cobertura y margen adicional; reflejar costo por habitación y total. Guardar las selecciones en el proyecto. Implementar la previsualización 3D orientativa aprobada, actualizando solo el suelo de la habitación elegida y vinculándolo al producto real. Identificar la apariencia aproximada y mostrar fotografía, datos y precio reales; no prometer reproducción visual exacta de cada SKU.
- [ ] **EP2-19 — Implementar filtros y consultas indexadas.** Alcance aprobado: tipo de piso, tienda y precio por m². Validar los parámetros, aplicar un orden estable y documentar índices/consultas. No añadir como requisitos de EP2 buscador textual ni filtros por marca, color o formato.

Aceptación: el usuario encuentra y utiliza datos reales persistidos desde Angular, pasando por NestJS. No basta con mostrar una respuesta de FastAPI en Swagger o ejecutar un script aislado.

### F. Evaluación y diseño de adaptación

- [x] **EP2-20 — Definir y justificar las métricas de información acordadas.** Porcentaje de registros válidos y porcentaje de duplicados, con población y denominadores definidos. Separar registros inválidos, repeticiones y productos fuera del alcance; explicar que la muestra acotada no representa todo el catálogo. Se puede informar antigüedad/tasa de errores como contexto. No exigir métricas de relevancia sin un buscador evaluado.
- [x] **EP2-21 — Aplicar la evaluación y guardar resultados.** Conjunto evaluado, fecha, conteos/denominadores, procedimiento/script, resultados reales y limitaciones. No basta con definir la fórmula. Ejemplos: validez = registros aceptados/recuperados; duplicados = repeticiones detectadas/recuperados. No atribuir recall a toda la Web.
- [ ] **EP2-22 — Especificar la futura adaptación.** Desarrollar la propuesta descrita arriba: usuario, datos web, presupuesto/superficie/tipo/uso, reglas de ordenamiento, explicación, control y evaluación futura. Separar restricciones indispensables de preferencias y documentar datos ausentes. No implementar el motor adaptativo completo como requisito de este hito.

Aceptación: se muestra una medición reproducible con valores reales y una especificación que otro integrante pueda implementar durante el Módulo 3.

### G. Pruebas y controles de CI

- [x] **EP2-23 — Probar adquisición y calidad.** Fixtures permitidas de la fuente para extracción, formatos válidos/rotos, campos ausentes, unidades, precios, duplicados, actualización y caída de la fuente. Pruebas deterministas en PR y verificación en vivo separada para demostrar la adquisición real.
- [ ] **EP2-24 — Probar contratos y persistencia.** NestJS–FastAPI con respuesta válida/inválida, timeout, indisponibilidad y reintentos limitados; guardar/consultar sin duplicados y recorrido integrado hasta frontend. Reutilizar las pruebas EP1.
- [ ] **EP2-25 — Ampliar seguridad del pipeline.** Análisis estático de seguridad explícito, auditoría de dependencias Python, detección de secretos y análisis de vulnerabilidades de las imágenes Docker. Mantener lint, tests, builds e infraestructura. Un secreto expuesto, vulnerabilidad crítica, prueba/build/infra fallidos o salud fallida deben bloquear el avance correspondiente.

Aceptación: los jobs muestran resultados y existe un fallo controlado que impide continuar. Elegir herramientas concretas durante la implementación; no son impuestas por esta planificación.

### H. Staging real, Terraform y despliegue

- [ ] **EP2-26 — Validar el alojamiento gratuito sin tarjeta.** Validar la demo local prevista en el computador Windows: persistencia, arranque, red y acceso a las fuentes. Las candidatas cloud de [opciones de staging](staging.md) son alternativas opcionales. Definir URL del evaluador y administración. Descartar cualquier opción que exija pago o tarjeta. Un runner temporal que destruye Compose al terminar no sustituye el staging accesible.
- [ ] **EP2-27 — Hacer reproducible la infraestructura.** Adaptar Terraform al host elegido, accesos, almacenamiento, redes y salidas. Mantener fmt/init/validate/plan y aplicar de forma controlada lo necesario. Guardar el estado fuera de Git y gestionar su acceso. La pauta no dice que `terraform apply` deba ejecutarse en cada PR, pero sí exige un despliegue funcional verificable.
- [ ] **EP2-28 — Configurar Variables y Secrets reales por su función.** Variables como URL/nombre del ambiente/puerto; Secrets para credenciales efectivamente usadas en despliegue/base de datos/servicios. Registrar nombres, propósito y responsables sin valores. No inyectar credenciales reales en código de PR no confiable. Mantener ejemplos por servicio y exclusiones de Git.
- [ ] **EP2-29 — Automatizar despliegue y comprobación.** Tras aprobar controles y el flujo autorizado, publicar/desplegar una versión identificable del código. Aplicar migraciones con estrategia controlada, esperar salud y ejecutar una prueba funcional contra la URL de staging. Definir rollback a versión estable, considerando compatibilidad de migraciones.

Aceptación: desde GitHub Actions se despliega una versión funcional, accesible y vinculada a un commit/tag; los health checks y una prueba de datos reales pasan después. No basta con un build verde o Terraform plan.

### I. Observabilidad inicial

- [ ] **EP2-30 — Logs estructurados y correlación.** Generar/propagar un ID de solicitud entre NestJS y FastAPI. Registrar servicio, evento, resultado, duración y errores de fuente/contrato. Evitar registrar tokens, contraseñas o datos innecesarios.
- [ ] **EP2-31 — Salud y métrica básica.** Conservar liveness de ambos servicios, comprobar PostgreSQL en readiness/estado equivalente, registrar último intento/éxito de fuente y medir tiempo de respuesta. Mostrar cómo consultar esta información. No hacen falta todas las métricas ni una plataforma de observabilidad compleja para EP2.

Aceptación: una petición puede seguirse entre servicios con el mismo ID; se distingue un servicio vivo de una base de datos caída y se consulta al menos una medición de duración.

### J. Documentación y cierre

- [ ] **EP2-32 — Actualizar documentación.** README en español; APIs NestJS/FastAPI; fuente y condiciones; extracción, limpieza y actualización; modelo e índices; métricas y resultados; diseño adaptativo; Variables/Secrets; staging, pruebas, limitaciones y manual de demostración.
- [ ] **EP2-33 — Preparar demo y evidencias.** Recuperación real, datos normalizados/persistidos, consulta Angular, CI, staging, métrica y error controlado. El equipo debe poder ejecutar y explicar el flujo, no solo mostrar capturas. Registrar la participación y revisión de compañeros mediante tareas/commits/PR.
- [ ] **EP2-34 — Etiquetar la versión final de EP2.** Tag o release evaluable con enlaces de GitHub, staging, tablero y prototipo de interfaz; breve presentación, demo y participación. Etiquetar después de validar el commit que realmente se desplegó. No inventar una etiqueta histórica de EP1 como si hubiera existido al cierre original.

Aceptación: un tercero puede seguir los enlaces e instrucciones y reproducir la versión entregada.

## Orden recomendado y trabajo paralelo

1. Primero EP2-01, EP2-04/05/06 y EP2-26: retroalimentación, fuente/contrato y destino de staging. Estas decisiones desbloquean al resto.
2. Rama de datos: EP2-07…12. Rama de backend: EP2-13…16. Pueden avanzar en paralelo una vez acordado el contrato.
3. Frontend EP2-17…19, con datos de contrato para desarrollar pero integración final sobre datos reales; completar EP2-18 cuando ya exista persistencia.
4. En paralelo desde el inicio: staging/CI EP2-23…31 y documentación/gestión. No dejar el host, credenciales ni despliegue para el último día.
5. Completar métricas EP2-20/21 y diseño EP2-22 sobre el flujo operativo.
6. Cerrar EP2-32…34: demo completa, correcciones y versión etiquetada.

Aplicar los tres bloques definidos arriba: datos/Python; backend/persistencia e infraestructura; Angular/3D. Cada componente aporta pruebas, seguridad, logs y documentación; el bloque 2 coordina la integración y el despliegue.

Tu área anterior de Terraform/staging puede continuar con EP2-26…29: elegir host, hacer la infraestructura reproducible, configurar el acceso seguro del pipeline y demostrar despliegue automático con salud y rollback. Requiere acordar contratos de ejecución y variables con backend/Python/frontend.

## Estado verificado al completar el bloque 2

- Implementados: EP2-10, EP2-12 y EP2-13…16; las APIs cubren los tres filtros de EP2-19.
- Aportado a EP2-24/25/27…32: contratos/persistencia, SAST/imágenes, Terraform, variables, despliegue protegido, salud, logs y manuales. Las casillas globales siguen abiertas donde falta el equipo Windows, Angular o el cierre de la entrega.
- El compañero configurará posteriormente el runner. Faltan su primer despliegue verificable, pantallas/3D EP2 y la demostración/versionado final; no se marca toda EP2 como completada.

## Demostración de aceptación completa

1. Abrir la versión de staging y mostrar el commit/tag desplegado.
2. Iniciar o mostrar una captura automatizada reciente de la fuente real.
3. Mostrar datos originales permitidos y su transformación, validación y procedencia.
4. Mostrar la intervención de FastAPI y su comunicación con NestJS.
5. Mostrar los registros almacenados y repetir la captura sin duplicarlos.
6. Consultar/comparar materiales desde Angular con fecha, unidad y fuente visibles.
7. Mostrar pipeline, análisis, despliegue y health checks posteriores.
8. Presentar la métrica calculada y sus limitaciones.
9. Provocar una indisponibilidad o respuesta inválida y mostrar el manejo controlado.
10. Explicar el diseño de la adaptación futura y la participación de cada integrante.

## Lo que no hace falta convertir en tarea obligatoria de EP2

- Implementar a la vez API, scraping estático y dinámico; se selecciona el acceso pertinente y permitido.
- Construir obligatoriamente Elasticsearch, embeddings, base vectorial, RAG, LLM, RDF o SPARQL. Son técnicas posibles del módulo; la pauta EP2 no las prescribe para todos.
- Calcular todas las métricas de recuperación. Se exige al menos una estrategia pertinente aplicada.
- Terminar el motor inteligente, modelo completo de usuario, pruebas A/B o evaluación final con usuarios.
- Completar toda la UX, todos los materiales, todas las plataformas nativas o producción definitiva para este hito.

Un buscador textual puede aportar valor al catálogo, y Product/Offer en JSON-LD puede ser una entrada útil si la fuente lo publica. Su elección debe justificar el caso de uso; añadir estas tecnologías por sí solas no sustituye el flujo con datos reales, persistencia, evaluación y staging.
