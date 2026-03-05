###############################################################################
# SignalRisk — PgBouncer Module Variables
###############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace for PgBouncer"
  type        = string
  default     = "signalrisk-data"
}

variable "create_namespace" {
  description = "Whether to create the Kubernetes namespace"
  type        = bool
  default     = true
}

variable "replicas" {
  description = "Number of PgBouncer pod replicas"
  type        = number
  default     = 2
}

# ---------- RDS Connection ----------

variable "rds_endpoint" {
  description = "RDS instance hostname (without port)"
  type        = string
}

variable "rds_port" {
  description = "RDS instance port"
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "Database name to proxy"
  type        = string
  default     = "signalrisk"
}

variable "db_username" {
  description = "Database username for PgBouncer auth"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database password for PgBouncer auth"
  type        = string
  sensitive   = true
}

# ---------- Pool Settings ----------

variable "pool_mode" {
  description = "PgBouncer pool mode (transaction, session, statement)"
  type        = string
  default     = "transaction"
}

variable "max_client_conn" {
  description = "Maximum number of client connections"
  type        = number
  default     = 1000
}

variable "default_pool_size" {
  description = "Default number of server connections per pool"
  type        = number
  default     = 25
}

variable "min_pool_size" {
  description = "Minimum number of server connections per pool"
  type        = number
  default     = 5
}

variable "reserve_pool_size" {
  description = "Reserve pool connections for burst handling"
  type        = number
  default     = 5
}

# ---------- Resource Limits ----------

variable "cpu_request" {
  description = "CPU request for PgBouncer container"
  type        = string
  default     = "250m"
}

variable "cpu_limit" {
  description = "CPU limit for PgBouncer container"
  type        = string
  default     = "500m"
}

variable "memory_request" {
  description = "Memory request for PgBouncer container"
  type        = string
  default     = "128Mi"
}

variable "memory_limit" {
  description = "Memory limit for PgBouncer container"
  type        = string
  default     = "256Mi"
}
