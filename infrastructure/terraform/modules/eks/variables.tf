variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the cluster will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the EKS cluster and worker nodes"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs (used for load balancers)"
  type        = list(string)
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group"
  type        = list(string)
}

variable "node_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
}

variable "node_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
}

variable "node_max_size" {
  description = "Maximum number of worker nodes"
  type        = number
}

variable "node_disk_size" {
  description = "Disk size in GB for worker nodes"
  type        = number
}

variable "cluster_endpoint_public_access" {
  description = "Whether the API server endpoint is publicly accessible"
  type        = bool
}

variable "cluster_endpoint_private_access" {
  description = "Whether the API server endpoint is accessible within the VPC"
  type        = bool
}

variable "extra_tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
