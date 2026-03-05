###############################################################################
# SignalRisk — PgBouncer on EKS
#
# Deploys PgBouncer as a Kubernetes Deployment + Service for connection
# pooling in transaction mode between application pods and RDS PostgreSQL.
###############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  labels = {
    "app.kubernetes.io/name"       = "pgbouncer"
    "app.kubernetes.io/part-of"    = var.project_name
    "app.kubernetes.io/managed-by" = "terraform"
    "app.kubernetes.io/component"  = "database-proxy"
    "environment"                  = var.environment
  }
}

###############################################################################
# Kubernetes Namespace
###############################################################################

resource "kubernetes_namespace" "pgbouncer" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name   = var.namespace
    labels = local.labels
  }
}

###############################################################################
# ConfigMap — pgbouncer.ini
###############################################################################

resource "kubernetes_config_map" "pgbouncer" {
  metadata {
    name      = "${local.name_prefix}-pgbouncer-config"
    namespace = var.namespace
    labels    = local.labels
  }

  data = {
    "pgbouncer.ini" = templatefile("${path.module}/pgbouncer.ini", {
      db_host           = var.rds_endpoint
      db_port           = var.rds_port
      db_name           = var.db_name
      pool_mode         = var.pool_mode
      max_client_conn   = var.max_client_conn
      default_pool_size = var.default_pool_size
      min_pool_size     = var.min_pool_size
      reserve_pool_size = var.reserve_pool_size
    })

    "userlist.txt" = ""
  }

  depends_on = [kubernetes_namespace.pgbouncer]
}

###############################################################################
# Secret — Database credentials reference
###############################################################################

resource "kubernetes_secret" "pgbouncer_auth" {
  metadata {
    name      = "${local.name_prefix}-pgbouncer-auth"
    namespace = var.namespace
    labels    = local.labels
  }

  data = {
    DB_USER     = var.db_username
    DB_PASSWORD = var.db_password
  }

  type = "Opaque"

  depends_on = [kubernetes_namespace.pgbouncer]
}

###############################################################################
# Deployment
###############################################################################

resource "kubernetes_deployment" "pgbouncer" {
  metadata {
    name      = "${local.name_prefix}-pgbouncer"
    namespace = var.namespace
    labels    = local.labels
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        "app.kubernetes.io/name"    = "pgbouncer"
        "app.kubernetes.io/part-of" = var.project_name
      }
    }

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = "1"
        max_unavailable = "0"
      }
    }

    template {
      metadata {
        labels = local.labels
        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "9127"
        }
      }

      spec {
        service_account_name             = kubernetes_service_account.pgbouncer.metadata[0].name
        termination_grace_period_seconds = 30

        # Anti-affinity: spread across nodes
        affinity {
          pod_anti_affinity {
            preferred_during_scheduling_ignored_during_execution {
              weight = 100
              pod_affinity_term {
                label_selector {
                  match_labels = {
                    "app.kubernetes.io/name" = "pgbouncer"
                  }
                }
                topology_key = "kubernetes.io/hostname"
              }
            }
          }
        }

        container {
          name  = "pgbouncer"
          image = "bitnami/pgbouncer:1.22.1"

          port {
            name           = "pgbouncer"
            container_port = 5432
            protocol       = "TCP"
          }

          env {
            name = "PGBOUNCER_AUTH_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.pgbouncer_auth.metadata[0].name
                key  = "DB_USER"
              }
            }
          }

          env {
            name = "PGBOUNCER_AUTH_QUERY"
            value = "SELECT usename, passwd FROM pg_shadow WHERE usename=$1"
          }

          env {
            name  = "PGBOUNCER_DSN"
            value = "host=${var.rds_endpoint} port=${var.rds_port} dbname=${var.db_name}"
          }

          env {
            name = "POSTGRESQL_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.pgbouncer_auth.metadata[0].name
                key  = "DB_PASSWORD"
              }
            }
          }

          volume_mount {
            name       = "pgbouncer-config"
            mount_path = "/bitnami/pgbouncer/conf"
            read_only  = true
          }

          resources {
            requests = {
              cpu    = var.cpu_request
              memory = var.memory_request
            }
            limits = {
              cpu    = var.cpu_limit
              memory = var.memory_limit
            }
          }

          liveness_probe {
            tcp_socket {
              port = 5432
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          readiness_probe {
            tcp_socket {
              port = 5432
            }
            initial_delay_seconds = 5
            period_seconds        = 5
            timeout_seconds       = 3
            failure_threshold     = 3
          }
        }

        # Prometheus exporter sidecar
        container {
          name  = "pgbouncer-exporter"
          image = "prometheuscommunity/pgbouncer-exporter:v0.7.0"

          port {
            name           = "metrics"
            container_port = 9127
            protocol       = "TCP"
          }

          env {
            name  = "PGBOUNCER_EXPORTER_HOST"
            value = "localhost"
          }

          env {
            name  = "PGBOUNCER_EXPORTER_PORT"
            value = "5432"
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "32Mi"
            }
            limits = {
              cpu    = "100m"
              memory = "64Mi"
            }
          }
        }

        volume {
          name = "pgbouncer-config"
          config_map {
            name = kubernetes_config_map.pgbouncer.metadata[0].name
          }
        }
      }
    }
  }

  depends_on = [kubernetes_namespace.pgbouncer]
}

###############################################################################
# Service Account
###############################################################################

resource "kubernetes_service_account" "pgbouncer" {
  metadata {
    name      = "${local.name_prefix}-pgbouncer"
    namespace = var.namespace
    labels    = local.labels
  }

  depends_on = [kubernetes_namespace.pgbouncer]
}

###############################################################################
# Service
###############################################################################

resource "kubernetes_service" "pgbouncer" {
  metadata {
    name      = "pgbouncer"
    namespace = var.namespace
    labels    = local.labels

    annotations = {
      "prometheus.io/scrape" = "true"
      "prometheus.io/port"   = "9127"
    }
  }

  spec {
    selector = {
      "app.kubernetes.io/name"    = "pgbouncer"
      "app.kubernetes.io/part-of" = var.project_name
    }

    port {
      name        = "pgbouncer"
      port        = 5432
      target_port = 5432
      protocol    = "TCP"
    }

    port {
      name        = "metrics"
      port        = 9127
      target_port = 9127
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }

  depends_on = [kubernetes_namespace.pgbouncer]
}

###############################################################################
# Pod Disruption Budget
###############################################################################

resource "kubernetes_pod_disruption_budget_v1" "pgbouncer" {
  metadata {
    name      = "${local.name_prefix}-pgbouncer-pdb"
    namespace = var.namespace
    labels    = local.labels
  }

  spec {
    min_available = "1"

    selector {
      match_labels = {
        "app.kubernetes.io/name"    = "pgbouncer"
        "app.kubernetes.io/part-of" = var.project_name
      }
    }
  }

  depends_on = [kubernetes_namespace.pgbouncer]
}
