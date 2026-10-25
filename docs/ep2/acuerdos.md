# Acuerdos de alcance para la EP2

Ronda de definición completada el **18/10/2026**. Este es el registro consolidado
de las decisiones finales; sustituye las propuestas preliminares de la conversación.
El avance de implementación se registra en el [plan de trabajo](plan-de-trabajo.md)
y el [manual del bloque 1](bloque-1-datos.md); definir el alcance no certifica toda la EP2.

## Fuentes y flujo de datos

- **Fuentes:** Sodimac y Easy, utilizando los JSON de sus sitios y paginación cuando
  sea necesaria. El acceso técnico observado no acredita una API pública contractual
  para terceros ni resuelve por sí solo las condiciones de reutilización.
- **Ubicación:** La Florida, Región Metropolitana, Santiago, como contexto de entrega.
  No se ha seleccionado una sucursal específica de retiro.
- **Categorías:** cerámicas para piso y piso flotante laminado. No se incluyen pisos
  vinílicos/SPC en el alcance de EP2.
- **Muestra:** hasta diez publicaciones pertinentes por categoría y tienda; máximo
  cuarenta. Comenzar con productos vendidos directamente por cada tienda,
  identificar al vendedor y evitar duplicados. Registrar los conteos efectivamente
  obtenidos, sin inventar productos para completar cupos.
- **Flujo:** extracción Python → validación/procesamiento FastAPI → NestJS →
  PostgreSQL → consulta y visualización Angular. NestJS administra la persistencia.
- **Datos:** identificadores, fuente/vendedor, nombre, marca cuando exista,
  categoría, moneda, precio, unidad, cobertura, disponibilidad, comuna, URL y
  fecha/hora. Mantener las promociones condicionadas separadas del precio de referencia.

El bloque 1 incluye cerámicas y laminados de ambas fuentes. La disponibilidad se
mantiene desconocida cuando el listado no demuestra stock local. Véanse
[fuentes web](fuentes-web.md), [Sodimac](sodimac-acceso.md) y [Easy](easy-acceso.md).

## Proyectos, habitaciones y presupuesto

- Cada proyecto tendrá **varias habitaciones**, con selección de piso independiente.
- Cada superficie podrá ingresarse directamente en m² o calcularse con largo y ancho.
- Se definirá un presupuesto total por proyecto y límites opcionales por habitación.
- El cálculo incluye **solo la compra del piso**; no incluye adhesivos, fragüe,
  mano de obra u otros insumos de instalación.
- Habrá un margen inicial del **10 %**, editable por habitación, para cortes y desperdicios.
- Calcular superficie de compra, redondear hacia arriba a envases completos y
  multiplicar por su precio. Conservar las elecciones del usuario cuando cambien los precios.
- Trabajar siempre con el presupuesto calculado con los **últimos precios comprobados
  disponibles**. No se incluyen versiones históricas ni presupuestos con precios congelados.
- Los filtros serán **tipo de piso, tienda y precio por m²**. Marca, color y formato
  podrán mostrarse como características cuando existan, sin incorporarse como filtros.

## Actualización y trazabilidad

- Tres ejecuciones programadas: **08:00, 12:00 y 16:00**, en `America/Santiago`.
- La tarea inicia la adquisición y el procesamiento; PostgreSQL almacena los resultados.
  Entrar a la app, consultar el catálogo o abrir un proyecto no inicia una extracción de precios.
- Mostrar **Última comprobación: DD/MM/AAAA HH:MM**, con hora de 24 horas y fecha
  real de la última captura exitosa de cada publicación.
- Si el precio sigue igual, renovar la fecha de comprobación sin crear un cambio de precio.
- Si falla una captura, conservar el último dato válido y su fecha, indicando el fallo.
- Mantener una muestra identificada para poder seguir las mismas publicaciones.
- Las tres franjas son objetivos de programación, sujetos al programador disponible;
  no garantizan un inicio exacto ni equivalen a tres peticiones HTTP totales.
- Espaciar y limitar las solicitudes por tienda, impedir trabajos simultáneos y
  aplicar reintentos acotados. Las pausas no garantizan ausencia de bloqueos.

### Historial de precios

Incluir **Ver historial de precios** como opción adicional por publicación, con
tabla/gráfico de los precios observados desde la primera captura. Registrar la
observación inicial y los cambios posteriores con fecha; no inventar precios previos.
Comparar la misma publicación, vendedor, comuna, unidad, moneda y tipo de precio.

El historial es informativo: los presupuestos utilizan los últimos precios disponibles.
Abrirlo consulta datos persistidos en PostgreSQL a través de NestJS.

## Previsualización 3D

Al seleccionar un producto, actualizar el suelo de la habitación elegida con una
**apariencia orientativa** de cerámica o laminado. Representar tonalidad/formato
cuando haya datos y recursos adecuados, identificar las aproximaciones y mostrar
la fotografía, los datos y el precio reales del producto.

La selección se guarda por habitación. No se promete una reproducción visual exacta
de cada SKU; una fotografía comercial no garantiza una textura repetible.

## Restricciones académicas y organización

- Proyecto académico con cuentas y datos de usuarios ficticios para la demo.
- Alojamiento **completamente gratuito ($0) y sin tarjeta bancaria**. Actualización:
  se prevé usar el computador Windows de un integrante para la demo local;
  la puesta en marcha del conjunto sigue por validar. Figma es la referencia de diseño.
- El profesor no entregó observaciones de EP1. Documentar esa situación y resolver
  los pendientes técnicos verificados sin atribuirlos a comentarios docentes.
- El integrante encargado de la interfaz trabaja sobre su computador y compartió
  lo que está en el repositorio. No se dispone todavía de un enlace externo al prototipo.
  Se coordinará su actualización y enlace; las pantallas actuales sirven como referencia.
- Evaluar porcentaje de registros válidos y duplicados, con resultados reproducibles.
- Entregar el diseño preliminar de la futura adaptación; el motor completo corresponde
  a una etapa posterior.
- El [plan](plan-de-trabajo.md#tres-bloques-para-trabajar-en-paralelo) propone tres
  bloques: datos/Python; backend/persistencia e infraestructura; Angular/3D. La
  asignación personal puede acordarse dentro del equipo. Cada bloque aporta pruebas y documentación.

## Registro de la ronda de definición

| Punto | Decisión final |
| --- | --- |
| 1. Recursos de staging | Demo prevista en el computador Windows de un integrante; ejecución integral por validar. |
| 2. Presupuesto de alojamiento | $0. |
| 3. Registro del alojamiento | Sin tarjeta bancaria. |
| 4. Calendario | Elaborar el plan por dependencias, sin fijar una fecha de entrega. |
| 5. Alcance del costo | Solo compra de pisos; cerámicas y piso flotante. |
| 6. Tipo de flotante | Laminado. |
| 7. Superficie del proyecto | Varias habitaciones con selección independiente. |
| 8. Entrada de superficie | m² o largo/ancho. |
| 9. Límites presupuestarios | Total global y límites opcionales por habitación. |
| 10. Margen de material | 10 % inicial, editable por habitación. |
| 11. Vista 3D | Previsualización orientativa del piso seleccionado. |
| 12. Cobertura | Hasta diez publicaciones por categoría y tienda; máximo cuarenta. |
| 13. Historial y vigencia | Historial de precios informativo; presupuesto siempre con los últimos precios; sin versiones de presupuesto. |
| 13.1. Frecuencia y presentación | 08:00, 12:00 y 16:00, hora de Chile; Última comprobación en DD/MM/AAAA HH:MM. |
| 14. Retroalimentación EP1 | No hubo comentarios del profesor. |
| 15–16. Diseño/prototipo | Actualizar el diseño existente; referencia actual en el repositorio y enlace pendiente de coordinación. |
| 17. Filtros | Tipo de piso, tienda y precio por m². |

## Validaciones pendientes

Revalidar las condiciones y los cambios de formato de las fuentes; integrar los
contratos y la calidad de datos con NestJS; comprobar el despliegue local en Windows;
actualizar/enlazar el prototipo; ejecutar las pruebas y la demo del plan.
El cierre de la ronda define el alcance, no certifica el cumplimiento implementado de EP2.
