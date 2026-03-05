###############################################################################
# Data Sources
###############################################################################

data "aws_caller_identity" "current" {}

###############################################################################
# IAM Role — EKS Cluster
###############################################################################

resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-cluster-role"
  })
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "cluster_vpc_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.cluster.name
}

###############################################################################
# IAM Role — Node Group
###############################################################################

resource "aws_iam_role" "node_group" {
  name = "${var.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-node-role"
  })
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_ecr_readonly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_ssm" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.node_group.name
}

###############################################################################
# Security Group — Cluster Control Plane
###############################################################################

resource "aws_security_group" "cluster" {
  name_prefix = "${var.cluster_name}-cluster-"
  description = "Security group for the EKS cluster control plane"
  vpc_id      = var.vpc_id

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-cluster-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "cluster_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.cluster.id
  description       = "Allow all outbound traffic"
}

###############################################################################
# Security Group — Worker Nodes
###############################################################################

resource "aws_security_group" "node" {
  name_prefix = "${var.cluster_name}-node-"
  description = "Security group for EKS worker nodes"
  vpc_id      = var.vpc_id

  tags = merge(var.extra_tags, {
    Name                                        = "${var.cluster_name}-node-sg"
    "kubernetes.io/cluster/${var.cluster_name}"  = "owned"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "node_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.node.id
  description       = "Allow all outbound traffic from nodes"
}

# Node-to-node communication
resource "aws_security_group_rule" "node_internal" {
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "-1"
  source_security_group_id = aws_security_group.node.id
  security_group_id        = aws_security_group.node.id
  description              = "Allow node-to-node communication"
}

# Control plane to nodes
resource "aws_security_group_rule" "node_from_cluster" {
  type                     = "ingress"
  from_port                = 1025
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.cluster.id
  security_group_id        = aws_security_group.node.id
  description              = "Allow control plane to communicate with nodes"
}

resource "aws_security_group_rule" "node_from_cluster_443" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.cluster.id
  security_group_id        = aws_security_group.node.id
  description              = "Allow control plane to reach node webhooks and metrics"
}

# Nodes to control plane
resource "aws_security_group_rule" "cluster_from_nodes" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.node.id
  security_group_id        = aws_security_group.cluster.id
  description              = "Allow nodes to communicate with control plane"
}

###############################################################################
# Security Group — Service-to-Service (SignalRisk ports)
###############################################################################

resource "aws_security_group" "services" {
  name_prefix = "${var.cluster_name}-services-"
  description = "Security group for SignalRisk service-to-service communication"
  vpc_id      = var.vpc_id

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-services-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Allow all SignalRisk service ports within the group
# api-gateway:3000, event-collector:3001, device-intel:3002, velocity:3003,
# behavioral:3004, network:3005, rule-engine:3006, decision-engine:3007,
# telco:3008, dashboard-api:3010, auth-service:3015
resource "aws_security_group_rule" "services_internal" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3015
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.services.id
  security_group_id        = aws_security_group.services.id
  description              = "Allow SignalRisk service-to-service traffic (ports 3000-3015)"
}

resource "aws_security_group_rule" "services_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.services.id
  description       = "Allow all outbound traffic from services"
}

###############################################################################
# CloudWatch Log Group for EKS
###############################################################################

resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = 30

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-logs"
  })
}

###############################################################################
# EKS Cluster
###############################################################################

resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  version  = var.cluster_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids = concat(var.private_subnet_ids, var.public_subnet_ids)

    security_group_ids = [aws_security_group.cluster.id]

    endpoint_public_access  = var.cluster_endpoint_public_access
    endpoint_private_access = var.cluster_endpoint_private_access
  }

  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler",
  ]

  tags = merge(var.extra_tags, {
    Name = var.cluster_name
  })

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
    aws_iam_role_policy_attachment.cluster_vpc_controller,
    aws_cloudwatch_log_group.cluster,
  ]
}

###############################################################################
# Managed Node Group
###############################################################################

resource "aws_eks_node_group" "default" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.cluster_name}-default"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = var.private_subnet_ids

  instance_types = var.node_instance_types
  disk_size      = var.node_disk_size
  capacity_type  = "ON_DEMAND"

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable = 1
  }

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-default-node-group"
  })

  depends_on = [
    aws_iam_role_policy_attachment.node_worker,
    aws_iam_role_policy_attachment.node_cni,
    aws_iam_role_policy_attachment.node_ecr_readonly,
    aws_iam_role_policy_attachment.node_ssm,
  ]

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

###############################################################################
# OIDC Provider (for IRSA — IAM Roles for Service Accounts)
###############################################################################

data "tls_certificate" "cluster" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "cluster" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer

  tags = merge(var.extra_tags, {
    Name = "${var.cluster_name}-oidc"
  })
}
