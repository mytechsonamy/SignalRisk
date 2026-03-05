###############################################################################
# SignalRisk — Amazon MSK (Managed Streaming for Apache Kafka)
#
# Provisions a multi-AZ MSK cluster with TLS encryption for the SignalRisk
# real-time fraud detection event streaming backbone.
###############################################################################

locals {
  name = "${var.project_name}-${var.environment}"
}

###############################################################################
# CloudWatch Log Group
###############################################################################

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${local.name}"
  retention_in_days = var.log_retention_days

  tags = merge(var.extra_tags, {
    Name        = "${local.name}-msk-logs"
    Environment = var.environment
    Project     = var.project_name
  })
}

###############################################################################
# MSK Configuration
###############################################################################

resource "aws_msk_configuration" "this" {
  name              = "${local.name}-config"
  kafka_versions    = [var.kafka_version]
  description       = "SignalRisk MSK cluster configuration"

  server_properties = <<-PROPERTIES
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=48
    num.io.threads=8
    num.network.threads=5
    num.replica.fetchers=2
    replica.lag.time.max.ms=30000
    socket.receive.buffer.bytes=102400
    socket.request.max.bytes=104857600
    socket.send.buffer.bytes=102400
    unclean.leader.election.enable=false
    log.retention.hours=${var.default_retention_hours}
    log.segment.bytes=1073741824
    message.max.bytes=10485760
    compression.type=lz4
  PROPERTIES

  tags = merge(var.extra_tags, {
    Name        = "${local.name}-msk-config"
    Environment = var.environment
    Project     = var.project_name
  })
}

###############################################################################
# Security Group
###############################################################################

resource "aws_security_group" "msk" {
  name_prefix = "${local.name}-msk-"
  description = "Security group for SignalRisk MSK cluster"
  vpc_id      = var.vpc_id

  # TLS communication
  ingress {
    description     = "Kafka TLS"
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = var.client_security_group_ids
  }

  # ZooKeeper (internal)
  ingress {
    description     = "ZooKeeper"
    from_port       = 2181
    to_port         = 2181
    protocol        = "tcp"
    security_groups = var.client_security_group_ids
  }

  # ZooKeeper TLS
  ingress {
    description     = "ZooKeeper TLS"
    from_port       = 2182
    to_port         = 2182
    protocol        = "tcp"
    security_groups = var.client_security_group_ids
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.extra_tags, {
    Name        = "${local.name}-msk-sg"
    Environment = var.environment
    Project     = var.project_name
  })

  lifecycle {
    create_before_destroy = true
  }
}

###############################################################################
# MSK Cluster
###############################################################################

resource "aws_msk_cluster" "this" {
  cluster_name           = local.name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.broker_count

  configuration_info {
    arn      = aws_msk_configuration.this.arn
    revision = aws_msk_configuration.this.latest_revision
  }

  broker_node_group_info {
    instance_type  = var.broker_instance_type
    client_subnets = var.subnet_ids

    security_groups = concat(
      [aws_security_group.msk.id],
      var.additional_security_group_ids
    )

    storage_info {
      ebs_storage_info {
        volume_size = var.broker_ebs_volume_size
      }
    }

    connectivity_info {
      public_access {
        type = "DISABLED"
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }

    encryption_at_rest_kms_key_arn = var.kms_key_arn
  }

  enhanced_monitoring = var.enhanced_monitoring

  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  tags = merge(var.extra_tags, {
    Name        = "${local.name}-msk"
    Environment = var.environment
    Project     = var.project_name
  })
}
