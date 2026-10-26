# Diseño preliminar de la capacidad adaptativa

Entregable 8 de la EP2: especificación preliminar de la capacidad adaptativa que se
implementará en el Módulo 3. En la EP2 **no se implementa el motor**: este documento
define qué se adaptará, con qué datos y cómo se evaluará, a partir de lo que ya existe
en los bloques 1 a 3.

## Resumen

**Recomendador de pisos por habitación.** Para cada habitación de un proyecto, Habita3D
ordena las publicaciones del catálogo persistido (Sodimac y Easy) y sugiere las
alternativas que mejor se ajustan al presupuesto, la superficie y las preferencias del
usuario. Cada sugerencia indica por qué se propone y cuánto costaría. El usuario puede
aceptarla, cambiarla o descartarla, y su decisión ajusta las sugerencias siguientes.

| Pregunta de la pauta | Respuesta |
| --- | --- |
| ¿Qué parte del sistema se adaptará? | El catálogo de pisos dentro del proyecto (panel "Elige el piso de tu espacio"). Hoy se ordena de forma estable por `publicationKey`; en el Módulo 3 se ordenará por pertinencia para la habitación seleccionada, con las primeras opciones destacadas como sugerencias. |
| ¿Quién será el usuario beneficiado? | La persona que remodela o termina una vivienda y debe elegir pisos para varias habitaciones con un presupuesto acotado, sin experiencia en calcular cajas, cobertura ni desperdicio. |
| ¿Qué información web se usa? | La información recuperada y persistida en la EP2: precio por caja, cobertura por caja, precio por m², categoría, tienda/vendedor, disponibilidad publicada, fecha de última comprobación e historial de precios. |
| ¿Qué variables de usuario o contexto? | Superficie y margen de cada habitación, límite por habitación, presupuesto total del proyecto, gasto ya comprometido en otras habitaciones, tipo de habitación del plano (baño, cocina, seco), preferencias declaradas e historial de aceptaciones y rechazos. |
| ¿Qué decisión toma el sistema? | Qué publicaciones mostrar primero para una habitación y cuáles marcar como "Sugerida". No elige por el usuario ni modifica selecciones guardadas. |
| ¿Qué resultado ve el usuario? | Hasta tres sugerencias destacadas con costo estimado, cajas, holgura o exceso respecto del límite, y una explicación breve. Debajo, el resto del catálogo reordenado. |
| ¿Qué mecanismo? | Reglas y puntuación ponderada (filtrado basado en contenido con restricciones), explicables y auditables. Se descartan modelos opacos para esta etapa porque la muestra es acotada (hasta 40 publicaciones). |
| ¿Cómo se evaluará? | Comparación con el orden no adaptativo actual mediante métricas de uso y una prueba breve con usuarios (ver sección Evaluación). |

## Entradas

### Datos web (ya persistidos en PostgreSQL)

| Dato | Origen | Uso en la adaptación |
| --- | --- | --- |
| `pricePerBoxClp`, `coveragePerBoxM2` | Publicación | Calcular cajas y costo de la habitación con la fórmula existente de `/floors/budget`. |
| `pricePerM2Clp` | Publicación | Comparar alternativas de igual categoría. |
| `category` | Publicación | Compatibilidad con el tipo de habitación y con la preferencia del usuario. |
| `availability` | Publicación | Penalizar `unavailable`; `unknown` no se trata como agotado. |
| `checkedAt` | Publicación | Antigüedad del dato: un precio no comprobado recientemente pierde prioridad y se avisa. |
| Historial de precios | `PriceObservation` | Estabilidad del precio. Es solo informativo y no predice precios futuros. |
| `source`, `seller` | Publicación | Preferencia de tienda declarada por el usuario. |

### Variables del usuario y del contexto

- **Del proyecto:** presupuesto total (`budgetClp`) y costo ya comprometido por las demás
  habitaciones con piso elegido.
- **De la habitación:** superficie (`areaM2` o `lengthM × widthM`), `wastePercent`,
  límite opcional (`budgetClp`) y `sceneRoomId`, del que se obtiene el tipo semántico
  del plano (`BATHROOM`, `KITCHEN`, `DRY`). Hoy ese tipo lo calcula el parser del frontend;
  en el Módulo 3 habrá que enviarlo o persistirlo junto con la habitación.
- **Preferencias declaradas (nuevas, opcionales):** tipo de piso preferido y tienda preferida.
- **Comportamiento:** sugerencias aceptadas, cambiadas o descartadas por habitación.

## Mecanismo propuesto

### 1. Restricciones indispensables (filtro)

Se excluyen de las sugerencias, aunque siguen visibles en el catálogo:

1. Publicaciones sin cobertura o sin precio válido: no se puede calcular su costo.
2. Publicaciones con `availability = unavailable`.
3. Laminado en habitaciones de tipo `BATHROOM`, por su baja resistencia al agua.
   La regla se explica al usuario y puede desactivarla.

### 2. Puntuación (ordenamiento)

Para cada publicación candidata *p* y habitación *h*:

```
costo(p,h)  = cajas(p,h) × precioCaja(p)                  # fórmula existente de FastAPI
disponible  = límite(h) ?? (presupuestoProyecto − comprometidoOtras)

puntaje = 0,45 · ajustePresupuesto + 0,20 · preferenciaTipo + 0,15 · preferenciaTienda
        + 0,10 · frescura + 0,10 · historialUsuario − penalizaciones
```

| Componente | Definición (0 a 1) |
| --- | --- |
| `ajustePresupuesto` | 1 si `costo ≤ disponible`; decrece linealmente hasta 0 cuando el exceso alcanza el 50 % de lo disponible. Si no hay límite ni presupuesto restante, se usa el precio por m² relativo dentro de la categoría. |
| `preferenciaTipo` | 1 si coincide con el tipo de piso preferido o con el más adecuado para el tipo de habitación; 0,5 si no hay preferencia. |
| `preferenciaTienda` | 1 si coincide con la tienda preferida; 0,5 si no hay preferencia. |
| `frescura` | 1 si se comprobó en las últimas 24 h; baja a 0 con 7 días sin comprobación. |
| `historialUsuario` | Proporción de aceptaciones de esa categoría y rango de precio en el mismo proyecto; 0,5 al inicio. |
| Penalizaciones | `unknown` en disponibilidad: −0,05. Precio con más de dos cambios en 7 días: −0,05. |

Los pesos iniciales son una hipótesis. Se ajustarán con la evaluación y se guardarán
como configuración versionada, no en el código del cliente.

### 3. Explicación

Cada sugerencia muestra entre una y tres razones generadas desde los componentes de
mayor peso, siempre con las cifras del backend. Por ejemplo:

- "Cabe en el límite de Dormitorio: $84.900 de $120.000 (7 cajas para 12,1 m² con 10 % adicional)".
- "Coincide con tu preferencia: cerámica, Sodimac".
- "Precio comprobado hoy a las 12:00".

Si la sugerencia excede el límite, se dice explícitamente: "Excede el límite en $12.300".

### 4. Control del usuario

- **Aceptar:** guarda la `publicationKey` en la habitación, el mismo efecto que "Elegir para esta habitación".
- **Cambiar:** abre el catálogo completo reordenado.
- **Descartar:** oculta esa sugerencia en la habitación y lo registra como señal negativa.
- **Desactivar sugerencias:** vuelve al orden actual no adaptativo.
- La adaptación nunca cambia selecciones ya guardadas ni crea versiones de presupuesto.

### 5. Arquitectura prevista

- **FastAPI:** endpoint `POST /recommendations/floors` que recibe la habitación, el contexto
  del proyecto y las publicaciones candidatas, y devuelve el orden, el puntaje y las razones.
  Reutiliza el cálculo de cajas y costos de `/floors/budget`.
- **NestJS:** `GET /api/projects/:id/rooms/:roomId/suggestions`. Lee las publicaciones y
  la habitación desde PostgreSQL bajo una misma instantánea, consulta FastAPI y registra
  la interacción en una tabla `SuggestionEvent` (sugerencia mostrada, aceptada, cambiada
  o descartada).
- **Angular:** banda "Sugeridas para esta habitación" sobre el catálogo del proyecto, con
  razones visibles y los controles anteriores.
- **Sin extracción adicional:** las sugerencias usan solo los datos ya capturados.

## Evaluación posterior (Módulo 3)

Se compara la versión adaptativa con el orden no adaptativo actual.

| Métrica | Cálculo | Meta inicial |
| --- | --- | --- |
| Tasa de aceptación | Sugerencias aceptadas / habitaciones con sugerencias mostradas | ≥ 40 % |
| Posición de la elección | Posición media del piso finalmente elegido en la lista | Menor que en el orden no adaptativo |
| Ajuste al presupuesto | Proyectos con `fits_budget = true` al terminar la selección | Mayor que en la versión no adaptativa |
| Tiempo hasta elegir | Tiempo entre abrir la habitación y guardar un piso | Menor que en la versión no adaptativa |
| Comprensión de la explicación | Pregunta Likert 1–5: "Entiendo por qué se me sugirió este piso" | Media ≥ 4 |

**Procedimiento:** sesiones con al menos 5 usuarios con cuentas ficticias. Cada uno
completa un proyecto de 3 habitaciones con y sin sugerencias, en orden alternado para
reducir el efecto de aprendizaje. Se registran los eventos de `SuggestionEvent` y se
aplica un cuestionario breve al final.

## Datos ausentes y limitaciones

- La muestra es de hasta 40 publicaciones de dos tiendas y una comuna; las sugerencias
  no representan todo el mercado.
- Las fuentes no publican de forma uniforme el tránsito o el uso recomendado. Si en el
  Módulo 3 se incorporan atributos como "alto tránsito" o "apto para baño", solo se usarán
  cuando la ficha del producto los publique; no se infieren del nombre.
- La disponibilidad suele ser `unknown`; no se interpreta como falta de stock.
- La previsualización 3D sigue siendo orientativa por categoría y no forma parte del puntaje.
- Con pocos usuarios, la señal de comportamiento es débil. Por eso su peso inicial es bajo
  (10 %) y se usa solo dentro del mismo proyecto.
