###############################################################################
# SignalRisk — ElastiCache Module Outputs
###############################################################################

output "primary_endpoint" {
  description = "Configuration endpoint for the Redis cluster (use for cluster-aware clients)"
  value       = aws_elasticache_replication_group.this.configuration_endpoint_address
}

output "reader_endpoint" {
  description = "Reader endpoint for read-only operations"
  value       = aws_elasticache_replication_group.this.reader_endpoint_address
}

output "port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.this.port
}

output "security_group_id" {
  description = "Security group ID for the ElastiCache cluster"
  value       = aws_security_group.redis.id
}

output "replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.this.id
}
