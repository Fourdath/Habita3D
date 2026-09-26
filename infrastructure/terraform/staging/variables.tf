variable "name_prefix" {
  description = "Prefix for all staging Docker resources; must not overlap with development."
  type        = string
  default     = "habita3d-staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,39}$", var.name_prefix))
    error_message = "Use 3-40 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "image_tag" {
  description = "Identifiable version of the application images, preferably a Git commit SHA."
  type        = string
  default     = "ep1"

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "Use a valid Docker image tag (up to 128 characters)."
  }
}

variable "frontend_port" {
  description = "Host loopback port for the staging frontend and same-origin /api proxy."
  type        = number
  default     = 18080

  validation {
    condition     = var.frontend_port >= 1024 && var.frontend_port <= 65535
    error_message = "Choose an unprivileged TCP port from 1024 to 65535."
  }
}

variable "database_name" {
  description = "PostgreSQL database name used only by staging."
  type        = string
  default     = "habita3d_staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.database_name))
    error_message = "Use a PostgreSQL identifier with lowercase letters, digits and underscores."
  }
}

variable "database_user" {
  description = "PostgreSQL application user used only by staging."
  type        = string
  default     = "habita3d_staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.database_user))
    error_message = "Use a PostgreSQL identifier with lowercase letters, digits and underscores."
  }
}

variable "database_password" {
  description = "Staging database password. Supply via TF_VAR_database_password; never commit it."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.database_password) >= 16
    error_message = "The staging database password must contain at least 16 characters."
  }
}
