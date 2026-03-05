output "cluster_id" {
  description = "EKS cluster ID"
  value       = aws_eks_cluster.this.id
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded certificate authority data for the cluster"
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_oidc_issuer_url" {
  description = "OIDC issuer URL for the cluster"
  value       = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

output "cluster_oidc_provider_arn" {
  description = "ARN of the OIDC provider for IRSA"
  value       = aws_iam_openid_connect_provider.cluster.arn
}

output "cluster_security_group_id" {
  description = "Security group ID for the EKS cluster control plane"
  value       = aws_security_group.cluster.id
}

output "node_security_group_id" {
  description = "Security group ID for the EKS worker nodes"
  value       = aws_security_group.node.id
}

output "services_security_group_id" {
  description = "Security group ID for SignalRisk service-to-service communication"
  value       = aws_security_group.services.id
}

output "node_group_arn" {
  description = "ARN of the default managed node group"
  value       = aws_eks_node_group.default.arn
}

output "cluster_role_arn" {
  description = "ARN of the IAM role used by the EKS cluster"
  value       = aws_iam_role.cluster.arn
}

output "node_role_arn" {
  description = "ARN of the IAM role used by EKS worker nodes"
  value       = aws_iam_role.node_group.arn
}
