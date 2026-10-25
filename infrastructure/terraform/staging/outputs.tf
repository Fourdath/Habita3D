output "staging_url" {
  description = "Loopback URL of the staging frontend on the Docker host."
  value       = "http://127.0.0.1:${var.frontend_port}"
}

output "api_health_url" {
  description = "NestJS health endpoint through the frontend reverse proxy."
  value       = "http://127.0.0.1:${var.frontend_port}/api/health"
}

output "container_names" {
  description = "Docker containers managed by this staging configuration."
  value = {
    frontend = docker_container.frontend.name
    backend  = docker_container.backend.name
    python   = docker_container.python.name
    postgres = docker_container.postgres.name
  }
}

output "network_names" {
  description = "Separated edge, service and database networks."
  value = {
    edge     = docker_network.edge.name
    services = docker_network.services.name
    data     = docker_network.data.name
  }
}

output "postgres_volume" {
  description = "Persistent PostgreSQL staging volume; do not remove without a backup."
  value       = docker_volume.postgres.name
}


output "api_readiness_url" {
  description = "Checks NestJS, PostgreSQL and FastAPI through the same-origin proxy."
  value       = "http://127.0.0.1:${var.frontend_port}/api/health/ready"
}

output "capture_status_url" {
  description = "Redacted state of the persisted capture coordinator; does not start acquisition."
  value       = "http://127.0.0.1:${var.frontend_port}/api/captures/status"
}

output "materials_volume" {
  description = "Persistent source evidence and stable sample; application catalogue is in PostgreSQL."
  value       = docker_volume.materials.name
}
