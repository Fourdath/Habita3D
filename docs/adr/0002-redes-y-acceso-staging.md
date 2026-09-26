# ADR 0002: tres redes y una entrada HTTP para staging

- **Fecha:** 2026-09-26
- **Estado:** aceptada para EP1
- **Responsable:** equipo Habita3D

## Contexto

El frontend debe comunicarse con NestJS; NestJS con FastAPI y PostgreSQL. Python debe poder consultar una fuente web futura, pero no administrar la base de datos. El Compose de desarrollo publica PostgreSQL y Python en el host y el frontend aún no tiene un cliente HTTP configurado.

## Decisión

Terraform define `edge` para frontend/NestJS, `services` para NestJS/FastAPI y `data` interna para NestJS/PostgreSQL. Solo Nginx publica un puerto en `127.0.0.1`. Nginx sirve las rutas Angular y reenvía `/api/` a NestJS en el mismo origen; PostgreSQL y FastAPI no tienen puertos publicados.

## Consecuencias

- El navegador puede usar `/api` sin CORS cuando se implemente el servicio Angular.
- Python queda fuera de la red de datos; NestJS conserva la responsabilidad sobre PostgreSQL.
- La red `services` permite salida para la futura recuperación web. La red `data` impide acceso externo directo a PostgreSQL.
- El acceso está limitado al host local. Un despliegue remoto necesitará TLS, dominio, reglas de acceso y un secreto administrado fuera del estado local.
