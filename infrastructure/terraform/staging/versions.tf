terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 4.6.0"
    }
  }
}

# Uses DOCKER_HOST when set; otherwise the provider uses its default socket.
# Export the active Docker CLI context endpoint explicitly when required.
# Staging resources are isolated from the development Compose stack.
provider "docker" {}
