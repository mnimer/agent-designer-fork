/**
 * Google Cloud Remote MCP Servers Registry
 *
 * Job / Purpose:
 * Central repository and catalog for all official Google Cloud and Google Workspace
 * Remote Model Context Protocol (MCP) servers documented at docs.cloud.google.com/mcp/supported-products.
 *
 * Architectural Decisions:
 * 1. Categorization: Organized into 6 distinct domains matching enterprise cloud topology:
 *    - Databases & Storage
 *    - Analytics, ETL & Governance
 *    - Compute & Containers
 *    - AI, Search & Agent Platform
 *    - Management, Observability & Security
 *    - Developer & Google Workspace
 * 2. Remote Streamable HTTP: Remote servers connect over HTTPS (`https://<service>.googleapis.com/mcp`)
 *    using Streamable HTTP transport and Google Application Default Credentials (ADC).
 * 3. Regional Endpoints: Services with regional footprints (e.g. Composer, AlloyDB, Chronicle, Audit Manager)
 *    support regional endpoint templating (`https://<service>.<REGION>.rep.googleapis.com/mcp`).
 * 4. Multi-Endpoint Toolsets: High-density services like Gemini Enterprise Agent Platform and Secure Source Manager
 *    expose discrete functional toolsets (e.g., generate, predict, notebook, endpoints, code_review, repository).
 * 5. Conversion Utility: Exports `createToolDefinitionFromGcpMcpServer` to easily instantiate a canvas-ready
 *    `ToolDefinition` configured with `authProviderType: 'google_credentials'`.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  GoogleCloudLaunchStage,
  GoogleCloudMcpDomain,
  GoogleCloudMcpServerDefinition,
  ToolDefinition,
} from '../../shared/types';

export interface GoogleCloudDomainMeta {
  id: GoogleCloudMcpDomain;
  label: string;
  description: string;
  icon: string;
}

/**
 * Standard supported Google Cloud regions for regional MCP services.
 */
export const STANDARD_GCP_REGIONS: string[] = [
  'us-central1',
  'us-east1',
  'us-east4',
  'us-west1',
  'us-west2',
  'europe-west1',
  'europe-west2',
  'europe-west3',
  'europe-west4',
  'asia-east1',
  'asia-northeast1',
  'asia-southeast1',
];

/**
 * Metadata for the 6 primary Google Cloud MCP domains.
 */
export const GOOGLE_CLOUD_MCP_DOMAINS: GoogleCloudDomainMeta[] = [
  {
    id: 'databases_storage',
    label: 'Databases & Storage',
    description: 'Relational, NoSQL, in-memory databases and enterprise cloud object/file storage.',
    icon: 'Database',
  },
  {
    id: 'compute_containers',
    label: 'Compute & Containers',
    description: 'Serverless compute, VM instances, Kubernetes clusters, and asynchronous messaging.',
    icon: 'Cpu',
  },
  {
    id: 'ai_search_agent',
    label: 'AI, Search & Agent Platform',
    description: 'Generative foundation models, agent runtimes, customer experience bots, and search.',
    icon: 'Bot',
  },
  {
    id: 'analytics_etl_governance',
    label: 'Analytics, ETL & Governance',
    description: 'Data transformation, Spark analytics, migration pipelines, and data catalog metadata.',
    icon: 'BarChart3',
  },
  {
    id: 'management_observability_security',
    label: 'Management, Observability & Security',
    description: 'Cloud operations logging, metrics, traces, billing, policy governance, and SecOps.',
    icon: 'Shield',
  },
  {
    id: 'developer_workspace',
    label: 'Developer & Google Workspace',
    description: 'Developer knowledge base, CLI execution, Workspace apps (Drive, Gmail, Docs), and Maps.',
    icon: 'Code',
  },
];

/**
 * Master catalog of official Google Cloud Remote MCP Servers.
 */
export const GOOGLE_CLOUD_MCP_SERVERS: GoogleCloudMcpServerDefinition[] = [
  // =========================================================================
  // 1. Databases & Storage (15 servers)
  // =========================================================================
  {
    id: 'gcp_mcp_bigquery',
    name: 'BigQuery',
    description: 'Execute SQL queries, inspect table schemas, and manage datasets in BigQuery enterprise data warehouse.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://bigquery.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/bigquery/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/bigquery', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_bigtable',
    name: 'Cloud Bigtable',
    description: 'Low-latency NoSQL database service for large operational and analytical workloads.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://bigtableadmin.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/bigtable/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_spanner',
    name: 'Cloud Spanner',
    description: 'Mission-critical, relational database service offering unlimited scale and 99.999% availability.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://spanner.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/spanner/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/spanner.data', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudsql',
    name: 'Cloud SQL',
    description: 'Fully managed relational database service for MySQL, PostgreSQL, and SQL Server.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://sqladmin.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/sql/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/sqlservice.admin', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_alloydb',
    name: 'AlloyDB for PostgreSQL',
    description: 'Fully managed PostgreSQL-compatible database service for demanding enterprise transactional workloads.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://alloydb.googleapis.com/mcp',
    regionalEndpointPattern: 'https://alloydb.<REGION>.rep.googleapis.com/mcp',
    supportedRegions: STANDARD_GCP_REGIONS,
    docUrl: 'https://cloud.google.com/alloydb/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_firestore',
    name: 'Cloud Firestore',
    description: 'Serverless document database built for automatic scaling, high performance, and ease of application development.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://firestore.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/firestore/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_memorystore',
    name: 'Memorystore (Redis & Valkey)',
    description: 'In-memory service for Redis and Valkey providing sub-millisecond data access for caching and fast storage.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://redis.googleapis.com/mcp',
    toolsets: ['redis', 'valkey'],
    docUrl: 'https://cloud.google.com/memorystore/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_storage',
    name: 'Cloud Storage',
    description: 'Secure, durable, and highly scalable object storage service for unstructured file and data payloads.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://storage.googleapis.com/storage/mcp',
    docUrl: 'https://cloud.google.com/storage/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/devstorage.read_write', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_filestore',
    name: 'Filestore',
    description: 'Managed Network Attached Storage (NAS) for Compute Engine and GKE instances.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://file.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/filestore/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_netapp',
    name: 'Google Cloud NetApp Volumes',
    description: 'Enterprise-grade, fully managed cloud file storage powered by NetApp ONTAP.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://netapp.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/netapp/volumes/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_oracledatabase',
    name: 'Oracle Database@Google Cloud',
    description: 'Run Oracle Exadata Database Service and Autonomous Database directly within Google Cloud.',
    domain: 'databases_storage',
    launchStage: 'Preview',
    defaultEndpoint: 'https://oracledatabase.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/oracle-database-at-google-cloud/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_databasecenter',
    name: 'Database Center',
    description: 'Fleet-wide visibility, security health checks, and governance across all Google Cloud databases.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://databasecenter.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/database-center/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_databaseinsights',
    name: 'Database Insights',
    description: 'Intelligent database diagnostics, query load profiling, and AI recommendations for database performance.',
    domain: 'databases_storage',
    launchStage: 'GA',
    defaultEndpoint: 'https://databaseinsights.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/database-insights/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_datamigration',
    name: 'Database Migration Service',
    description: 'Serverless, minimal-downtime database migration tooling into Cloud SQL and AlloyDB.',
    domain: 'databases_storage',
    launchStage: 'Preview',
    defaultEndpoint: 'https://datamigration.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/database-migration-service/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_datastream',
    name: 'Datastream',
    description: 'Serverless change data capture (CDC) and replication service across heterogeneous databases and storage.',
    domain: 'databases_storage',
    launchStage: 'Preview',
    defaultEndpoint: 'https://datastream.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/datastream/docs',
    icon: 'Database',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },

  // =========================================================================
  // 2. Analytics, ETL & Governance (6 servers)
  // =========================================================================
  {
    id: 'gcp_mcp_dataform',
    name: 'Dataform',
    description: 'Develop, version-control, and schedule SQL-based data transformations in BigQuery.',
    domain: 'analytics_etl_governance',
    launchStage: 'GA',
    defaultEndpoint: 'https://dataform.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/dataform/docs',
    icon: 'BarChart3',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_dataproc',
    name: 'Managed Spark (Dataproc)',
    description: 'Execute Apache Spark and Hadoop workloads via Dataproc clusters and serverless batch sessions.',
    domain: 'analytics_etl_governance',
    launchStage: 'GA',
    defaultEndpoint: 'https://dataproc.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/dataproc/docs',
    icon: 'BarChart3',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_bigquerydatatransfer',
    name: 'BigQuery Data Transfer',
    description: 'Automate data movement from SaaS applications and cloud storage into BigQuery on a scheduled basis.',
    domain: 'analytics_etl_governance',
    launchStage: 'Preview',
    defaultEndpoint: 'https://bigquerydatatransfer.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/bigquery/docs/dts-introduction',
    icon: 'BarChart3',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_bigquerymigration',
    name: 'BigQuery Migration Service',
    description: 'Automated assessment, translation, and validation tools for migrating SQL dialects to BigQuery.',
    domain: 'analytics_etl_governance',
    launchStage: 'GA',
    defaultEndpoint: 'https://bigquerymigration.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/bigquery/docs/migration-intro',
    icon: 'BarChart3',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_dataplex',
    name: 'Knowledge Catalog (Dataplex)',
    description: 'Discover, manage, govern, and secure distributed data assets across data lakes, marts, and warehouses.',
    domain: 'analytics_etl_governance',
    launchStage: 'Preview',
    defaultEndpoint: 'https://dataplex.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/dataplex/docs',
    icon: 'BarChart3',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_datalineage',
    name: 'Data Lineage (Dataplex)',
    description: 'Track and visualize end-to-end data lineage for BigQuery, Cloud Composer, and Dataplex pipelines.',
    domain: 'analytics_etl_governance',
    launchStage: 'Preview',
    defaultEndpoint: 'https://datalineage.googleapis.com/mcp',
    regionalEndpointPattern: 'https://datalineage.<REGION>.rep.googleapis.com/mcp',
    supportedRegions: STANDARD_GCP_REGIONS,
    docUrl: 'https://cloud.google.com/data-catalog/docs/concepts/about-data-lineage',
    icon: 'BarChart3',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },

  // =========================================================================
  // 3. Compute & Containers (6 servers)
  // =========================================================================
  {
    id: 'gcp_mcp_cloudrun',
    name: 'Cloud Run',
    description: 'Deploy and scale stateless containers, microservices, and webhooks serverlessly.',
    domain: 'compute_containers',
    launchStage: 'GA',
    defaultEndpoint: 'https://run.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/run/docs',
    icon: 'Cpu',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_compute',
    name: 'Compute Engine',
    description: 'Create, inspect, and manage virtual machine instances, persistent disks, and network topology.',
    domain: 'compute_containers',
    launchStage: 'GA',
    defaultEndpoint: 'https://compute.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/compute/docs',
    icon: 'Cpu',
    defaultScopes: ['https://www.googleapis.com/auth/compute', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_container',
    name: 'Google Kubernetes Engine (GKE)',
    description: 'Manage enterprise Kubernetes container clusters, workloads, pods, and deployments.',
    domain: 'compute_containers',
    launchStage: 'GA',
    defaultEndpoint: 'https://container.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/kubernetes-engine/docs',
    icon: 'Cpu',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_composer',
    name: 'Cloud Composer (Apache Airflow)',
    description: 'Managed workflow orchestration service built on Apache Airflow for DAG scheduling.',
    domain: 'compute_containers',
    launchStage: 'GA',
    defaultEndpoint: 'https://composer.us-central1.rep.googleapis.com/mcp',
    regionalEndpointPattern: 'https://composer.<REGION>.rep.googleapis.com/mcp',
    supportedRegions: STANDARD_GCP_REGIONS,
    docUrl: 'https://cloud.google.com/composer/docs',
    icon: 'Cpu',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_managedkafka',
    name: 'Managed Service for Apache Kafka',
    description: 'Fully managed Apache Kafka service for high-throughput, low-latency streaming event pipelines.',
    domain: 'compute_containers',
    launchStage: 'GA',
    defaultEndpoint: 'https://managedkafka.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/managed-service-for-apache-kafka/docs',
    icon: 'Cpu',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_pubsub',
    name: 'Pub/Sub',
    description: 'Global asynchronous messaging and streaming event bus for microservices and analytics.',
    domain: 'compute_containers',
    launchStage: 'GA',
    defaultEndpoint: 'https://pubsub.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/pubsub/docs',
    icon: 'Cpu',
    defaultScopes: ['https://www.googleapis.com/auth/pubsub', 'https://www.googleapis.com/auth/cloud-platform'],
  },

  // =========================================================================
  // 4. AI, Search & Agent Platform (5 servers)
  // =========================================================================
  {
    id: 'gcp_mcp_gemini_agent_platform',
    name: 'Gemini Enterprise Agent Platform',
    description: 'Unified Vertex AI platform providing foundation models, endpoints, tuning, evaluation, and retrieval.',
    domain: 'ai_search_agent',
    launchStage: 'GA',
    defaultEndpoint: 'https://aiplatform.googleapis.com/mcp',
    toolsets: [
      'generate',
      'predict',
      'notebook',
      'endpoints',
      'models',
      'tuning',
      'retrieval',
      'evaluation',
      'prompts',
    ],
    docUrl: 'https://cloud.google.com/vertex-ai/docs',
    icon: 'Bot',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_discoveryengine',
    name: 'Agent Search (Vertex AI Search)',
    description: 'Enterprise search and generative answering grounded in proprietary enterprise documents and websites.',
    domain: 'ai_search_agent',
    launchStage: 'GA',
    defaultEndpoint: 'https://discoveryengine.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/generative-ai-app-builder/docs',
    icon: 'Bot',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_agentregistry',
    name: 'Agent Registry',
    description: 'Centralized registry and catalog for discovering, inspecting, and managing enterprise AI agents.',
    domain: 'ai_search_agent',
    launchStage: 'GA',
    defaultEndpoint: 'https://agentregistry.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/vertex-ai/docs/agent-registry',
    icon: 'Bot',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_ces',
    name: 'Customer Experience (CX) Agent Studio',
    description: 'Build, evaluate, and deploy omnichannel conversational agents with Dialogflow CX runtime.',
    domain: 'ai_search_agent',
    launchStage: 'GA',
    defaultEndpoint: 'https://ces.us.rep.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/dialogflow/cx/docs',
    icon: 'Bot',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_geminicloudassist',
    name: 'Gemini Cloud Assist',
    description: 'Contextual AI assistant diagnosing cloud infrastructure issues, architecture, and cost optimization.',
    domain: 'ai_search_agent',
    launchStage: 'Preview',
    defaultEndpoint: 'https://geminicloudassist.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/gemini/docs/cloud-assist',
    icon: 'Bot',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },

  // =========================================================================
  // 5. Management, Observability & Security (22 servers)
  // =========================================================================
  {
    id: 'gcp_mcp_logging',
    name: 'Cloud Logging',
    description: 'Store, search, analyze, monitor, and alert on logging data and events from Google Cloud environments.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://logging.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/logging/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/logging.read', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_monitoring',
    name: 'Cloud Monitoring',
    description: 'Gain visibility into the performance, uptime, and overall health of cloud applications via metrics.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://monitoring.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/monitoring/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/monitoring.read', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudtrace',
    name: 'Cloud Trace',
    description: 'Distributed tracing system collecting latency data and profiling microservice call trees.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://cloudtrace.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/trace/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/trace.readonly', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_clouderrorreporting',
    name: 'Error Reporting',
    description: 'Counts, analyzes, and aggregates crashes in running cloud services for rapid triaging.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://clouderrorreporting.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/error-reporting/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_servicehealth',
    name: 'Personalized Service Health',
    description: 'Provides proactive, personalized notifications regarding Google Cloud incidents impacting your projects.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://servicehealth.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/service-health/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudquotas',
    name: 'Cloud Quotas',
    description: 'Inspect, manage, and automate quota limits and adjustments across all Google Cloud services.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://cloudquotas.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/docs/quotas',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_recommender',
    name: 'Recommender',
    description: 'Actionable guidance to optimize costs, strengthen security, boost performance, and manage assets.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://recommender.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/recommender/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudresourcemanager',
    name: 'Resource Manager',
    description: 'Programmatically query and manage project hierarchies, folders, and IAM access policies.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://cloudresourcemanager.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/resource-manager/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudasset',
    name: 'Cloud Asset Inventory',
    description: 'Metadata inventory service for search, asset discovery, time-series analysis, and export.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://cloudasset.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/asset-inventory/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudbilling',
    name: 'Cloud Billing',
    description: 'Programmatically query billing accounts, cost budgets, invoice records, and spending forecasts.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://cloudbilling.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/billing/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_auditmanager',
    name: 'Audit Manager',
    description: 'Continuous audit automation, compliance posture verification, and evidence evaluation.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://auditmanager.us-central1.rep.googleapis.com/mcp',
    regionalEndpointPattern: 'https://auditmanager.<REGION>.rep.googleapis.com/mcp',
    supportedRegions: STANDARD_GCP_REGIONS,
    docUrl: 'https://cloud.google.com/security/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_backupdr',
    name: 'Backup and DR Service',
    description: 'Centralized backup and disaster recovery management for VMs, databases, and application data.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://backupdr.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/backup-disaster-recovery/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_chronicle',
    name: 'Google Security Operations (Chronicle)',
    description: 'Modern, cloud-native security information and event management (SIEM) with petabyte-scale search.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://chronicle.us-central1.rep.googleapis.com/mcp',
    regionalEndpointPattern: 'https://chronicle.<REGION>.rep.googleapis.com/mcp',
    supportedRegions: STANDARD_GCP_REGIONS,
    docUrl: 'https://cloud.google.com/chronicle/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_policyanalyzer',
    name: 'Policy Analyzer',
    description: 'Find out which principals have what access to which Google Cloud resources across IAM bindings.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://policyanalyzer.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/policy-intelligence/docs/analyze-iam-policies',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_policytroubleshooter',
    name: 'Policy Troubleshooter',
    description: 'Diagnose why a user or service account has or does not have permissions to a specific resource.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://policytroubleshooter.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/policy-intelligence/docs/troubleshoot-iam',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_securesourcemanager',
    name: 'Secure Source Manager',
    description: 'Enterprise managed Git source control repository service with integrated security scanning.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://securesourcemanager.us-central1.rep.googleapis.com/mcp',
    regionalEndpointPattern: 'https://securesourcemanager.<REGION>.rep.googleapis.com/mcp',
    supportedRegions: STANDARD_GCP_REGIONS,
    toolsets: ['code_review', 'pull_request', 'branch_rule', 'repository', 'instance', 'hook'],
    docUrl: 'https://cloud.google.com/secure-source-manager/docs',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudlocationfinder',
    name: 'Cloud Location Finder',
    description: 'Inspect availability and compatibility of Google Cloud services across regions and zones.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://cloudlocationfinder.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/about/locations',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudproductregistry',
    name: 'Cloud Product Registry',
    description: 'Discover and query metadata, release notes, and product statuses for Google Cloud APIs.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://cloudproductregistry.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/apis',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_maintenance',
    name: 'Unified Maintenance',
    description: 'Track upcoming scheduled cloud infrastructure maintenance events and rescheduling options.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://maintenance.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/compute/docs/instances/live-migration-info',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudsupport',
    name: 'Cloud Support API',
    description: 'Create, inspect, comment on, and manage enterprise Google Cloud customer support cases.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://cloudsupport.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/support/docs/apis',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_saasservicemgmt',
    name: 'App Lifecycle Manager',
    description: 'Automate lifecycle provisioning, upgrades, and tenant management for SaaS applications.',
    domain: 'management_observability_security',
    launchStage: 'Preview',
    defaultEndpoint: 'https://saasservicemgmt.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/solutions',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_apihub',
    name: 'Apigee API hub',
    description: 'Comprehensive API management registry for discovering, standardizing, and governing API assets.',
    domain: 'management_observability_security',
    launchStage: 'GA',
    defaultEndpoint: 'https://apihub.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/apigee/docs/api-hub',
    icon: 'Shield',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },

  // =========================================================================
  // 6. Developer & Google Workspace (14 servers)
  // =========================================================================
  {
    id: 'gcp_mcp_developerknowledge',
    name: 'Developer Knowledge API',
    description: 'Grounding search and documentation answers across Google Cloud, Android, Firebase, and Web APIs.',
    domain: 'developer_workspace',
    launchStage: 'GA',
    defaultEndpoint: 'https://developerknowledge.googleapis.com/mcp',
    docUrl: 'https://developers.google.com',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_cloudcli',
    name: 'Cloud CLI Execution',
    description: 'Execute gcloud and gsutil operations securely via remote authenticated command execution.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://cloudcli.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com/sdk/gcloud',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_drive',
    name: 'Google Drive',
    description: 'Search, read, create, and organize documents, spreadsheets, and files in Google Drive.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://drivemcp.googleapis.com/mcp/v1',
    docUrl: 'https://developers.google.com/drive',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_gmail',
    name: 'Gmail',
    description: 'Search message threads, read emails, draft replies, and manage labels in Google Workspace Gmail.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://gmailmcp.googleapis.com/mcp/v1',
    docUrl: 'https://developers.google.com/gmail/api',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_calendar',
    name: 'Google Calendar',
    description: 'Query availability, create calendar invites, inspect meetings, and adjust schedule events.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://calendarmcp.googleapis.com/mcp/v1',
    docUrl: 'https://developers.google.com/calendar',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_chat',
    name: 'Google Chat',
    description: 'Send messages, inspect spaces, query chat threads, and post interactive cards to Google Chat.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://chatmcp.googleapis.com/mcp/v1',
    docUrl: 'https://developers.google.com/workspace/chat',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/chat.messages', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_people',
    name: 'People API (Contacts)',
    description: 'Query enterprise directory contacts, profile metadata, phone numbers, and organizational hierarchy.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://people.googleapis.com/mcp/v1',
    docUrl: 'https://developers.google.com/people',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_androidmanagement',
    name: 'Android Management API',
    description: 'Manage enterprise mobile devices, kiosk policies, security compliance, and application deployment.',
    domain: 'developer_workspace',
    launchStage: 'GA',
    defaultEndpoint: 'https://androidmanagement.googleapis.com/mcp',
    docUrl: 'https://developers.google.com/android/management',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/androidmanagement', 'https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_mapstools',
    name: 'Google Maps Grounding Lite',
    description: 'Retrieve real-world geographic coordinates, place details, opening hours, and distance routes.',
    domain: 'developer_workspace',
    launchStage: 'GA',
    defaultEndpoint: 'https://mapstools.googleapis.com/mcp',
    docUrl: 'https://developers.google.com/maps',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_mapscodeassist',
    name: 'Maps Code Assist',
    description: 'AI code generation, documentation retrieval, and debugging tools for Google Maps Platform APIs.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://mapscodeassist.googleapis.com/mcp',
    docUrl: 'https://developers.google.com/maps',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_paydeveloper',
    name: 'Google Pay & Wallet',
    description: 'Verify payment configurations, inspect digital wallet passes, and manage merchant integrations.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://paydeveloper.googleapis.com/mcp',
    docUrl: 'https://developers.google.com/pay',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_homedevelopers',
    name: 'Google Home Developer',
    description: 'Query Matter and smart home device states, structures, automations, and developer tools.',
    domain: 'developer_workspace',
    launchStage: 'GA',
    defaultEndpoint: 'https://homedevelopers.googleapis.com/mcp',
    docUrl: 'https://developers.home.google.com',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_stitch',
    name: 'Stitch',
    description: 'Multi-service integration fabric and automated data connector generation.',
    domain: 'developer_workspace',
    launchStage: 'Beta',
    defaultEndpoint: 'https://stitch.googleapis.com/mcp',
    docUrl: 'https://cloud.google.com',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
  {
    id: 'gcp_mcp_design',
    name: 'Design MCP',
    description: 'UI/UX design token inspection, Material Design guidelines, and design asset retrieval.',
    domain: 'developer_workspace',
    launchStage: 'Preview',
    defaultEndpoint: 'https://design.googleapis.com/mcp',
    docUrl: 'https://m3.material.io',
    icon: 'Code',
    defaultScopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
];

/**
 * Returns all registered Google Cloud Remote MCP Server definitions.
 *
 * @returns Array of GoogleCloudMcpServerDefinition
 */
export function getGoogleCloudMcpServers(): GoogleCloudMcpServerDefinition[] {
  return [...GOOGLE_CLOUD_MCP_SERVERS];
}

/**
 * Returns all Google Cloud Remote MCP Servers belonging to a specific domain.
 *
 * @param domain GoogleCloudMcpDomain filter
 * @returns Array of GoogleCloudMcpServerDefinition
 */
export function getGoogleCloudMcpServersByDomain(
  domain: GoogleCloudMcpDomain
): GoogleCloudMcpServerDefinition[] {
  return GOOGLE_CLOUD_MCP_SERVERS.filter((s) => s.domain === domain);
}

/**
 * Instantiates a canvas-ready ToolDefinition from a Google Cloud Remote MCP server catalog entry.
 *
 * Logic Flow:
 * 1. Resolves effective serverUrl by interpolating region if provided and regionalEndpointPattern exists.
 * 2. Prepopulates `mcpConfig` with HTTP transport, google_credentials auth provider, and default OAuth scopes.
 * 3. Configures selectedToolset if provided or uses first toolset as default if defined.
 * 4. Sets tool category to `'google_cloud_mcp'` and type to `'mcp'`.
 *
 * @param server GoogleCloudMcpServerDefinition
 * @param options Optional overrides for region or toolset
 * @returns ToolDefinition
 */
export function createToolDefinitionFromGcpMcpServer(
  server: GoogleCloudMcpServerDefinition,
  options?: {
    region?: string;
    toolset?: string;
    selectedToolset?: string;
  }
): ToolDefinition {
  let effectiveEndpoint = server.defaultEndpoint;

  // Resolve regional endpoint if region option provided and pattern is available
  if (options?.region && server.regionalEndpointPattern) {
    effectiveEndpoint = server.regionalEndpointPattern.replace(/(\{region\}|<REGION>)/gi, options.region);
  }

  const selectedToolset =
    options?.toolset ||
    options?.selectedToolset ||
    (server.toolsets && server.toolsets.length > 0 ? server.toolsets[0] : undefined);

  return {
    id: server.id,
    name: server.name,
    description: server.description,
    type: 'mcp',
    category: 'google_cloud_mcp',
    icon: server.icon || 'Cloud',
    enabled: true,
    mcpConfig: {
      serverName: server.id,
      transport: 'http',
      serverUrl: effectiveEndpoint,
      authProviderType: 'google_credentials',
      region: options?.region,
      selectedToolset,
      launchStage: server.launchStage,
      oauthConfig: {
        scopes: server.defaultScopes || ['https://www.googleapis.com/auth/cloud-platform'],
      },
      exposedTools: selectedToolset ? [selectedToolset] : undefined,
    },
  };
}
