###############################################################################
# VPC Outputs
###############################################################################

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnet_ids
}

###############################################################################
# EKS Outputs
###############################################################################

output "cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded CA data for the cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "cluster_oidc_issuer_url" {
  description = "OIDC issuer URL (for IRSA)"
  value       = module.eks.cluster_oidc_issuer_url
}

output "cluster_oidc_provider_arn" {
  description = "ARN of the OIDC provider (for IRSA)"
  value       = module.eks.cluster_oidc_provider_arn
}

output "cluster_security_group_id" {
  description = "Security group ID for the EKS control plane"
  value       = module.eks.cluster_security_group_id
}

output "node_security_group_id" {
  description = "Security group ID for the EKS worker nodes"
  value       = module.eks.node_security_group_id
}

output "services_security_group_id" {
  description = "Security group ID for SignalRisk service-to-service communication"
  value       = module.eks.services_security_group_id
}

output "cluster_role_arn" {
  description = "ARN of the IAM role used by the EKS cluster"
  value       = module.eks.cluster_role_arn
}

output "node_role_arn" {
  description = "ARN of the IAM role used by worker nodes"
  value       = module.eks.node_role_arn
}

###############################################################################
# RDS Outputs
###############################################################################

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = module.rds.endpoint
}

output "rds_address" {
  description = "RDS PostgreSQL hostname"
  value       = module.rds.address
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = module.rds.port
}

output "rds_security_group_id" {
  description = "Security group ID for the RDS instance"
  value       = module.rds.security_group_id
}

output "rds_master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret for the RDS master password"
  value       = module.rds.master_user_secret_arn
  sensitive   = true
}

###############################################################################
# ElastiCache Outputs
###############################################################################

output "redis_primary_endpoint" {
  description = "Redis cluster configuration endpoint"
  value       = module.elasticache.primary_endpoint
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint for read-only operations"
  value       = module.elasticache.reader_endpoint
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.port
}

output "redis_security_group_id" {
  description = "Security group ID for the ElastiCache cluster"
  value       = module.elasticache.security_group_id
}

###############################################################################
# Convenience: kubeconfig update command
###############################################################################

output "configure_kubectl" {
  description = "Command to configure kubectl for this cluster"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}
