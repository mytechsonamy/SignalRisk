###############################################################################
# General
###############################################################################

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
}

###############################################################################
# Networking
###############################################################################

variable "vpc_id" {
  description = "VPC ID where the MSK cluster will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for broker placement (one per AZ, must be 3 for multi-AZ)"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 3
    error_message = "At least 3 subnets are required for multi-AZ MSK deployment."
  }
}

variable "client_security_group_ids" {
  description = "Security group IDs allowed to connect to MSK (e.g., EKS worker nodes)"
  type        = list(string)
}

variable "additional_security_group_ids" {
  description = "Additional security group IDs to attach to broker nodes"
  type        = list(string)
  default     = []
}

###############################################################################
# Cluster Configuration
###############################################################################

variable "kafka_version" {
  description = "Apache Kafka version for the MSK cluster"
  type        = string
  default     = "3.6.0"
}

variable "broker_count" {
  description = "Number of broker nodes (must be a multiple of the number of AZs)"
  type        = number
  default     = 3
}

variable "broker_instance_type" {
  description = "EC2 instance type for Kafka brokers"
  type        = string
  default     = "kafka.m5.large"
}

variable "broker_ebs_volume_size" {
  description = "EBS volume size in GB per broker"
  type        = number
  default     = 500
}

variable "default_retention_hours" {
  description = "Default log retention in hours for topics"
  type        = number
  default     = 168
}

###############################################################################
# Encryption
###############################################################################

variable "kms_key_arn" {
  description = "ARN of the KMS key for encryption at rest (null uses AWS managed key)"
  type        = string
  default     = null
}

###############################################################################
# Monitoring
###############################################################################

variable "enhanced_monitoring" {
  description = "Enhanced MSK monitoring level"
  type        = string
  default     = "PER_TOPIC_PER_BROKER"

  validation {
    condition     = contains(["DEFAULT", "PER_BROKER", "PER_TOPIC_PER_BROKER", "PER_TOPIC_PER_PARTITION"], var.enhanced_monitoring)
    error_message = "Enhanced monitoring must be one of: DEFAULT, PER_BROKER, PER_TOPIC_PER_BROKER, PER_TOPIC_PER_PARTITION."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

###############################################################################
# Tags
###############################################################################

variable "extra_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
