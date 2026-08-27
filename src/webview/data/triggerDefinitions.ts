/**
 * Trigger Definitions & Cloud Event Catalogs
 *
 * Pre-defined configurations and GCP EventArc / PubSub / Scheduler presets
 * for workflow trigger entry points.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { TriggerKind, TestSuiteScenario } from '../../shared/types';

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
];

export const PUBSUB_TOPIC_PRESETS = [
  { topic: 'projects/my-gcp-project/topics/agent-tasks', label: 'Agent Tasks Queue (projects/.../agent-tasks)' },
  { topic: 'projects/my-gcp-project/topics/order-events', label: 'Order Processing (projects/.../order-events)' },
  { topic: 'projects/my-gcp-project/topics/data-stream', label: 'Data Ingestion Stream (projects/.../data-stream)' },
  { topic: 'projects/my-gcp-project/topics/customer-feedback', label: 'Customer Feedback (projects/.../customer-feedback)' },
];

export const CRON_PRESETS = [
  { label: 'Weekdays @ 9AM', cron: '0 9 * * 1-5', desc: 'Monday through Friday at 09:00' },
  { label: 'Daily @ 9AM', cron: '0 9 * * *', desc: 'Every day at 09:00' },
  { label: 'Hourly', cron: '0 * * * *', desc: 'At minute 0 of every hour' },
  { label: 'Every 15m', cron: '*/15 * * * *', desc: 'Every 15 minutes' },
  { label: 'Every 30m', cron: '*/30 * * * *', desc: 'Every 30 minutes' },
  { label: 'Weekly (Sun @ 8AM)', cron: '0 8 * * 0', desc: 'Every Sunday morning at 08:00' },
];

export const DEFAULT_MOCK_TEST_SCENARIOS: TestSuiteScenario[] = [
  {
    id: 'test_scenario_1',
    name: 'Primary Task Execution',
    inputQuery: 'Analyze the system performance metrics and report bottlenecks.',
    expectedOutputPattern: 'bottlenecks',
  },
  {
    id: 'test_scenario_2',
    name: 'Structured JSON Extraction',
    inputQuery: 'Extract the order details from customer message #10294.',
    expectedOutputPattern: 'orderId',
  },
];
