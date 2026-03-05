###############################################################################
# MSK Cluster Outputs
###############################################################################

output "cluster_arn" {
  description = "ARN of the MSK cluster"
  value       = aws_msk_cluster.this.arn
}

output "cluster_name" {
  description = "Name of the MSK cluster"
  value       = aws_msk_cluster.this.cluster_name
}

output "bootstrap_brokers_tls" {
  description = "TLS bootstrap broker connection string"
  value       = aws_msk_cluster.this.bootstrap_brokers_tls
}

output "zookeeper_connect_string" {
  description = "ZooKeeper connection string"
  value       = aws_msk_cluster.this.zookeeper_connect_string
}

output "zookeeper_connect_string_tls" {
  description = "ZooKeeper TLS connection string"
  value       = aws_msk_cluster.this.zookeeper_connect_string_tls
}

output "security_group_id" {
  description = "ID of the MSK security group"
  value       = aws_security_group.msk.id
}

output "configuration_arn" {
  description = "ARN of the MSK configuration"
  value       = aws_msk_configuration.this.arn
}

output "current_version" {
  description = "Current version of the MSK cluster (used for updates)"
  value       = aws_msk_cluster.this.current_version
}
