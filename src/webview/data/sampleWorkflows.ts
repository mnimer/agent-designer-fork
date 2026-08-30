import { Node, Edge } from '@xyflow/react';
import { SampleWorkflowDefinition, AgentData, TriggerData } from '../types';
import { AVAILABLE_TOOLS } from './defaultTools';

export const SAMPLE_COMPANY_VERIFIER: SampleWorkflowDefinition = {
  id: 'company_verifier',
  name: 'Company Verifier & Entity Classifier',
  filename: 'company_verifier.agent',
  category: 'Enterprise Integration & Identity',
  badge: 'Pub/Sub + Places API',
  description: 'Automated business entity verification. Listens to Pub/Sub registration events, queries Google Places API for physical location and operating status, and uses prompt reasoning to classify entity legitimacy and category (restaurant, machine shop, retail, medical, tech, etc.).',
  features: [
    'Cloud Pub/Sub Event Ingestion trigger with custom subscription',
    'Google Places API (searchText) tool invocation',
    'Google Search Grounding fallback for ambiguous records',
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
        role: 'Verifies business legitimacy against Google Places API and categorizes business type (restaurant, machine shop, retail, medical, tech, etc.).',
        model: 'gemini-flash-latest',
        temperature: 0.1,
        maxIterations: 8,
        agentKind: 'standard',
        systemPrompt: `You are an automated Business Verification and Entity Classifier Agent.

When a company registration payload is received:
1. Call the "Google Places API (Business Lookup)" tool to search for the entity using the business name, address, and phone number.
2. Cross-verify if the place is marked as OPERATIONAL, permanently closed, or unrecognized.
3. If Places API returns ambiguous results, use Google Search Grounding to verify recent web footprint, corporate filings, or directory listings.
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
          AVAILABLE_TOOLS[0], // Google Places API
          AVAILABLE_TOOLS[2], // Google Search Grounding
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
    'Dual tools: Procurement & Margin Calculator + Market Research Grounding',
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
        model: 'gemini-flash-latest',
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
          AVAILABLE_TOOLS[2], // Google Search Grounding
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
        model: 'gemini-flash-latest',
        temperature: 0.2,
        maxIterations: 10,
        agentKind: 'standard',
        systemPrompt: `You are the Senior Procurement & Financial Inventory Officer.
Your mandate is financial rigor and risk minimization:
- Use the "Procurement & Margin Calculator" tool to calculate net margin %, total cash commitment (MOQ * unit_cost), inventory carrying cost, and break-even unit threshold.
- Scrutinize supplier reliability, lead-time volatility, warehouse shelf-space requirements, and return/defect terms.
- Challenge the FSR's overly optimistic sales assumptions with conservative sell-through models.
- Push for supplier concessions: Net-60 payment terms, vendor guaranteed markdown subsidies, or reduced initial MOQ trial batches.
- Engage in a rigorous 3-turn debate with the FSR before presenting your financial audit to the Executive Judge.`,
        tools: [
          AVAILABLE_TOOLS[1], // Procurement & Margin Calculator
          AVAILABLE_TOOLS[6], // SQL Database Query
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
        model: 'gemini-3.1-pro',
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

export const SAMPLES_CATALOG: SampleWorkflowDefinition[] = [
  SAMPLE_COMPANY_VERIFIER,
  SAMPLE_PROCUREMENT_REQUEST,
];
