###############################################################################
# SignalRisk — EKS Cluster Infrastructure
#
# Provisions a multi-AZ VPC and EKS cluster for the SignalRisk real-time
# fraud detection platform.
###############################################################################

locals {
  cluster_name = "${var.project_name}-${var.environment}"
}

###############################################################################
# VPC Module
###############################################################################

module "vpc" {
  source = "./modules/vpc"

  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  private_subnet_cidrs = var.private_subnet_cidrs
  public_subnet_cidrs  = var.public_subnet_cidrs
  cluster_name         = local.cluster_name
  extra_tags           = var.extra_tags
}

###############################################################################
# EKS Module
###############################################################################

module "eks" {
  source = "./modules/eks"

  project_name        = var.project_name
  environment         = var.environment
  cluster_name        = local.cluster_name
  cluster_version     = var.cluster_version
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  public_subnet_ids   = module.vpc.public_subnet_ids
  node_instance_types = var.node_instance_types
  node_desired_size   = var.node_desired_size
  node_min_size       = var.node_min_size
  node_max_size       = var.node_max_size
  node_disk_size      = var.node_disk_size

  cluster_endpoint_public_access  = var.cluster_endpoint_public_access
  cluster_endpoint_private_access = var.cluster_endpoint_private_access

  extra_tags = var.extra_tags
}

###############################################################################
# RDS PostgreSQL Module
###############################################################################

module "rds" {
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  allowed_security_group_ids = [module.eks.services_security_group_id]

  db_name               = var.rds_db_name
  db_username           = var.rds_db_username
  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  backup_retention_period = var.rds_backup_retention_period
  backup_window         = var.rds_backup_window

  extra_tags = var.extra_tags
}

###############################################################################
# ElastiCache Redis Module
###############################################################################

module "elasticache" {
  source = "./modules/elasticache"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  allowed_security_group_ids = [module.eks.services_security_group_id]

  node_type          = var.redis_node_type
  num_shards         = var.redis_num_shards
  replicas_per_shard = var.redis_replicas_per_shard

  extra_tags = var.extra_tags
}
