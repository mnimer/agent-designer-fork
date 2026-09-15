import { TriggerType, TriggerConfig, TestPrompt } from '../types';

export interface TriggerCatalogItem {
  id: string;
  type: TriggerType;
  name: string;
  badge: string;
  iconName: 'MessageSquare' | 'Radio' | 'Clock' | 'FlaskConical' | 'Zap' | 'Webhook';
  description: string;
  defaultConfig: TriggerConfig;
}

export interface EventArcCategory {
  id: string;
  name: string;
  serviceName: string;
  events: {
    id: string;
    name: string;
    fullEvent: string;
    description: string;
  }[];
}

export const EVENTARC_CATEGORIES: EventArcCategory[] = [
  {
    id: 'bigquery',
    name: 'BigQuery',
    serviceName: 'bigquery.googleapis.com',
    events: [
      {
        id: 'TableCreate',
        name: 'TableCreate (InsertTable)',
        fullEvent: 'google.cloud.bigquery.v2.TableService.InsertTable',
        description: 'Fires when a new table or view is created in a dataset',
      },
      {
        id: 'TableUpdate',
        name: 'TableUpdate (PatchTable)',
        fullEvent: 'google.cloud.bigquery.v2.TableService.PatchTable',
        description: 'Fires when table metadata or schema is modified',
      },
      {
        id: 'JobComplete',
        name: 'JobComplete (InsertJob)',
        fullEvent: 'google.cloud.bigquery.v2.JobService.InsertJob',
        description: 'Fires upon query or data loading job termination',
      },
      {
        id: 'DatasetCreate',
        name: 'DatasetCreate (InsertDataset)',
        fullEvent: 'google.cloud.bigquery.v2.DatasetService.InsertDataset',
        description: 'Fires when a new BigQuery dataset is provisioned',
      },
    ],
  },
  {
    id: 'storage',
    name: 'Cloud Storage (GCS)',
    serviceName: 'storage.googleapis.com',
    events: [
      {
        id: 'ObjectFinalized',
        name: 'ObjectCreated (finalized)',
        fullEvent: 'google.cloud.storage.object.v1.finalized',
        description: 'Fires when a new object or document is uploaded to GCS bucket',
      },
      {
        id: 'ObjectDeleted',
        name: 'ObjectDeleted',
        fullEvent: 'google.cloud.storage.object.v1.deleted',
        description: 'Fires when an object or file is permanently deleted',
      },
      {
        id: 'ObjectArchived',
        name: 'ObjectArchived',
        fullEvent: 'google.cloud.storage.object.v1.archived',
        description: 'Fires when an object is moved to cold/archive storage tier',
      },
    ],
  },
  {
    id: 'firestore',
    name: 'Cloud Firestore',
    serviceName: 'firestore.googleapis.com',
    events: [
      {
        id: 'DocumentCreated',
        name: 'DocumentCreated',
        fullEvent: 'google.cloud.firestore.document.v1.created',
        description: 'Fires when a new document is written to a Firestore collection',
      },
      {
        id: 'DocumentUpdated',
        name: 'DocumentUpdated',
        fullEvent: 'google.cloud.firestore.document.v1.updated',
        description: 'Fires when an existing document undergoes attribute mutations',
      },
      {
        id: 'DocumentDeleted',
        name: 'DocumentDeleted',
        fullEvent: 'google.cloud.firestore.document.v1.deleted',
        description: 'Fires when a document is removed from Firestore database',
      },
    ],
  },
  {
    id: 'pubsub',
    name: 'Cloud Pub/Sub',
    serviceName: 'pubsub.googleapis.com',
    events: [
      {
        id: 'MessagePublished',
        name: 'MessagePublished',
        fullEvent: 'google.cloud.pubsub.topic.v1.messagePublished',
        description: 'Fires when a message is published to any monitored Pub/Sub topic',
      },
    ],
  },
  {
    id: 'secretmanager',
    name: 'Secret Manager',
    serviceName: 'secretmanager.googleapis.com',
    events: [
      {
        id: 'SecretVersionAdded',
        name: 'SecretVersionAdded',
        fullEvent: 'google.cloud.secretmanager.v1.SecretVersion.Added',
        description: 'Fires when a new secret version or credential is added',
      },
      {
        id: 'SecretVersionDestroyed',
        name: 'SecretVersionDestroyed',
        fullEvent: 'google.cloud.secretmanager.v1.SecretVersion.Destroyed',
        description: 'Fires when a secret version is deactivated or destroyed',
      },
    ],
  },
  {
    id: 'cloudbuild',
    name: 'Cloud Build',
    serviceName: 'cloudbuild.googleapis.com',
    events: [
      {
        id: 'BuildStateChanged',
        name: 'BuildStateChanged',
        fullEvent: 'google.cloud.build.v1.Build.StateChanged',
        description: 'Fires when CI/CD container build changes status (SUCCESS/FAILURE)',
      },
    ],
  },
  {
    id: 'securitycenter',
    name: 'Security Command Center (SCC)',
    serviceName: 'securitycenter.googleapis.com',
    events: [
      {
        id: 'FindingNotification',
        name: 'Finding Notification (SecOps Alert)',
        fullEvent: 'google.cloud.securitycenter.v1.NotificationMessage',
        description: 'Fires when an EDR detection, IOC match, or threat finding is raised by SecOps/SCC',
      },
      {
        id: 'MuteStateChanged',
        name: 'Finding Mute State Changed',
        fullEvent: 'google.cloud.securitycenter.v1.MuteStateChanged',
        description: 'Fires when a security finding status or mute state changes',
      },
    ],
  },
  {
    id: 'dataplex',
    name: 'Dataplex',
    serviceName: 'dataplex.googleapis.com',
    events: [
      {
        id: 'created',
        name: 'Entry Created / Resource Created',
        fullEvent: 'google.cloud.dataplex.v1.created',
        description: 'Fires when a new lake, zone, asset, or metadata entry is created',
      },
      {
        id: 'updated',
        name: 'Entry / Asset Updated',
        fullEvent: 'google.cloud.dataplex.v1.updated',
        description: 'Fires when a data lake asset or schema metadata is updated',
      },
      {
        id: 'deleted',
        name: 'Entry / Asset Deleted',
        fullEvent: 'google.cloud.dataplex.v1.deleted',
        description: 'Fires when a data lake asset or entry is deleted',
      },
    ],
  },
  {
    id: 'audit',
    name: 'Cloud Audit Logs',
    serviceName: 'cloudaudit.googleapis.com',
    events: [
      {
        id: 'AuditLogWritten',
        name: 'Audit Log Written',
        fullEvent: 'google.cloud.audit.log.v1.written',
        description: 'Fires upon administrative or data access security audit event logging',
      },
    ],
  },
];

export const PUBSUB_TOPIC_PRESETS = [
  { topic: 'projects/my-gcp-project/topics/agent-tasks', label: 'Agent Tasks Queue (projects/.../agent-tasks)' },
  { topic: 'projects/my-gcp-project/topics/order-events', label: 'Order Processing (projects/.../order-events)' },
  { topic: 'projects/my-gcp-project/topics/data-stream', label: 'Data Ingestion Stream (projects/.../data-stream)' },
  { topic: 'projects/my-gcp-project/topics/customer-feedback', label: 'Customer Feedback (projects/.../customer-feedback)' },
  { topic: 'projects/my-gcp-project/topics/document-ocr-intake', label: 'Document Intake (projects/.../document-ocr-intake)' },
];

export const GCP_PROJECT_SERVICE_ACCOUNTS = [
  {
    email: 'eventarc-agent-invoker@my-gcp-project.iam.gserviceaccount.com',
    name: 'EventArc Agent Invoker (Default)',
    roles: 'roles/eventarc.eventReceiver, roles/run.invoker',
  },
  {
    email: 'agent-workflow-runner@my-gcp-project.iam.gserviceaccount.com',
    name: 'Agent Workflow Runner SA',
    roles: 'roles/aiplatform.user, roles/run.invoker',
  },
  {
    email: 'cloud-run-agent-sa@my-gcp-project.iam.gserviceaccount.com',
    name: 'Cloud Run Agent Compute SA',
    roles: 'roles/run.admin, roles/secretmanager.secretAccessor',
  },
  {
    email: 'bigquery-agent-invoker@my-gcp-project.iam.gserviceaccount.com',
    name: 'BigQuery Event Ingestion SA',
    roles: 'roles/bigquery.dataViewer, roles/run.invoker',
  },
  {
    email: 'storage-event-handler@my-gcp-project.iam.gserviceaccount.com',
    name: 'Cloud Storage Event Handler SA',
    roles: 'roles/storage.objectViewer, roles/run.invoker',
  },
  {
    email: 'pubsub-eventarc-bridge@my-gcp-project.iam.gserviceaccount.com',
    name: 'Pub/Sub Event Bridge SA',
    roles: 'roles/pubsub.subscriber, roles/run.invoker',
  },
];

export const DEFAULT_MOCK_TEST_PROMPTS: TestPrompt[] = [
  {
    id: 'test_prompt_1',
    name: '',
    prompt: '',
    expectedOutput: '',
    assertionType: 'contains',
  },
];

export const TRIGGER_CATALOG: TriggerCatalogItem[] = [
  {
    id: 'trigger_tester',
    type: 'tester',
    name: 'Test Suite',
    badge: 'QA & CI/CD',
    iconName: 'FlaskConical',
    description: 'Synthetic unit tester and automated test suite runner for validation & regressions.',
    defaultConfig: {
      testPayload: '{\n  "query": "Execute quarterly compliance check on sample documents",\n  "test_mode": true\n}',
      expectedOutput: '{\n  "status": "completed"\n}',
      testPrompts: DEFAULT_MOCK_TEST_PROMPTS,
      runOnCI: true,
    },
  },
  {
    id: 'trigger_chat',
    type: 'chat',
    name: 'Chat Trigger',
    badge: 'Interactive',
    iconName: 'MessageSquare',
    description: 'Conversational end-user interface with streaming responses and session history.',
    defaultConfig: {
      initialMessage: 'Hello! I am your AI agent assistant. How can I help you today?',
      streaming: true,
      sessionMemory: 'in_memory',
    },
  },
  {
    id: 'trigger_pubsub',
    type: 'pubsub',
    name: 'PubSub Invocation',
    badge: 'Event-Driven',
    iconName: 'Radio',
    description: 'Google Cloud Pub/Sub topic listener triggered by asynchronous event queues.',
    defaultConfig: {
      topic: 'projects/my-gcp-project/topics/agent-tasks',
      subscription: 'agent-tasks-sub-auto',
      autoRegisterSubscription: true,
      ackDeadlineSeconds: 60,
      messageFormat: 'json',
    },
  },
  {
    id: 'trigger_scheduled',
    type: 'scheduled',
    name: 'Schedule Trigger',
    badge: 'Cron Timer',
    iconName: 'Clock',
    description: 'Cloud Scheduler cron cadence for recurring autonomous batch agent execution.',
    defaultConfig: {
      cronExpression: '0 9 * * 1-5',
      timezone: 'America/New_York',
      scheduleInterval: 'Weekdays @ 9AM',
      scheduledPrompt: 'Execute scheduled batch processing and workflow execution.',
      retryCount: 3,
    },
  },
  {
    id: 'trigger_webhook',
    type: 'webhook',
    name: 'Webhook Trigger',
    badge: 'HTTP Endpoint',
    iconName: 'Webhook',
    description: 'Exposes an HTTP REST/JSON webhook endpoint to invoke the agent from external systems.',
    defaultConfig: {
      webhookPath: '/webhook',
      httpMethod: 'POST',
      authType: 'bearer_token',
      secretHeaderName: 'X-Webhook-Secret',
      payloadDescription: 'JSON object containing event payload and context query',
    },
  },
  {
    id: 'trigger_eventarc',
    type: 'eventarc',
    name: 'EventArc Trigger',
    badge: 'Cloud Events',
    iconName: 'Zap',
    description: 'GCP EventArc routing events across 90+ Google Cloud services (e.g. BigQuery, Storage, Firestore).',
    defaultConfig: {
      eventarcCategory: '',
      eventarcEvent: '',
      eventarcServiceName: '',
      eventarcServiceAccount: '',
      eventarcRegion: '',
    },
  },
];

export const CRON_PRESETS = [
  { label: 'Every 5 Minutes', cron: '*/5 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Daily @ Midnight', cron: '0 0 * * *' },
  { label: 'Weekdays @ 9AM', cron: '0 9 * * 1-5' },
];

export const DEFAULT_MOCK_TEST_SCENARIOS = DEFAULT_MOCK_TEST_PROMPTS.map((p) => ({
  id: p.id,
  name: p.name,
  inputQuery: p.prompt,
  expectedOutputPattern: p.expectedOutput,
}));
