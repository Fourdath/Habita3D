# Protección de la aplicación y datos de la demo

Habita3D usa cuentas ficticias para probar proyectos y presupuesto. La cuenta
conserva el correo de prueba y un hash de contraseña. PostgreSQL almacena
sesiones como hashes con vencimiento, proyectos, superficies, selecciones y
preferencias. Las preferencias explican el orden de las recomendaciones.
Los descartes duran la sesión de la interfaz. El recomendador no aprende de
decisiones anteriores ni necesita datos de comportamiento persistentes.

| Riesgo | Control y comprobación |
| --- | --- |
| Acceso a proyectos de otra cuenta | Guard de sesión y consulta de propietario en NestJS. Las pruebas ejercitan ausencia de sesión y recursos ajenos. |
| Consumo excesivo de endpoints | Límites por dirección de conexión y ruta en la instancia NestJS. Login 12/min, registro 10/min, sugerencias y presupuesto 30/min y aceptación 15/min. Capturas/importación tienen credencial y límites propios. Detrás del proxy local, cuenta la dirección del proxy para ese grupo de solicitudes. |
| Operaciones directas sobre servicios internos | X-Materials-Token para procesamiento de FastAPI y capturas. El navegador usa una sesión Bearer. PostgreSQL y FastAPI permanecen en redes internas de staging. |
| Cliente móvil de otro origen | API_ALLOWED_ORIGINS admite una lista explícita de orígenes. Ajustarla al cliente probado y mantener vacío para la interfaz web de mismo origen. |
| Precio cambiado o datos inconsistentes | DTO, contratos, límites de respuesta, validación de propiedad y confirmación del costo. Las comprobaciones concurrentes preservan selecciones y revelan el cambio. |
| Exposición de credenciales, copias o registros | Variables de entorno y Secrets para staging. Contraseñas, token y respaldo quedan fuera del repositorio; los logs usan identificador de solicitud, duración y resultado. |
| Dependencias o imágenes vulnerables | Auditorías, Semgrep, Gitleaks y Trivy en CI. Una vulnerabilidad crítica falla el job de seguridad. Validar los informes del commit evaluable. |
| Catálogo incompleto, bloqueos o sesgos | Recopilar una muestra limitada de dos tiendas en una comuna, respetar restricciones documentadas de las fuentes y conservar fecha y procedencia. Mostrar las limitaciones de disponibilidad y del ámbito del presupuesto. |

Cerrar sesión revoca la sesión activa. Un usuario puede actualizar sus
preferencias y borrar sus proyectos mediante la API existente. Al terminar la
demo, el operador puede retirar los datos ficticios del entorno o eliminar su
base de evaluación aislada, conforme al acuerdo del equipo. Las copias
de seguridad se conservan en almacenamiento con acceso restringido al operador.
El equipo registra una política de retención antes de usar cuentas reales.

La evidencia de evaluación puede utilizar solo casos de prueba, resultados
agregados y fecha de captura. Evitar correos reales, credenciales,
datos de cuentas en capturas de pantalla y respuestas completas de las tiendas.
