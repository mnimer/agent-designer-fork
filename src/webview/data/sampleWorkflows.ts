/**
 * Visual Agent Designer Sample Workflows Catalog
 *
 * Provides ready-to-load reference sample architectures (.agent)
 * for the visual designer canvas and templates gallery.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import { Node, Edge } from '@xyflow/react';
import { SampleWorkflowDefinition, AgentData, TriggerData } from '../types';
import { AVAILABLE_TOOLS } from './defaultTools';

export const SAMPLE_COMPANY_VERIFIER: SampleWorkflowDefinition = {
  id: 'company_verifier',
  name: 'Company Verifier & Entity Classifier',
  filename: 'company_verifier.agent',
  category: 'Enterprise Integration & Identity',
  badge: 'Pub/Sub + Search Grounding',
  description: 'Automated business entity verification. Listens to Pub/Sub registration events, queries Google Search Grounding and Web Page Reader for corporate presence and operational status, and uses prompt reasoning to classify entity legitimacy and category (restaurant, machine shop, retail, medical, tech, etc.).',
  features: [
    'Cloud Pub/Sub Event Ingestion trigger with custom subscription',
    'Google Search Grounding for entity verification',
    'Web Page Reader for official domain and filing inspection',
    'Taxonomy classifier: restaurant, machine shop, retail, healthcare, etc.',
    'Structured JSON verification report with confidence & risk indicators',
  ],
  nodesCount: 2,
  toolsCount: 2,
  triggerType: 'pubsub',
  iconName: 'Building2',
  color: 'amber',
  nodes: [
    {
      id: 'trigger_pubsub_company',
      type: 'triggerNode',
      position: { x: 80, y: 160 },
      data: {
        id: 'trigger_pubsub_company',
        label: 'Pub/Sub: Company Registrations',
        triggerType: 'pubsub',
        description: 'Ingests real-time vendor and merchant registration events from GCP Pub/Sub.',
        config: {
          topic: 'projects/enterprise-ops/topics/company-registration-events',
          subscription: 'sub-company-verifier-v1',
          messageFormat: 'json',
          ackDeadlineSeconds: 60,
          autoRegisterSubscription: true,
        },
      } as TriggerData,
    },
    {
      id: 'agent_company_verifier',
      type: 'agentNode',
      position: { x: 480, y: 120 },
      data: {
        id: 'agent_company_verifier',
        label: 'Company Verifier & Classifier',
        role: 'Verifies business legitimacy against Google Search Grounding and categorizes business type (restaurant, machine shop, retail, medical, tech, etc.).',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        maxIterations: 8,
        agentKind: 'standard',
        systemPrompt: `You are an automated Business Verification and Entity Classifier Agent.

When a company registration payload is received:
1. Use Google Search Grounding to verify recent web footprint, official corporate filings, or business directory listings.
2. Cross-verify if the place is marked as OPERATIONAL, permanently closed, or unrecognized.
3. If search returns ambiguous results, use the Web Page Reader to inspect official domain pages.
4. Analyze the place details to answer two primary questions:
   a. Is this a genuine, real, and operating business? (Status: "VERIFIED" | "UNVERIFIED" | "SUSPICIOUS")
   b. What specific business category does it belong to? Classify into standardized taxonomy:
      - "restaurant" (cafes, diners, bars, bakeries, food service)
      - "machine shop" (CNC machining, metal fabrication, tooling, industrial manufacturing)
      - "retail" (apparel, electronics, grocery, convenience, specialty stores)
      - "auto repair & service" (mechanics, body shops, dealerships)
      - "healthcare & medical clinic" (dental, physician practices, clinics, therapy)
      - "logistics & warehousing" (trucking, freight, distribution centers)
      - "technology & software" (IT services, software development, data centers)
      - "professional services" (legal, accounting, consulting, architectural)
5. Return a structured JSON verification report with confidence score (0.00 - 1.00), verified physical address, operational status, primary category, secondary subcategories, and any fraud risk flags.`,
        tools: [
          AVAILABLE_TOOLS.find(t => t.id === 'tool_google_search') || AVAILABLE_TOOLS[0], // Google Search Grounding
          AVAILABLE_TOOLS.find(t => t.id === 'builtin_load_web_page') || AVAILABLE_TOOLS[2], // Web Page Reader
        ],
        subAgents: [],
        subAgentPattern: 'parallel',
        memoryType: 'none',
        memoryConfig: { type: 'none' },
        outputFormat: 'json_schema',
        isStartNode: true,
        colorTheme: 'amber',
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge_pubsub_to_verifier',
      source: 'trigger_pubsub_company',
      target: 'agent_company_verifier',
      animated: true,
      style: { stroke: '#f59e0b', strokeWidth: 2 },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './company_verifier_agent',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'cloud_run',
  },
  testPrompts: [
    {
      id: 'test_1',
      name: 'Verify Precision Machine Shop',
      prompt: '{"business_name": "Apex Precision CNC & Tooling LLC", "address": "4820 Industrial Blvd, Columbus, OH 43228", "phone": "+1-614-555-0192"}',
      expectedOutput: 'Should return status: VERIFIED and category: machine shop',
      assertionType: 'json_schema',
    },
    {
      id: 'test_2',
      name: 'Verify Italian Trattoria Restaurant',
      prompt: '{"business_name": "Bella Vista Artisan Pasta", "address": "142 N High St, Columbus, OH 43215", "phone": "+1-614-555-0844"}',
      expectedOutput: 'Should return status: VERIFIED and category: restaurant',
      assertionType: 'json_schema',
    },
  ],
};

export const SAMPLE_PROCUREMENT_REQUEST: SampleWorkflowDefinition = {
  id: 'procurement_request',
  name: 'Procurement Negotiation & Adjudication',
  filename: 'procurement_request.agent',
  category: 'Multi-Agent Negotiation & Governance',
  badge: '3-Agent Debate & Judge',
  description: 'Multi-agent product onboarding negotiation. Field Sales Rep (FSR) pitches consumer demand; Procurement Agent audits margins, MOQ, and holding risk; Executive Judge listens to 3 rounds of back-and-forth debate and renders a final binding decision.',
  features: [
    '3 Specialized Cooperating & Adversarial Agents',
    'FSR Champion Agent: pitches sales velocity, customer demand, and store competitive edge',
    'Procurement Officer Agent: audits gross margins %, MOQ cash outlay, and warehouse logistics',
    'Executive Judge Agent: evaluates 3 rounds of structured debate and renders final ruling',
    'Dual tools: Python Code Sandbox + Market Research Grounding',
  ],
  nodesCount: 4,
  toolsCount: 3,
  triggerType: 'chat',
  iconName: 'Scale',
  color: 'blue',
  nodes: [
    {
      id: 'trigger_product_proposal',
      type: 'triggerNode',
      position: { x: 60, y: 220 },
      data: {
        id: 'trigger_product_proposal',
        label: 'Proposal: New SKU Onboarding',
        triggerType: 'chat',
        description: 'Ingests new product onboarding proposals with vendor costs, MSRP, MOQ, and store sales projections.',
        config: {
          initialMessage: 'New Product Proposal Submitted:\nProduct: "UltraShield NanoScreen Pro"\nVendor: NanoArmor Global\nUnit Cost: $3.45 | Suggested MSRP: $19.99 (82.7% Gross Margin)\nMOQ: 5,000 units ($17,250 commitment)\nLead Time: 21 days\nFSR Summary: Surging customer inquiries in 45 retail stores, competitors carry similar line with 80%+ sell-through.',
          streaming: true,
          sessionMemory: 'in_memory',
        },
      } as TriggerData,
    },
    {
      id: 'agent_fsr_rep',
      type: 'agentNode',
      position: { x: 380, y: 80 },
      data: {
        id: 'agent_fsr_rep',
        label: 'Field Sales Rep (FSR)',
        role: 'Requests and champions carrying new products, presenting retail consumer demand, shopper feedback, and store competitive edge.',
        model: 'gemini-3.7-flash',
        temperature: 0.7,
        maxIterations: 10,
        agentKind: 'standard',
        systemPrompt: `You are the Field Sales Representative (FSR) advocating for stocking a new product across regional retail stores.
Your mission is to passionately and convincingly argue why the company should onboard this SKU:
- Present real shopper demand trends, customer walk-in inquiries, and store merchandising appeal.
- Highlight competitive urgency: explain what competitors are stocking and winning sales with.
- Provide practical sell-through forecasts and suggest promotional store bundles to accelerate initial velocity.
- In each round of the 3-turn debate, directly counter Procurement's objections regarding MOQ risk or lead time by offering risk mitigation (e.g. store pre-commitments, marketing co-op dollars).`,
        tools: [
          AVAILABLE_TOOLS.find(t => t.id === 'tool_google_search') || AVAILABLE_TOOLS[1], // Google Search Grounding
        ],
        subAgents: [],
        subAgentPattern: 'parallel',
        memoryType: 'none',
        memoryConfig: { type: 'none' },
        outputFormat: 'text',
        isStartNode: true,
        colorTheme: 'blue',
      } as AgentData,
    },
    {
      id: 'agent_procurement_officer',
      type: 'agentNode',
      position: { x: 380, y: 360 },
      data: {
        id: 'agent_procurement_officer',
        label: 'Procurement & Margin Analyst',
        role: 'Evaluates vendor gross margin %, MOQ inventory liability, distribution logistics, and holding costs.',
        model: 'gemini-3.7-flash',
        temperature: 0.2,
        maxIterations: 10,
        agentKind: 'standard',
        systemPrompt: `You are the Senior Procurement & Financial Inventory Officer.
Your mandate is financial rigor and risk minimization:
- Use the "Python Code Sandbox" tool to calculate net margin %, total cash commitment (MOQ * unit_cost), inventory carrying cost, and break-even unit threshold.
- Scrutinize supplier reliability, lead-time volatility, warehouse shelf-space requirements, and return/defect terms.
- Challenge the FSR's overly optimistic sales assumptions with conservative sell-through models.
- Push for supplier concessions: Net-60 payment terms, vendor guaranteed markdown subsidies, or reduced initial MOQ trial batches.
- Engage in a rigorous 3-turn debate with the FSR before presenting your financial audit to the Executive Judge.`,
        tools: [
          AVAILABLE_TOOLS.find(t => t.id === 'tool_code_interpreter') || AVAILABLE_TOOLS[5], // Python Code Sandbox
          AVAILABLE_TOOLS.find(t => t.id === 'builtin_vertex_ai_search') || AVAILABLE_TOOLS[1], // Vertex AI Search
        ],
        subAgents: [],
        subAgentPattern: 'parallel',
        memoryType: 'none',
        memoryConfig: { type: 'none' },
        outputFormat: 'text',
        isStartNode: false,
        colorTheme: 'purple',
      } as AgentData,
    },
    {
      id: 'agent_executive_judge',
      type: 'agentNode',
      position: { x: 800, y: 220 },
      data: {
        id: 'agent_executive_judge',
        label: 'Executive Procurement Judge',
        role: 'Listens to the 3-round deliberation between FSR and Procurement, weighs revenue upside against financial/logistics risk, and makes a binding decision.',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        maxIterations: 8,
        agentKind: 'standard',
        isEvaluator: true,
        systemPrompt: `You are the Executive Procurement Judge and Final Commercial Arbiter.

You carefully observe and evaluate the full 3-round exchange between the Field Sales Representative (FSR) and the Procurement & Margin Specialist.

After evaluating both sides:
1. Objectively weigh the commercial sales revenue upside, customer demand, and store competitive positioning against the gross margin sustainability, MOQ cash liability, and inventory obsolescence risks.
2. Render a definitive, binding executive decision:
   - "APPROVED": Authorize full purchase order under proposed terms.
   - "REJECTED": Insufficient margin or excessive inventory risk; do not carry.
   - "CONDITIONAL_PILOT": Authorize a controlled 60-day trial in 10 flagship retail stores with a reduced test batch (e.g. 1,000 units) and mandatory supplier markdown protection agreement.
3. Output a structured JSON verdict including:
   - decision ("APPROVED" | "REJECTED" | "CONDITIONAL_PILOT")
   - executive_summary (2-3 sentences)
   - key_arguments_favored (why FSR or Procurement won key points)
   - required_supplier_stipulations (payment terms, return guarantees)
   - 90_day_success_kpis (target sell-through %, re-order threshold)`,
        tools: [
          AVAILABLE_TOOLS[3], // Python Code Sandbox
        ],
        subAgents: [],
        subAgentPattern: 'parallel',
        memoryType: 'none',
        memoryConfig: { type: 'none' },
        outputFormat: 'json_schema',
        isStartNode: false,
        colorTheme: 'emerald',
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge_trigger_to_fsr',
      source: 'trigger_product_proposal',
      target: 'agent_fsr_rep',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: 'edge_trigger_to_procurement',
      source: 'trigger_product_proposal',
      target: 'agent_procurement_officer',
      animated: true,
      style: { stroke: '#a855f7', strokeWidth: 2 },
    },
    {
      id: 'edge_fsr_to_procurement_debate',
      source: 'agent_fsr_rep',
      target: 'agent_procurement_officer',
      label: 'Debate: Sales Demand & Pitch',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: '4,4' },
    },
    {
      id: 'edge_procurement_to_fsr_debate',
      source: 'agent_procurement_officer',
      target: 'agent_fsr_rep',
      label: 'Debate: Margin & MOQ Pushback',
      animated: true,
      style: { stroke: '#a855f7', strokeWidth: 1.5, strokeDasharray: '4,4' },
    },
    {
      id: 'edge_fsr_to_judge',
      source: 'agent_fsr_rep',
      target: 'agent_executive_judge',
      label: 'Sales Case Submission',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 },
    },
    {
      id: 'edge_procurement_to_judge',
      source: 'agent_procurement_officer',
      target: 'agent_executive_judge',
      label: 'Financial Audit Submission',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './procurement_negotiation_agent',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'agent_engine',
  },
  testPrompts: [
    {
      id: 'test_1',
      name: 'High Margin Accessory Proposal',
      prompt: '{"product": "UltraShield NanoScreen Pro", "cost": 3.45, "msrp": 19.99, "moq": 5000}',
      expectedOutput: 'Should execute 3-turn debate between FSR & Procurement and reach conditional pilot or approval.',
      assertionType: 'json_schema',
    },
    {
      id: 'test_2',
      name: 'Low Margin High MOQ Hardware Proposal',
      prompt: '{"product": "Budget BT Speaker", "cost": 18.50, "msrp": 21.99, "moq": 10000}',
      expectedOutput: 'Procurement should heavily reject due to slim 15% margin and $185k cash outlay; Judge should confirm REJECTED.',
      assertionType: 'json_schema',
    },
  ],
};

export const SAMPLE_CYBER_GUARDIAN: SampleWorkflowDefinition = {
  id: 'cyber_guardian',
  name: 'Cyber Guardian SecOps Multi-Agent',
  filename: 'cyber_guardian.agent',
  category: 'Security Operations & Forensics',
  badge: 'Multi-Agent ADK + BigQuery',
  description: 'Autonomous multi-agent cybersecurity incident triage, forensics investigation, threat intelligence, and response remediation workflow based on Google ADK.',
  features: [
    'Central SecOps orchestrator with 5-step classification and conditional branch routing',
    'Triage Specialist with BigQuery 24h incident deduplication and asset inventory enrichment',
    'Threat Intel Specialist querying threat intelligence knowledge base for IOC reputation',
    'Forensics & Investigation Specialist correlating process trees and network egress logs',
    'Response Specialist querying playbooks and enforcing Human-in-the-Loop (HITL) approval gates',
    'End-to-end incident logging to BigQuery incident_management table',
  ],
  nodesCount: 6,
  toolsCount: 6,
  triggerType: 'eventarc',
  iconName: 'Workflow',
  color: 'red',
  nodes: [
    {
      id: 'node-trigger-secops',
      type: 'triggerNode',
      position: { x: 80, y: 240 },
      data: {
        id: 'node-trigger-secops',
        label: 'SecOps Alert Inbound',
        description: 'Ingests raw security alerts including EDR detections, IOC matches, and phishing reports via Eventarc.',
        triggerType: 'eventarc',
        config: {
          eventarcCategory: 'securitycenter',
          eventarcEvent: 'FindingNotification',
          eventarcServiceName: 'securitycenter.googleapis.com',
          eventarcServiceAccount: 'eventarc-agent-invoker@my-gcp-project.iam.gserviceaccount.com',
          eventarcRegion: 'us-central1',
          testScenarios: [
            {
              id: 'scenario-edr-powershell',
              name: 'EDR Detection - Malicious Encoded PowerShell',
              inputQuery: 'Falcon_Detection: Hostname: winsrv0221, User: SYSTEM, Process: powershell.exe, Command: powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAnAGgAdAB0AHAAOgAvAC8AZQB4AGEAbQBwAGwAZQAuAGMAbwBtAC8AbQBhAGwAdwBhAHIAZQAuAHAAcwAxACcAKQA=, Parent: cmd.exe, Timestamp: 2024-05-18T10:00:00Z',
              expectedOutputPattern: 'powershell',
            },
            {
              id: 'scenario-ioc-lockbit',
              name: 'IOC Match - Known Lockbit C2 Network Traffic',
              inputQuery: 'IOC_Match: Hostname: winws1045, User: j.doe, IP: 198.51.100.42, Timestamp: 2024-05-18T11:30:00Z, Details: Connection detected to known malicious IP associated with LockbitC2.',
              expectedOutputPattern: 'LockbitC2',
            },
            {
              id: 'scenario-phishing-invoice',
              name: 'Phishing Email Report - Suspicious Executable Attachment',
              inputQuery: 'Subject: Urgent: Invoice Overdue, From: billing@scanned-invoice-attach.org, To: m.chen@company.com, Date: 2024-05-18T09:15:00Z, SMTP_IP: 203.0.113.77, Attachment: Invoice_May2024.pdf.exe',
              expectedOutputPattern: 'phishing',
            },
          ],
        },
      } as TriggerData,
    },
    {
      id: 'node-agent-orchestrator',
      type: 'agentNode',
      position: { x: 480, y: 240 },
      data: {
        id: 'node-agent-orchestrator',
        label: 'Cyber Guardian Orchestrator',
        role: 'Central SecOps coordinator orchestrating alert classification, deduplication, threat intelligence, forensics, and remediation',
        model: 'gemini-3.7-flash',
        temperature: 0.2,
        agentKind: 'standard',
        subAgentPattern: 'coordinator',
        isStartNode: true,
        isOrchestrator: true,
        systemPrompt: `You are the Cyber Guardian Central SecOps Orchestrator. Your role is to coordinate end-to-end incident response by delegating tasks to specialized sub-agents.

### WORKFLOW STEPS:
Step 1: Parse & Classify Inbound Alert (IOC_MATCH, EDR_DETECTION, PHISHING_EMAIL, UNCATEGORIZED)
Step 2: Triage & Deduplication (ALWAYS FIRST via triage_agent; terminate if is_duplicate)
Step 3: Conditional Branch Delegation (Threat Intel -> Investigation -> Response)
Step 4: Human-in-the-Loop (HITL) Gatekeeper (Flag requires_approval actions for analyst sign-off)
Step 5: Incident Logging & Final Synthesis (Call create_incident_tool and synthesize brief)`,
        tools: [
          {
            id: 'tool-create-incident',
            name: 'create_incident_tool',
            type: 'custom',
            description: 'Records the final incident record into the BigQuery incident_management table.',
            toolMode: 'local_file',
            sourceFile: './tools/incident_tools.py',
            functionName: 'create_incident_tool',
            parameters: {
              primary_host: 'Target hostname involved in the alert',
              alert_type: 'Classified alert category',
              summary: 'Concise executive summary of findings',
              status: 'Incident status',
            },
          },
        ],
        subAgents: [
          { agentId: 'node-agent-triage', name: 'Triage Specialist', role: 'Deduplicates incidents in past 24h', delegationType: 'coordinator' },
          { agentId: 'node-agent-threatintel', name: 'Threat Intel Specialist', role: 'Evaluates maliciousness and confidence of IOCs', delegationType: 'coordinator' },
          { agentId: 'node-agent-investigation', name: 'Investigation Specialist', role: 'Analyzes process execution trees and network egress', delegationType: 'coordinator' },
          { agentId: 'node-agent-response', name: 'Response Specialist', role: 'Selects response playbooks and flags HITL gates', delegationType: 'coordinator' },
        ],
      } as AgentData,
    },
    {
      id: 'node-agent-triage',
      type: 'agentNode',
      position: { x: 960, y: 48 },
      data: {
        id: 'node-agent-triage',
        label: 'Triage Specialist',
        role: 'Initial Alert Assessment & Deduplication',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Triage Specialist Agent. Query BigQuery incident_management for 24h duplicates and enrich asset ownership and criticality.',
        tools: [
          {
            id: 'tool-triage-query',
            name: 'triage_query_tool',
            type: 'custom',
            description: 'Queries BigQuery incident_management for duplicate alerts within 24 hours and asset_inventory for owner and business criticality.',
            toolMode: 'local_file',
            sourceFile: './tools/triage_tools.py',
            functionName: 'triage_query_tool',
            parameters: { hostname: 'Target hostname from alert', alert_type: 'Alert classification' },
          },
        ],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-threatintel',
      type: 'agentNode',
      position: { x: 960, y: 208 },
      data: {
        id: 'node-agent-threatintel',
        label: 'Threat Intel Specialist',
        role: 'IOC Reputation & Threat Intelligence Analysis',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Threat Intelligence Specialist Agent. Query BigQuery threat_intelligence_kb for reputation and confidence on extracted indicators.',
        tools: [
          {
            id: 'tool-threatintel-query',
            name: 'threat_intel_query_tool',
            type: 'custom',
            description: 'Queries BigQuery threat_intelligence_kb to retrieve maliciousness, threat actor attribution, and confidence ratings.',
            toolMode: 'local_file',
            sourceFile: './tools/threat_intel_tools.py',
            functionName: 'threat_intel_query_tool',
            parameters: { indicators: 'Comma-separated list of IP addresses, domains, or hashes' },
          },
        ],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-investigation',
      type: 'agentNode',
      position: { x: 960, y: 368 },
      data: {
        id: 'node-agent-investigation',
        label: 'Investigation Specialist',
        role: 'Endpoint Forensics & Log Correlation',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Forensics & Investigation Specialist Agent. Query endpoint_process_events and network_connection_log to reconstruct timelines.',
        tools: [
          {
            id: 'tool-investigation-query',
            name: 'investigation_query_tool',
            type: 'custom',
            description: 'Queries BigQuery endpoint_process_events and network_connection_log to correlate process trees and outbound connections.',
            toolMode: 'local_file',
            sourceFile: './tools/investigation_tools.py',
            functionName: 'investigation_query_tool',
            parameters: {
              hostname: 'Target endpoint hostname',
              alert_type: 'Alert classification',
              parent_process: 'Parent process name',
              destination_ip: 'Egress destination IP',
            },
          },
        ],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-response',
      type: 'agentNode',
      position: { x: 960, y: 528 },
      data: {
        id: 'node-agent-response',
        label: 'Response Specialist',
        role: 'Playbook Remediation & Containment',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Incident Response & Remediation Specialist Agent. Query response_playbooks and simulate containment actions.',
        tools: [
          {
            id: 'tool-get-playbook',
            name: 'get_playbook_tool',
            type: 'custom',
            description: 'Queries BigQuery response_playbooks for recommended containment actions and HITL approval flags.',
            toolMode: 'local_file',
            sourceFile: './tools/response_tools.py',
            functionName: 'get_playbook_tool',
            parameters: { triggering_condition: 'Identified threat condition or attack pattern' },
          },
          {
            id: 'tool-response-execution',
            name: 'response_execution_tool',
            type: 'custom',
            description: 'Simulates surgical containment actions (e.g. isolate-host, block-ip).',
            toolMode: 'local_file',
            sourceFile: './tools/response_tools.py',
            functionName: 'response_execution_tool',
            parameters: { action_command: 'Command to execute', target: 'Target identifier' },
          },
        ],
        subAgents: [],
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge-trigger-to-orchestrator',
      source: 'node-trigger-secops',
      target: 'node-agent-orchestrator',
      style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
    },
    {
      id: 'edge-orchestrator-to-triage',
      source: 'node-agent-orchestrator',
      target: 'node-agent-triage',
      label: 'Triage & Deduplication',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: 'edge-orchestrator-to-threatintel',
      source: 'node-agent-orchestrator',
      target: 'node-agent-threatintel',
      label: 'IOC Reputation Lookup',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: 'edge-orchestrator-to-investigation',
      source: 'node-agent-orchestrator',
      target: 'node-agent-investigation',
      label: 'Forensics Analysis',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: 'edge-orchestrator-to-response',
      source: 'node-agent-orchestrator',
      target: 'node-agent-response',
      label: 'Remediation Playbook',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './cyber_guardian_agent',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'agent_engine',
  },
  testPrompts: [
    {
      id: 'test_1',
      name: 'EDR Detection - Malicious Encoded PowerShell',
      prompt: 'Falcon_Detection: Hostname: winsrv0221, User: SYSTEM, Process: powershell.exe, Command: powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAnAGgAdAB0AHAAOgAvAC8AZQB4AGEAbQBwAGwAZQAuAGMAbwBtAC8AbQBhAGwAdwBhAHIAZQAuAHAAcwAxACcAKQA=, Parent: cmd.exe, Timestamp: 2024-05-18T10:00:00Z',
      expectedOutput: 'Classify as EDR_DETECTION, triage on winsrv0221, investigate process ancestry, and draft containment plan.',
      assertionType: 'contains',
    },
    {
      id: 'test_2',
      name: 'IOC Match - Known Lockbit C2 Network Traffic',
      prompt: 'IOC_Match: Hostname: winws1045, User: j.doe, IP: 198.51.100.42, Timestamp: 2024-05-18T11:30:00Z, Details: Connection detected to known malicious IP associated with LockbitC2.',
      expectedOutput: 'Triage, query threat intel for 198.51.100.42, correlate host connections, and isolate or block IP with HITL approval.',
      assertionType: 'contains',
    },
    {
      id: 'test_3',
      name: 'Phishing Email Report - Suspicious Executable Attachment',
      prompt: 'Subject: Urgent: Invoice Overdue, From: billing@scanned-invoice-attach.org, To: m.chen@company.com, Date: 2024-05-18T09:15:00Z, SMTP_IP: 203.0.113.77, Attachment: Invoice_May2024.pdf.exe',
      expectedOutput: 'Classify as PHISHING_EMAIL, look up domain/IP reputation, investigate attachment execution, and trigger phishing playbook.',
      assertionType: 'contains',
    },
  ],
};

export const SAMPLE_CUSTOMER_SUPPORT: SampleWorkflowDefinition = {
  id: 'customer_support',
  name: 'Customer Support & Escalation Router',
  filename: 'customer_support.agent',
  category: 'Conversational & Customer Experience',
  badge: 'Multi-Turn + Search Grounding',
  description: 'Interactive multi-turn conversational agent with Google Search grounding, knowledge base retrieval, and tier-2 escalation routing for billing, technical issues, and human handoff.',
  features: ['Multi-Turn Chat', 'Google Search Grounding', 'Escalation Routing', 'Automated Tests'],
  nodesCount: 5,
  toolsCount: 3,
  triggerType: 'chat',
  iconName: 'Headphones',
  color: 'blue',
  nodes: [
    {
      id: 'node-trigger-support',
      type: 'triggerNode',
      position: { x: 80, y: 240 },
      data: {
        id: 'node-trigger-support',
        label: 'Inbound Customer Chat',
        description: 'Receives customer inquiries, messages, and escalation requests.',
        triggerType: 'chat',
        triggerKind: 'chat',
        config: {
          initialMessage: 'Hello! I am your Customer Support AI Assistant. How can I assist you today?',
          streaming: true,
          sessionMemory: 'in_memory',
          testScenarios: [
            {
              id: 'scenario-refund',
              name: 'Billing Refund Request',
              prompt: 'I was accidentally billed twice for my Enterprise subscription this month. Can I get a refund?',
              expectedOutput: 'billing specialist',
              assertionType: 'contains',
            },
            {
              id: 'scenario-tech-outage',
              name: 'API Service Outage Report',
              prompt: 'Our production workload is receiving 504 Gateway Timeouts from your US-Central cluster.',
              expectedOutput: 'technical support',
              assertionType: 'contains',
            },
            {
              id: 'scenario-human-handoff',
              name: 'VIP Executive Escalation',
              prompt: 'This is the VP of Infrastructure. I need immediate live assistance with our contract SLA.',
              expectedOutput: 'human specialist',
              assertionType: 'contains',
            },
          ],
        },
      } as TriggerData,
    },
    {
      id: 'node-agent-support-root',
      type: 'agentNode',
      position: { x: 440, y: 200 },
      data: {
        id: 'node-agent-support-root',
        label: 'Frontline Support Specialist',
        role: 'Customer Inquiries & Intent Classification',
        model: 'gemini-3.7-flash',
        temperature: 0.3,
        agentKind: 'router',
        isStartNode: true,
        systemPrompt: `You are the Frontline Customer Support Specialist.
Greet the customer courteously and resolve general questions using Google Search and the company knowledge base.
Route specialized queries to the appropriate sub-agent:
- Billing & invoice inquiries -> Billing Specialist
- Technical glitches & API failures -> Technical Specialist
- VIP complaints or direct requests -> Human Specialist`,
        tools: [
          AVAILABLE_TOOLS[0], // Google Search Grounding
          AVAILABLE_TOOLS[1], // Web Page Reader
          {
            id: 'tool-kb-search',
            name: 'kb_search_tool',
            type: 'custom',
            description: 'Queries internal support articles, FAQs, and SLA documentation.',
            parameters: { query: 'Search query string' },
          },
        ],
        subAgents: [
          { agentId: 'node-agent-billing', name: 'Billing Specialist', role: 'Handles charges, refunds, and upgrades', delegationType: 'router' },
          { agentId: 'node-agent-technical', name: 'Technical Support', role: 'Diagnoses API errors and infrastructure', delegationType: 'router' },
          { agentId: 'node-agent-human', name: 'Human Handoff', role: 'Transfers to a human specialist', delegationType: 'router' },
        ],
      } as AgentData,
    },
    {
      id: 'node-agent-billing',
      type: 'agentNode',
      position: { x: 920, y: 48 },
      data: {
        id: 'node-agent-billing',
        label: 'Billing Specialist',
        role: 'Invoices, Refunds & Subscriptions',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Billing Specialist Agent. Verify account payment receipts, calculate refund amounts, and format refund requests according to finance guidelines.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-technical',
      type: 'agentNode',
      position: { x: 920, y: 224 },
      data: {
        id: 'node-agent-technical',
        label: 'Technical Support',
        role: 'API Diagnostics & Error Logs',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Technical Support Specialist Agent. Correlate HTTP error codes, check cluster status health endpoints, and guide customers through remediation.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-human',
      type: 'agentNode',
      position: { x: 920, y: 400 },
      data: {
        id: 'node-agent-human',
        label: 'Human Handoff',
        role: 'Escalation to Live Representative',
        model: 'gemini-3.7-flash',
        temperature: 0.2,
        agentKind: 'standard',
        systemPrompt: 'You are the Human Escalation Agent. Summarize the conversation context, generate an escalation ticket, and assign high-priority SLA tags for human review.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge-support-trigger-to-root',
      source: 'node-trigger-support',
      target: 'node-agent-support-root',
      style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
    },
    {
      id: 'edge-support-to-billing',
      source: 'node-agent-support-root',
      target: 'node-agent-billing',
      label: 'Billing Route',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: 'edge-support-to-technical',
      source: 'node-agent-support-root',
      target: 'node-agent-technical',
      label: 'Technical Route',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    },
    {
      id: 'edge-support-to-human',
      source: 'node-agent-support-root',
      target: 'node-agent-human',
      label: 'Escalation Route',
      style: { stroke: '#ef4444', strokeWidth: 2 },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './customer_support_agent/',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'agent_engine',
  },
  testPrompts: [
    {
      id: 'test_support_1',
      name: 'Billing Refund Verification',
      prompt: 'I was accidentally billed twice for my Enterprise subscription this month. Can I get a refund?',
      expectedOutput: 'billing specialist',
      assertionType: 'contains',
    },
    {
      id: 'test_support_2',
      name: 'Service Outage Diagnosis',
      prompt: 'Our production workload is receiving 504 Gateway Timeouts from your US-Central cluster.',
      expectedOutput: 'technical support',
      assertionType: 'contains',
    },
  ],
};

export const SAMPLE_FINANCIAL_ANALYST: SampleWorkflowDefinition = {
  id: 'financial_analyst',
  name: 'Financial Research Analyst & Synthesizer',
  filename: 'financial_analyst.agent',
  category: 'Financial & Quantitative Analysis',
  badge: 'Parallel Fan-Out + Synthesis',
  description: 'Parallel fan-out multi-agent research workflow gathering SEC filings, quarterly earnings transcripts, and market sentiment, synthesized into comprehensive equity research reports.',
  features: ['Parallel Sub-Agents', 'SEC Filing Extraction', 'Sentiment Analysis', 'Executive Synthesis'],
  nodesCount: 6,
  toolsCount: 3,
  triggerType: 'scheduled',
  iconName: 'TrendingUp',
  color: 'emerald',
  nodes: [
    {
      id: 'node-trigger-finance',
      type: 'trigger',
      position: { x: 80, y: 240 },
      data: {
        id: 'node-trigger-finance',
        label: 'Daily Market Briefing Scheduler',
        description: 'Triggers daily at market open to generate pre-bell intelligence briefings.',
        triggerKind: 'scheduled',
        config: {
          cronExpression: '0 8 * * 1-5',
          testScenarios: [
            {
              id: 'scenario-alphabet-earnings',
              name: 'Alphabet Q3 Performance',
              prompt: 'Generate an equity research summary for Alphabet focusing on Cloud revenue and operating margins.',
              expectedOutput: 'Alphabet',
              assertionType: 'contains',
            },
          ],
        },
      } as TriggerData,
    },
    {
      id: 'node-agent-finance-orchestrator',
      type: 'agentNode',
      position: { x: 440, y: 200 },
      data: {
        id: 'node-agent-finance-orchestrator',
        label: 'Lead Financial Analyst',
        role: 'Research Orchestration & Fan-Out',
        model: 'gemini-3.7-flash',
        temperature: 0.2,
        agentKind: 'standard',
        isStartNode: true,
        subAgentPattern: 'parallel',
        systemPrompt: `You are the Lead Financial Analyst Orchestrator.
Deconstruct the target ticker and ticker metrics, then fan out research in parallel to:
1. SEC 10-K & 10-Q Specialist
2. Earnings Call Transcript Analyst
3. Market Sentiment Analyst
Then synthesize their findings into an institutional-grade research memorandum.`,
        tools: [AVAILABLE_TOOLS[0]], // Google Search Grounding
        subAgents: [
          { agentId: 'node-agent-sec', name: 'SEC Specialist', role: 'Extracts 10-K and 10-Q disclosures', delegationType: 'parallel' },
          { agentId: 'node-agent-earnings', name: 'Earnings Analyst', role: 'Analyzes executive call transcripts', delegationType: 'parallel' },
          { agentId: 'node-agent-sentiment', name: 'Market Sentiment', role: 'Gauges news and social sentiment', delegationType: 'parallel' },
          { agentId: 'node-agent-synthesizer', name: 'Report Synthesizer', role: 'Compiles institutional research memo', delegationType: 'parallel' },
        ],
      } as AgentData,
    },
    {
      id: 'node-agent-sec',
      type: 'agentNode',
      position: { x: 920, y: 32 },
      data: {
        id: 'node-agent-sec',
        label: 'SEC 10-K Specialist',
        role: 'Financial Disclosures & Balance Sheets',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the SEC Filings Specialist. Parse balance sheets, debt maturity schedules, and 10-K Item 1A Risk Factors.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-earnings',
      type: 'agentNode',
      position: { x: 920, y: 176 },
      data: {
        id: 'node-agent-earnings',
        label: 'Earnings Call Analyst',
        role: 'Guidance & Management Commentary',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Earnings Call Analyst. Scrutinize CEO/CFO prepared remarks and Q&A tone, identifying revenue guidance revisions.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-sentiment',
      type: 'agentNode',
      position: { x: 920, y: 320 },
      data: {
        id: 'node-agent-sentiment',
        label: 'Market Sentiment Analyst',
        role: 'News Sentiment & Target Prices',
        model: 'gemini-3.7-flash',
        temperature: 0.2,
        agentKind: 'standard',
        systemPrompt: 'You are the Market Sentiment Analyst. Track institutional rating revisions, analyst consensus targets, and macroeconomic headwinds.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-synthesizer',
      type: 'agentNode',
      position: { x: 920, y: 464 },
      data: {
        id: 'node-agent-synthesizer',
        label: 'Report Synthesizer',
        role: 'Final Equity Memo Synthesis',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Equity Research Synthesizer. Synthesize SEC findings, earnings commentary, and market sentiment into a clear investment thesis.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge-finance-trigger-to-orchestrator',
      source: 'node-trigger-finance',
      target: 'node-agent-finance-orchestrator',
      style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
    },
    {
      id: 'edge-orchestrator-to-sec',
      source: 'node-agent-finance-orchestrator',
      target: 'node-agent-sec',
      label: 'SEC Data',
      style: { stroke: '#10b981', strokeWidth: 2 },
    },
    {
      id: 'edge-orchestrator-to-earnings',
      source: 'node-agent-finance-orchestrator',
      target: 'node-agent-earnings',
      label: 'Transcripts',
      style: { stroke: '#10b981', strokeWidth: 2 },
    },
    {
      id: 'edge-orchestrator-to-sentiment',
      source: 'node-agent-finance-orchestrator',
      target: 'node-agent-sentiment',
      label: 'Sentiment',
      style: { stroke: '#10b981', strokeWidth: 2 },
    },
    {
      id: 'edge-orchestrator-to-synthesizer',
      source: 'node-agent-finance-orchestrator',
      target: 'node-agent-synthesizer',
      label: 'Synthesize',
      style: { stroke: '#10b981', strokeWidth: 2 },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './financial_analyst_agent/',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'agent_engine',
  },
  testPrompts: [
    {
      id: 'test_finance_1',
      name: 'Alphabet Q3 Earnings Assessment',
      prompt: 'Analyze Alphabet Q3 FY26 earnings release and cloud revenue acceleration.',
      expectedOutput: 'Alphabet',
      assertionType: 'contains',
    },
  ],
};

export const SAMPLE_CODE_CRITIC: SampleWorkflowDefinition = {
  id: 'code_critic',
  name: 'Code Quality Critic & Security Triad',
  filename: 'code_critic.agent',
  category: 'Software Engineering & DevOps',
  badge: 'Agent Loop + Self-Refinement',
  description: 'Iterative self-refinement triad workflow where a Code Generator creates implementations, a Security & Quality Critic reviews against OWASP benchmarks, and an Optimizer refines the code in an iterative feedback loop.',
  features: ['Loop / Self-Refinement', 'Static Analysis & AST', 'OWASP Top 10 Checks', 'Pytest Generation'],
  nodesCount: 4,
  toolsCount: 2,
  triggerType: 'chat',
  iconName: 'Code',
  color: 'cyan',
  nodes: [
    {
      id: 'node-trigger-code',
      type: 'trigger',
      position: { x: 80, y: 200 },
      data: {
        id: 'node-trigger-code',
        label: 'Feature Request & Code Inbound',
        description: 'Receives engineering specification and generates production code with unit tests.',
        triggerKind: 'chat',
        config: {
          testScenarios: [
            {
              id: 'scenario-rate-limiter',
              name: 'Distributed Rate Limiter',
              prompt: 'Implement an asynchronous token bucket rate limiter in Python using Redis.',
              expectedOutput: 'token bucket',
              assertionType: 'contains',
            },
          ],
        },
      } as TriggerData,
    },
    {
      id: 'node-agent-generator',
      type: 'agentNode',
      position: { x: 440, y: 160 },
      data: {
        id: 'node-agent-generator',
        label: 'Code Generator Agent',
        role: 'Initial Implementation & Test Authoring',
        model: 'gemini-3.7-flash',
        temperature: 0.2,
        agentKind: 'standard',
        isStartNode: true,
        subAgentPattern: 'loop',
        systemPrompt: 'You are the Code Generator Agent. Write clean, modular, and type-annotated code according to the engineering prompt, including unit tests.',
        tools: [],
        subAgents: [
          { agentId: 'node-agent-critic', name: 'Security & Quality Critic', role: 'Performs AST and OWASP code audits', delegationType: 'loop' },
          { agentId: 'node-agent-refiner', name: 'Code Refiner & Optimizer', role: 'Refactors code incorporating critic feedback', delegationType: 'loop' },
        ],
      } as AgentData,
    },
    {
      id: 'node-agent-critic',
      type: 'agentNode',
      position: { x: 860, y: 80 },
      data: {
        id: 'node-agent-critic',
        label: 'Security & Quality Critic',
        role: 'OWASP & Static Code Analysis',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Security & Code Quality Critic Agent. Scrutinize implementations for race conditions, SQL injection, resource leaks, and lack of input validation. Output actionable critique items.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
    {
      id: 'node-agent-refiner',
      type: 'agentNode',
      position: { x: 860, y: 280 },
      data: {
        id: 'node-agent-refiner',
        label: 'Code Refiner & Optimizer',
        role: 'Incorporates Review Feedback',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        agentKind: 'standard',
        systemPrompt: 'You are the Code Refiner Agent. Revise the initial implementation addressing every vulnerability and critique item raised by the critic.',
        tools: [],
        subAgents: [],
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge-code-trigger-to-generator',
      source: 'node-trigger-code',
      target: 'node-agent-generator',
      style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
    },
    {
      id: 'edge-generator-to-critic',
      source: 'node-agent-generator',
      target: 'node-agent-critic',
      label: 'Review Code',
      style: { stroke: '#06b6d4', strokeWidth: 2 },
    },
    {
      id: 'edge-critic-to-refiner',
      source: 'node-agent-critic',
      target: 'node-agent-refiner',
      label: 'Critique Findings',
      style: { stroke: '#06b6d4', strokeWidth: 2 },
    },
    {
      id: 'edge-refiner-to-generator',
      source: 'node-agent-refiner',
      target: 'node-agent-generator',
      label: 'Refined Code',
      style: { stroke: '#06b6d4', strokeWidth: 2, strokeDasharray: '4 4' },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './code_critic_agent/',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'agent_engine',
  },
  testPrompts: [
    {
      id: 'test_code_1',
      name: 'Rate Limiter Verification',
      prompt: 'Implement an asynchronous token bucket rate limiter in Python using Redis.',
      expectedOutput: 'token bucket',
      assertionType: 'contains',
    },
  ],
};

export const SAMPLE_HIGH_VOLUME_DOCUMENT_ANALYZER: SampleWorkflowDefinition = {
  id: 'high_volume_document_analyzer',
  name: 'High-Volume Document Analyzer',
  filename: 'high_volume_document_analyzer.agent',
  category: 'Document AI & Knowledge Retrieval',
  badge: 'Document AI / Batch RAG',
  description: 'Audits and synthesizes massive case files and document collections in iterative chunks with progress tracking, mime type validation, and pagination control.',
  features: [
    'Iterative chunk-based document analysis with concurrency control',
    'Local Python tool integration with ./tools/document_toolset.py',
    'MIME type validation and automatic binary/text decoding',
    'Dual-mode sorting (chronological audit vs. recency investigation)',
    'Session state caching for seamless multi-turn batch continuation',
  ],
  nodesCount: 2,
  toolsCount: 1,
  triggerType: 'manual',
  iconName: 'FileText',
  color: 'teal',
  nodes: [
    {
      id: 'node-trigger-doc-eval',
      type: 'triggerNode',
      position: { x: 80, y: 240 },
      data: {
        id: 'node-trigger-doc-eval',
        label: 'Document Query Inbound',
        triggerType: 'manual',
        description: 'Ingests document collection queries, audit requests, and case investigation questions.',
        config: {
          testScenarios: [
            {
              id: 'scenario-doc-summarize',
              name: 'Summarize Latest Updates - Collection 12345',
              prompt: 'Please summarize the latest updates for collection 12345',
              inputQuery: 'Please summarize the latest updates for collection 12345',
              expectedOutput: 'summary',
              expectedOutputPattern: 'summary',
              assertionType: 'contains',
            },
            {
              id: 'scenario-doc-search-clause',
              name: 'Targeted Clause Search - Chronological Audit',
              prompt: 'Can you search collection 12345 from the beginning (chronological) to find clause 42?',
              inputQuery: 'Can you search collection 12345 from the beginning (chronological) to find clause 42?',
              expectedOutput: 'clause',
              expectedOutputPattern: 'clause',
              assertionType: 'contains',
            },
            {
              id: 'scenario-doc-continue-batch',
              name: 'Batch Continuation - Next Document Chunk',
              prompt: 'Continue reading the next batch of documents for collection 12345',
              inputQuery: 'Continue reading the next batch of documents for collection 12345',
              expectedOutput: 'batch',
              expectedOutputPattern: 'batch',
              assertionType: 'contains',
            },
          ],
        },
      } as TriggerData,
    },
    {
      id: 'node-agent-doc-analyzer',
      type: 'agentNode',
      position: { x: 480, y: 240 },
      data: {
        id: 'node-agent-doc-analyzer',
        label: 'Document Analyzer Agent',
        role: 'High-Volume Document Auditor & Synthesizer',
        description: 'Analyzes high-volume document collections in iterative chunks, applying text cleaning, pagination control, and chronological/recency sorting.',
        model: 'gemini-3.7-flash',
        temperature: 0.1,
        maxIterations: 10,
        agentKind: 'standard',
        isStartNode: true,
        systemPrompt: `You are a High-Volume Document Analysis Agent, specialized in auditing large case files or document collections.
Your task is to answer user questions by iteratively analyzing document batches using the \`analyze_document_next_chunk\` tool.

**RULES**

1. **TEXT CLEANING:**
   - The tool returns technical flags such as \`PARTIAL_SUMMARY:\` or \`FINAL_ANSWER:\`.
   - **NEVER** show these flags to the user. Remove them from the response before displaying it.

2. **PARTIAL SUMMARIES (BATCH READING):**
   - If the tool returns a partial summary, present it in a fluid and conversational manner:
     "Here is the summary of the first batch of documents analyzed: [Summary text without the flag]. Would you like me to continue reading the next ones?"

3. **SEARCH CONTROL (\`reset_search\`):**
   - **NEW QUESTION / TOPIC CHANGE:** Use \`reset_search=True\` to restart the analysis from the first document.
   - **SAME TOPIC / CONTINUE READING:** Use \`reset_search=False\` to fetch the next batch of the same case.

4. **SORTING LOGIC:**
   - For recent updates or current status -> use \`sort_order="desc"\`.
   - For historical background or chronological logs -> use \`sort_order="asc"\`.

5. **FORMATTING:**
   - Use Markdown to structure your response.
   - Highlight key findings or specific values (e.g., dates, names, status) to make them easily readable for the user.`,
        tools: [
          {
            id: 'tool-doc-next-chunk',
            name: 'analyze_document_next_chunk',
            type: 'custom',
            description: 'Iterative chunk tool: downloads and analyzes documents in batches, managing progress and session state across collections.',
            parameters: {
              collection_id: 'Target collection or case file identifier',
              question: 'Specific audit query or summary goal',
              sort_order: "Sorting order: 'asc' for chronological, 'desc' for most recent first",
              reset_search: 'True to restart search from index 0; False to continue reading next batch',
            },
            toolMode: 'local_file',
            sourceFile: './tools/document_toolset.py',
            functionName: 'analyze_document_next_chunk',
            availableFunctions: ['analyze_document_next_chunk'],
          },
        ],
        subAgents: [],
        subAgentPattern: 'parallel',
        memoryType: 'none',
        memoryConfig: { type: 'none' },
        outputFormat: 'text',
        colorTheme: 'teal',
      } as AgentData,
    },
  ],
  edges: [
    {
      id: 'edge-trigger-to-agent',
      source: 'node-trigger-doc-eval',
      target: 'node-agent-doc-analyzer',
      label: 'Document Audit Request',
      style: { stroke: '#0d9488', strokeWidth: 2 },
    },
  ],
  config: {
    framework: 'google_adk',
    language: 'python',
    outputFolder: './high_volume_document_analyzer/',
    includeTests: true,
    includeDocker: true,
    useStreaming: true,
    deploymentTarget: 'agent_engine',
  },
  testPrompts: [
    {
      id: 'scenario-doc-summarize',
      name: 'Summarize Latest Updates - Collection 12345',
      prompt: 'Please summarize the latest updates for collection 12345',
      expectedOutput: 'summary',
      assertionType: 'contains',
    },
    {
      id: 'scenario-doc-search-clause',
      name: 'Targeted Clause Search - Chronological Audit',
      prompt: 'Can you search collection 12345 from the beginning (chronological) to find clause 42?',
      expectedOutput: 'clause',
      assertionType: 'contains',
    },
    {
      id: 'scenario-doc-continue-batch',
      name: 'Batch Continuation - Next Document Chunk',
      prompt: 'Continue reading the next batch of documents for collection 12345',
      expectedOutput: 'batch',
      assertionType: 'contains',
    },
  ],
};

export const SAMPLES_CATALOG: SampleWorkflowDefinition[] = [
  SAMPLE_COMPANY_VERIFIER,
  SAMPLE_PROCUREMENT_REQUEST,
  SAMPLE_CYBER_GUARDIAN,
  SAMPLE_CUSTOMER_SUPPORT,
  SAMPLE_FINANCIAL_ANALYST,
  SAMPLE_CODE_CRITIC,
  SAMPLE_HIGH_VOLUME_DOCUMENT_ANALYZER,
];

