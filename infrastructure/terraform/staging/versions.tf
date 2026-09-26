terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 4.6.0"
    }
  }
}

# Uses the active Docker context (or DOCKER_HOST). Staging is an isolated set of
# resources on that Docker host; the development Compose stack is separate.
provider "docker" {}
