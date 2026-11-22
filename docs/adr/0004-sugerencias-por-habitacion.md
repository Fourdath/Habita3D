# ADR 0004: sugerencias explicables por habitación

> Decisión histórica del bloque 1. La integración final se documenta en el
> [ADR de recomendaciones adaptativas](0004-recomendaciones-adaptativas.md).

- Fecha de decisiones de alcance: 22/11/2026.
- Estado: implementado en el bloque 1. Integración visual en el bloque 2.

## Contexto

La elección de piso depende del número de cajas que requiere una habitación,
los precios observados, el presupuesto restante y las preferencias del
usuario. En la EP2, el catálogo ya se captura, valida y persiste de forma
trazable. El diseño de EP2 proponía pesos y un historial de interacciones.
Para la entrega final, el equipo acordó preferencias declaradas y reglas con
un orden explícito que se pueda comprobar con casos sencillos.

## Decisión

NestJS lee proyecto, habitaciones y precios desde una instantánea de
PostgreSQL autorizada por propietario. Consulta a FastAPI para calcular el
subtotal de las demás habitaciones y ordenar las publicaciones. La
transacción de lectura termina antes de llamar al servicio Python.

El límite efectivo es el menor entre el presupuesto de la habitación (si
existe) y lo que queda del presupuesto general. Se descuentan únicamente los
costos calculables de las demás habitaciones. Un saldo con costos pendientes
se identifica como provisional. FastAPI reutiliza el cálculo decimal de
cajas completas, con el margen guardado de la habitación.

Entre los pisos que caben, el orden es tipo de piso preferido, tienda
preferida y costo total ascendente. La clave de publicación desempata de
forma estable. Si ninguno cabe, se muestra el menor exceso primero. Se
devuelven hasta tres opciones. Agotado y costo no calculable se excluyen.
La disponibilidad no confirmada se conserva y se advierte. La antigüedad
del precio se informa desde las 24 horas.

El modelo guarda preferencias opcionales por habitación y una bandera por
proyecto. La pantalla descarta temporalmente mediante una lista de claves.
Para aceptar, NestJS recalcula el costo, bloquea las filas pertinentes para
verificar que los datos siguen vigentes y solo guarda si el usuario confirmó
ese costo. Si cambian en paralelo, se pide actualizar la consulta.

## Alternativas y consecuencias

- Mantener pesos e historial habría requerido definir y evaluar más estados
  y datos de comportamiento. Reglas ordenadas permiten reproducir cada
  resultado con el catálogo base y explicarlo con números de cajas y CLP.
- Calcular en Angular duplicaría el redondeo y la validación de contratos.
  Python concentra el cálculo y NestJS conserva la propiedad de los datos.
- Guardar un precio fijo en la habitación perdería actualidad. Se guarda
  la clave de publicación y el presupuesto usa los últimos precios conocidos.
- La llamada adicional introduce latencia y dependencia de FastAPI. El
  cliente interno usa tiempos máximos, autenticación y correlación. Ante
  indisponibilidad, las elecciones persistidas permanecen disponibles.

El alcance conserva pisos cerámicos y laminados, dos tiendas y hasta 40
publicaciones en La Florida. Las sugerencias representan una muestra
acotada y un presupuesto de compra de pisos. La aplicación no infiere stock
ni aptitud técnica para un recinto a partir del título del producto.
