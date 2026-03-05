###############################################################################
# SignalRisk — RDS PostgreSQL 16 Multi-AZ
#
# Provisions an encrypted, Multi-AZ RDS PostgreSQL instance with automated
# backups, a dedicated subnet group, security group, and a parameter group
# configured for Row-Level Security (RLS) workloads.
###############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

###############################################################################
# Subnet Group
###############################################################################

resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

###############################################################################
# Security Group
###############################################################################

resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds-"
  description = "Security group for SignalRisk RDS PostgreSQL"
  vpc_id      = var.vpc_id

  # Allow inbound PostgreSQL from the EKS services security group
  ingress {
    description     = "PostgreSQL from EKS services"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  # Allow all outbound (for RDS internal operations)
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-rds-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

###############################################################################
# Parameter Group — RLS-ready settings
###############################################################################

resource "aws_db_parameter_group" "this" {
  name   = "${local.name_prefix}-pg16-params"
  family = "postgres16"

  description = "SignalRisk PostgreSQL 16 parameter group with RLS-ready settings"

  # Enable Row-Level Security prerequisites
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Performance tuning for fraud detection workloads
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  parameter {
    name  = "track_activity_query_size"
    value = "4096"
  }

  # Connection and memory settings
  parameter {
    name  = "max_connections"
    value = "200"
  }

  parameter {
    name  = "work_mem"
    value = "65536"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "524288"
  }

  # WAL and checkpoint tuning
  parameter {
    name  = "checkpoint_completion_target"
    value = "0.9"
  }

  parameter {
    name         = "max_wal_size"
    value        = "2048"
    apply_method = "pending-reboot"
  }

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-pg16-params"
  })
}

###############################################################################
# RDS Instance
###############################################################################

resource "aws_db_instance" "this" {
  identifier = "${local.name_prefix}-postgres"

  # Engine
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = var.instance_class
  parameter_group_name = aws_db_parameter_group.this.name

  # Storage
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  # Database
  db_name  = var.db_name
  username = var.db_username
  port     = 5432

  manage_master_user_password = true

  # Networking
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = true
  publicly_accessible    = false

  # Backup
  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  copy_tags_to_snapshot   = true

  # Monitoring
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn

  # Protection
  deletion_protection       = var.environment == "production" ? true : false
  skip_final_snapshot       = var.environment == "production" ? false : true
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-final-snapshot" : null

  # Upgrades
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-postgres"
  })
}

###############################################################################
# Enhanced Monitoring IAM Role
###############################################################################

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-rds-monitoring"
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
