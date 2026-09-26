locals {
  frontend_image = "habita3d/frontend:${var.image_tag}"
  backend_image  = "habita3d/backend:${var.image_tag}"
  python_image   = "habita3d/python-service:${var.image_tag}"

  # PostgreSQL URLs must encode a password before interpolation. The staging
  # secret is provided at runtime, never stored in a tracked .tfvars file.
  database_url = "postgresql://${var.database_user}:${urlencode(var.database_password)}@postgres:5432/${var.database_name}"
}

# Three trust zones: only the frontend has a host port; Python cannot reach the
# database; PostgreSQL is on a Docker-internal network with NestJS only.
resource "docker_network" "edge" {
  name   = "${var.name_prefix}-edge"
  driver = "bridge"
}

resource "docker_network" "services" {
  name   = "${var.name_prefix}-services"
  driver = "bridge"
}

resource "docker_network" "data" {
  name     = "${var.name_prefix}-data"
  driver   = "bridge"
  internal = true
}

resource "docker_volume" "postgres" {
  name = "${var.name_prefix}-postgres-data"
}

resource "docker_image" "postgres" {
  name         = "postgres:18-alpine"
  keep_locally = true
}

resource "docker_image" "frontend" {
  name         = local.frontend_image
  keep_locally = true

  build {
    context = abspath("${path.module}/../../../frontend")
  }
}

resource "docker_image" "backend" {
  name         = local.backend_image
  keep_locally = true

  build {
    context = abspath("${path.module}/../../../backend")
  }
}

resource "docker_image" "python" {
  name         = local.python_image
  keep_locally = true

  build {
    context = abspath("${path.module}/../../../python-service")
  }
}

resource "docker_container" "postgres" {
  name    = "${var.name_prefix}-postgres"
  image   = docker_image.postgres.image_id
  restart = "unless-stopped"
  memory  = 512
  wait    = true

  env = [
    "POSTGRES_USER=${var.database_user}",
    "POSTGRES_PASSWORD=${var.database_password}",
    "POSTGRES_DB=${var.database_name}",
  ]

  networks_advanced {
    name    = docker_network.data.name
    aliases = ["postgres"]
  }

  mounts {
    target = "/var/lib/postgresql"
    source = docker_volume.postgres.name
    type   = "volume"
  }

  healthcheck {
    test         = ["CMD-SHELL", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""]
    interval     = "10s"
    timeout      = "5s"
    retries      = 5
    start_period = "20s"
  }
}

resource "docker_container" "python" {
  name    = "${var.name_prefix}-python"
  image   = docker_image.python.image_id
  restart = "unless-stopped"
  memory  = 512
  wait    = true

  networks_advanced {
    name    = docker_network.services.name
    aliases = ["python-service"]
  }

  healthcheck {
    test         = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 5
    start_period = "10s"
  }
}

resource "docker_container" "backend" {
  name    = "${var.name_prefix}-backend"
  image   = docker_image.backend.image_id
  restart = "unless-stopped"
  memory  = 512
  wait    = true

  env = [
    "NODE_ENV=production",
    "APP_ENV=staging",
    "PORT=3000",
    "DATABASE_URL=${local.database_url}",
    "PYTHON_SERVICE_URL=http://python-service:8000",
  ]

  networks_advanced {
    name    = docker_network.edge.name
    aliases = ["backend"]
  }

  networks_advanced {
    name = docker_network.services.name
  }

  networks_advanced {
    name = docker_network.data.name
  }

  healthcheck {
    test         = ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 5
    start_period = "20s"
  }

  depends_on = [docker_container.postgres, docker_container.python]
}

resource "docker_container" "frontend" {
  name    = "${var.name_prefix}-frontend"
  image   = docker_image.frontend.image_id
  restart = "unless-stopped"
  memory  = 256
  wait    = true

  networks_advanced {
    name = docker_network.edge.name
  }

  ports {
    internal = 80
    external = var.frontend_port
    ip       = "127.0.0.1"
  }

  mounts {
    target    = "/etc/nginx/conf.d/default.conf"
    source    = abspath("${path.module}/nginx.conf")
    type      = "bind"
    read_only = true
  }

  healthcheck {
    test         = ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 5
    start_period = "10s"
  }

  depends_on = [docker_container.backend]
}
