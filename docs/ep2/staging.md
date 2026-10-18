# Opciones de staging EP2 — validación preliminar

Revisión documental: 18/10/2026. Restricciones del usuario: **$0 y sin tarjeta bancaria**. No se crearon cuentas ni se contrató infraestructura. Este documento no confirma todavía un proveedor definitivo.

## Candidata principal

Angular en Cloudflare Pages; NestJS y FastAPI en dos servicios Render Free; PostgreSQL en Neon Free; pruebas, despliegue y programación desde GitHub Actions.

- Render es compatible con procesos web y Docker, y dispone de proveedor Terraform. Sus servicios gratuitos duermen tras 15 minutos sin tráfico, comparten 750 horas mensuales por workspace y usan disco efímero. Render Postgres gratuito caduca a los 30 días: utilizar una base externa. [Límites Free](https://render.com/docs/free), [Terraform](https://render.com/docs/terraform-provider), [despliegue desde CI](https://render.com/docs/deploy-hooks).
- **Registro sin tarjeta no garantizado para toda cuenta:** Render anuncia acceso gratuito sin tarjeta, pero su soporte indica que puede solicitar verificación a algunas cuentas. Si la exige, esta opción incumple la restricción del usuario y debe descartarse. [Información de Render](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), [aclaración del soporte](https://community.render.com/t/the-deployement-of-a-web-service-fails/36005).
- Neon anuncia acceso sin tarjeta. Revisar las cuotas Free actuales y usar conexiones/pooling adecuados. El proveedor Terraform de Neon es comunitario y debe fijarse y validarse. [Sin tarjeta](https://neon.com/variable-load), [precios/cuotas](https://neon.com/pricing), [SDK/proveedor](https://api-docs.neon.tech/reference/sdks-for-the-neon-api).
- Cloudflare Pages permite desplegar desde CI; su plan gratuito impone límites de archivos y tamaño individual, relevantes para texturas/modelos 3D. [Despliegue CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [límites](https://developers.cloudflare.com/pages/platform/limits/).

## Alternativa a evaluar

Angular en Cloudflare Pages; NestJS y FastAPI como funciones en dos proyectos Vercel Hobby; PostgreSQL en Neon; programación externa desde Actions.

Vercel documenta soporte para ambos frameworks y Hobby gratuito no comercial. El funcionamiento es de funciones, con límites de duración/memoria: no alojar un scheduler continuo ni asumir que un scrape pesado con navegador cabrá dentro de una petición. Validar registro sin tarjeta; la revisión documental no encontró una garantía expresa aplicable a toda cuenta. [NestJS](https://vercel.com/docs/frameworks/backend/nestjs), [FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), [Hobby](https://vercel.com/docs/plans/hobby), [límites de funciones](https://vercel.com/docs/functions/limitations), [Terraform](https://vercel.com/kb/guide/integrating-terraform-with-vercel).

## Tres horarios de comprobación

La documentación actual de Actions admite `timezone: America/Santiago` en `schedule`, junto a un cron para las 08:00, 12:00 y 16:00. Verificar soporte real al configurar el workflow. GitHub advierte que los schedules pueden retrasarse o descartarse bajo carga, especialmente al minuto 00, y que se desactivan en repositorios públicos tras 60 días sin actividad. **Los horarios son el objetivo de programación, no una garantía de inicio exacto.** [Documentación schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Guardar horario previsto, inicio, fin, estado y captura exitosa real. Usar exclusión de ejecuciones simultáneas e idempotencia por franja. La interfaz debe mostrar Última comprobación con datos efectivamente obtenidos; no avanzar la fecha si no hubo captura. La ejecución manual protegida permite demostrar y recuperar una captura fallida, respetando los mismos límites de acceso.

Actions con runners estándar es gratuito en repositorios públicos; verificar visibilidad y límites aplicables antes de cerrar la solución. Evitar runners grandes y artefactos pesados. [Facturación Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Servicios que no deben presupuestarse como gratuitos

- Render Cron Jobs tiene un mínimo de pago: utilizar Actions en la candidata principal. [Cron Jobs](https://render.com/docs/cronjobs).
- Vercel Cron Hobby tiene restricciones de frecuencia/precisión incompatibles con prometer las tres franjas exactas. [Cron Hobby](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Pendientes de validación antes del despliegue

1. Validar registro y plan gratuito **sin tarjeta**, con una cuenta autorizada del equipo; si pide tarjeta, descartar la opción.
2. Verificar cuotas y condiciones en ese momento, secretos necesarios y disponibilidad de Terraform.
3. Probar primer despliegue, conexiones NestJS/FastAPI/PostgreSQL, migraciones, salud y acceso del evaluador.
4. Validar acceso de las fuentes desde el host de adquisición; una respuesta válida desde el equipo local no garantiza el mismo resultado desde un proveedor cloud.
5. Confirmar que la extracción acotada, pruebas y tres ejecuciones diarias caben en las cuotas gratuitas, con pausas y reintentos limitados.

La validación de cuentas y despliegue es una tarea futura del [plan de trabajo](plan-de-trabajo.md). La selección del proveedor queda condicionada a comprobar las restricciones de costo cero, registro sin tarjeta y funcionamiento de los servicios.
