# Integración del motor 3D — septiembre de 2026

Se integró el paquete TypeScript adjunto y se completó su conexión con el visor Angular existente.

## Correcciones

- Construcción asíncrona de escena y presupuesto desde el manifiesto de superficies generado.
- Materiales por cara y por tramo de recinto: un muro largo puede tener cerámica en el baño y pintura en la habitación contigua. La fachada mantiene su propio acabado.
- Cerámica del baño hasta 2,10 m, pintura por encima y UV en metros. Los cambios de estilo reutilizan geometrías.
- Transformaciones SVG acumuladas para muros, puertas, habitaciones, perímetro y muebles; identificadores de muebles únicos.
- Guardapolvos y backsplash colocados sobre sus segmentos, con orientación y altura reales.
- Lavamanos a la altura especificada; mamparas con su huella completa y corrección de elevaciones que excedían el techo.
- Cubetas abiertas, grifería y huecos en los muebles de soporte. Sin gabinetes de lavaplatos duplicados ni losas superpuestas al lavamanos.
- Los espacios reservados para electrodomésticos no generan electrodomésticos ficticios.
- Entrada en un punto libre de un recinto y dimensiones compartidas entre losa y terreno.
- Registro de materiales compartido, liberación de texturas y geometrías de cargas descartadas.
- Se conservó el optimizador de cortes existente con sus colocaciones y retazos, adaptándolo al manifiesto nuevo.
- Vista general con órbita, zoom, desplazamiento, vista superior y centrado. Cámara independiente; oculta techos y luminarias al inspeccionar el modelo y los restaura al volver al recorrido.
- Puertas con objetivo de 0,90 × 2,10 m. La abertura se limita al espacio entre tabiques para no moverla al recinto vecino; las representaciones superpuestas se unifican antes de cortar muros y acabados. Las hojas abiertas se colocan contra un tramo libre de muro; si no cabe una hoja completa, se conserva el paso abierto con su marco.
- Cápsula del personaje de 0,56 m de diámetro. Se verifica el cruce de las ocho puertas del plano incluido mediante la geometría completa y el Octree, incluyendo el acceso de cocina limitado por dos tabiques.
- Muebles bajos de cocina de 0,90 m de altura y hasta 0,60 m de profundidad; superiores de hasta 0,32 m de profundidad y 0,72 m de altura. Frentes divididos en módulos y electrodomésticos/lavaplatos contenidos en su mueble de apoyo, conservando el borde trasero contra el muro.

## Verificación

Desde `frontend`: `npm run lint`, `npm test -- --watch=false`, `npm run build`.

124 pruebas, incluidas regresiones de caras interiores/exteriores, muros compartidos por varios recintos, cambio de estilo sin reconstrucción, colocación de guardapolvos, lavamanos con elevación cero, mamparas, cubiertas con huecos, duplicados, transformaciones SVG, punto de entrada, cruce de puertas con la cápsula real, muebles sobredimensionados y regreso de vista general a recorrido.

La revisión visual utilizó el plano `public/assets/floorplans/model.svg` en el visor, incluyendo vista general, vista superior y cambio de estilo. Las pruebas incluyen casos sintéticos de muebles excesivos y puertas duplicadas; no se dispone del SVG concreto de las nuevas capturas del usuario.

## Alcance

Los muebles siguen siendo geometrías procedurales, no modelos fotorealistas. Los acabados sin imágenes locales usan texturas procedurales. El presupuesto sigue siendo demostrativo y parcial: no incluye todas las partidas, mano de obra ni una especificación estructural. La clasificación constructiva por espesor es una hipótesis del catálogo. No se modificó el Home ni se agregaron servicios de backend.
