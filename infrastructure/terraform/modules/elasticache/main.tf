###############################################################################
# SignalRisk — ElastiCache Redis 7.x Cluster Mode
#
# Provisions a Redis 7.x replication group with cluster mode enabled,
# encryption at rest and in transit, automatic failover, and a dedicated
# subnet group and security group.
###############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

###############################################################################
# Subnet Group
###############################################################################

resource "aws_elasticache_subnet_group" "this" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-redis-subnet-group"
  })
}

###############################################################################
# Security Group
###############################################################################

resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  description = "Security group for SignalRisk ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from EKS services"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-redis-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

###############################################################################
# Parameter Group
###############################################################################

resource "aws_elasticache_parameter_group" "this" {
  name   = "${local.name_prefix}-redis7-params"
  family = "redis7"

  description = "SignalRisk Redis 7.x parameter group"

  # Eviction policy suited for fraud detection caching
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  # Enable keyspace notifications for pub/sub
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-redis7-params"
  })
}

###############################################################################
# Redis Replication Group (Cluster Mode Enabled)
###############################################################################

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "SignalRisk Redis cluster for real-time fraud detection"

  # Engine
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  parameter_group_name = aws_elasticache_parameter_group.this.name
  port                 = 6379

  # Cluster mode
  num_node_groups         = var.num_shards
  replicas_per_node_group = var.replicas_per_shard

  # Networking
  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  # High availability
  automatic_failover_enabled = true
  multi_az_enabled           = true

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  # Maintenance
  maintenance_window       = var.maintenance_window
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window          = var.snapshot_window
  auto_minor_version_upgrade = true

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-redis"
  })
}

###############################################################################
# CloudWatch Log Groups for Redis Logging
###############################################################################

resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${local.name_prefix}-redis/slow-log"
  retention_in_days = 14

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-redis-slow-log"
  })
}

resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/${local.name_prefix}-redis/engine-log"
  retention_in_days = 14

  tags = merge(var.extra_tags, {
    Name = "${local.name_prefix}-redis-engine-log"
  })
}
