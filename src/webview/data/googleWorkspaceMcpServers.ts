/**
 * Google Workspace Remote MCP Servers Catalog
 *
 * Central catalog and factory definitions for all 13 official Google Workspace Remote MCP Servers
 * (hosted at https://*mcp.googleapis.com/mcp/v1 and https://people.googleapis.com/mcp/v1 per
 * https://developers.google.com/workspace/mcp).
 *
 * Architectural Decisions:
 * 1. Least Privilege Security: Default scope preset is 'read_only' to protect user data by default.
 * 2. Companion API Pairing: Each remote MCP service pairs with its base Workspace REST API
 *    for unified cloud project enablement.
 * 3. Streamable HTTP Transport: Workspace MCP servers connect over Streamable HTTP with OAuth 2.0 / ADC
 *    and optional X-Goog-User-Project billing quota routing.
 *
 * @author Mike Nimer <mikenimer@google.com>
 */

import {
  GoogleWorkspaceMcpConfig,
  GoogleWorkspaceMcpServerDefinition,
  GoogleWorkspaceScopePreset,
  ToolDefinition,
} from '../../shared/types';

export const GOOGLE_WORKSPACE_MCP_SERVERS: GoogleWorkspaceMcpServerDefinition[] = [
  {
    id: 'workspace_mcp_gmail',
    name: 'Gmail MCP Server',
    description: 'Search threads and messages, read emails, create drafts, and send or reply to messages via the official Gmail Remote MCP Server.',
    companionRestApi: 'gmail.googleapis.com',
    mcpServiceName: 'gmailmcp.googleapis.com',
    defaultEndpoint: 'https://gmailmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['search_messages', 'get_message', 'get_thread', 'create_draft', 'send_message'],
  },
  {
    id: 'workspace_mcp_drive',
    name: 'Google Drive MCP Server',
    description: 'Search files and folders, read file metadata and content, manage permissions, and upload or organize Drive files via the official Google Drive Remote MCP Server.',
    companionRestApi: 'drive.googleapis.com',
    mcpServiceName: 'drivemcp.googleapis.com',
    defaultEndpoint: 'https://drivemcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/drive.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['search_files', 'get_file_metadata', 'read_file_content', 'create_folder', 'update_file_permissions'],
  },
  {
    id: 'workspace_mcp_docs',
    name: 'Google Docs MCP Server',
    description: 'Create documents, read structured document content and tabs, and batch-update text or formatting via the official Google Docs Remote MCP Server.',
    companionRestApi: 'docs.googleapis.com',
    mcpServiceName: 'docsmcp.googleapis.com',
    defaultEndpoint: 'https://docsmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/documents.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/documents',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['get_document', 'create_document', 'append_text', 'replace_all_text', 'batch_update_document'],
  },
  {
    id: 'workspace_mcp_sheets',
    name: 'Google Sheets MCP Server',
    description: 'Read spreadsheet ranges, create sheets, append rows, and update cell values or formulas via the official Google Sheets Remote MCP Server.',
    companionRestApi: 'sheets.googleapis.com',
    mcpServiceName: 'sheetsmcp.googleapis.com',
    defaultEndpoint: 'https://sheetsmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['get_spreadsheet', 'get_values', 'batch_get_values', 'update_values', 'append_values'],
  },
  {
    id: 'workspace_mcp_slides',
    name: 'Google Slides MCP Server',
    description: 'Read presentation slides and speaker notes, create decks, add slides, and update shapes or text boxes via the official Google Slides Remote MCP Server.',
    companionRestApi: 'slides.googleapis.com',
    mcpServiceName: 'slidesmcp.googleapis.com',
    defaultEndpoint: 'https://slidesmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/presentations.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/presentations',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['get_presentation', 'get_page', 'create_presentation', 'create_slide', 'batch_update_presentation'],
  },
  {
    id: 'workspace_mcp_calendar',
    name: 'Google Calendar MCP Server',
    description: 'List calendars, query free/busy availability, read events, and schedule or update meetings via the official Google Calendar Remote MCP Server.',
    companionRestApi: 'calendar-json.googleapis.com',
    mcpServiceName: 'calendarmcp.googleapis.com',
    defaultEndpoint: 'https://calendarmcp.googleapis.com/mcp/v1',
    readOnlyScopes: [
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ],
    readWriteScopes: [
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['list_calendars', 'query_freebusy', 'list_events', 'create_event', 'update_event'],
  },
  {
    id: 'workspace_mcp_chat',
    name: 'Google Chat MCP Server',
    description: 'List Chat spaces, read thread history, and post messages or cards to spaces via the official Google Chat Remote MCP Server.',
    companionRestApi: 'chat.googleapis.com',
    mcpServiceName: 'chatmcp.googleapis.com',
    defaultEndpoint: 'https://chatmcp.googleapis.com/mcp/v1',
    readOnlyScopes: [
      'https://www.googleapis.com/auth/chat.spaces.readonly',
      'https://www.googleapis.com/auth/chat.messages.readonly',
    ],
    readWriteScopes: [
      'https://www.googleapis.com/auth/chat.spaces.readonly',
      'https://www.googleapis.com/auth/chat.messages.readonly',
      'https://www.googleapis.com/auth/chat.messages',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['list_spaces', 'get_space', 'list_messages', 'create_message', 'list_memberships'],
  },
  {
    id: 'workspace_mcp_meet',
    name: 'Google Meet MCP Server',
    description: 'Create and configure Google Meet conference spaces, retrieve meeting artifacts, transcripts, and participant records via the official Google Meet Remote MCP Server.',
    companionRestApi: 'meet.googleapis.com',
    mcpServiceName: 'meetmcp.googleapis.com',
    defaultEndpoint: 'https://meetmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/meetings.space.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/meetings.space.readonly',
      'https://www.googleapis.com/auth/meetings.space.created',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['create_space', 'get_space', 'list_conference_records', 'list_transcripts', 'list_participants'],
  },
  {
    id: 'workspace_mcp_tasks',
    name: 'Google Tasks MCP Server',
    description: 'List task lists, inspect tasks and due dates, and create, complete, or organize tasks via the official Google Tasks Remote MCP Server.',
    companionRestApi: 'tasks.googleapis.com',
    mcpServiceName: 'tasksmcp.googleapis.com',
    defaultEndpoint: 'https://tasksmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/tasks.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/tasks.readonly',
      'https://www.googleapis.com/auth/tasks',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['list_task_lists', 'list_tasks', 'get_task', 'create_task', 'update_task'],
  },
  {
    id: 'workspace_mcp_people',
    name: 'Google People & Contacts MCP Server',
    description: 'Search and retrieve user profiles, personal contacts, and Workspace directory entries via the official Google People Remote MCP Server.',
    companionRestApi: 'people.googleapis.com',
    mcpServiceName: 'people.googleapis.com',
    defaultEndpoint: 'https://people.googleapis.com/mcp/v1',
    readOnlyScopes: [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/directory.readonly',
    ],
    readWriteScopes: [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/directory.readonly',
      'https://www.googleapis.com/auth/contacts',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['search_contacts', 'search_directory_people', 'get_person', 'create_contact', 'update_contact'],
  },
  {
    id: 'workspace_mcp_forms',
    name: 'Google Forms MCP Server',
    description: 'Read form structure and questions, create or update forms and quizzes, and retrieve form responses via the official Google Forms Remote MCP Server.',
    companionRestApi: 'forms.googleapis.com',
    mcpServiceName: 'formsmcp.googleapis.com',
    defaultEndpoint: 'https://formsmcp.googleapis.com/mcp/v1',
    readOnlyScopes: [
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/forms.responses.readonly',
    ],
    readWriteScopes: [
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/forms.body',
      'https://www.googleapis.com/auth/forms.responses.readonly',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['get_form', 'create_form', 'batch_update_form', 'list_responses', 'get_response'],
  },
  {
    id: 'workspace_mcp_keep',
    name: 'Google Keep MCP Server',
    description: 'List, search, create, and manage Google Keep notes and checklists via the official Google Keep Remote MCP Server.',
    companionRestApi: 'keep.googleapis.com',
    mcpServiceName: 'keepmcp.googleapis.com',
    defaultEndpoint: 'https://keepmcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/keep.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/keep.readonly',
      'https://www.googleapis.com/auth/keep',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['list_notes', 'get_note', 'create_note', 'delete_note', 'batch_create_permissions'],
  },
  {
    id: 'workspace_mcp_classroom',
    name: 'Google Classroom MCP Server',
    description: 'List courses, rosters, announcements, and coursework submissions via the official Google Classroom Remote MCP Server.',
    companionRestApi: 'classroom.googleapis.com',
    mcpServiceName: 'classroommcp.googleapis.com',
    defaultEndpoint: 'https://classroommcp.googleapis.com/mcp/v1',
    readOnlyScopes: ['https://www.googleapis.com/auth/classroom.courses.readonly'],
    readWriteScopes: [
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.students',
    ],
    launchStage: 'Preview',
    docUrl: 'https://developers.google.com/workspace/mcp',
    sampleTools: ['list_courses', 'get_course', 'list_coursework', 'create_coursework', 'list_student_submissions'],
  },
];

/**
 * Returns all Google Workspace Remote MCP Server definitions.
 */
export function getGoogleWorkspaceMcpServers(): GoogleWorkspaceMcpServerDefinition[] {
  return [...GOOGLE_WORKSPACE_MCP_SERVERS];
}

/**
 * Finds a Google Workspace Remote MCP Server definition by unique ID.
 */
export function getGoogleWorkspaceMcpServerById(id: string): GoogleWorkspaceMcpServerDefinition | undefined {
  return GOOGLE_WORKSPACE_MCP_SERVERS.find((server) => server.id === id);
}

/**
 * Retrieves the OAuth 2.0 scopes corresponding to the selected preset for a Workspace MCP server.
 */
export function getWorkspaceScopesForPreset(
  server: GoogleWorkspaceMcpServerDefinition,
  preset: GoogleWorkspaceScopePreset
): string[] {
  return preset === 'read_write' ? [...server.readWriteScopes] : [...server.readOnlyScopes];
}

/**
 * Generates the gcloud CLI command to enable both companion REST API and remote MCP service.
 * Deduplicates services when companionRestApi equals mcpServiceName.
 */
export function getWorkspaceGcloudEnableCommand(
  companionRestApi: string,
  mcpServiceName: string,
  projectId?: string
): string {
  const services = Array.from(new Set([companionRestApi, mcpServiceName]));
  return `gcloud services enable ${services.join(' ')}${projectId ? ` --project=${projectId}` : ''}`;
}

/**
 * Generates the gcloud CLI command for Application Default Credentials (ADC) login with required scopes.
 */
export function getWorkspaceAdcLoginCommand(scopes: string[], userProject?: string): string {
  const formattedScopes = scopes.length > 0 ? scopes.join(',') : 'https://www.googleapis.com/auth/cloud-platform';
  if (userProject) {
    return `gcloud auth application-default login --scopes=${formattedScopes} --client-id-file=client_secret.json`;
  }
  return `gcloud auth application-default login --scopes=${formattedScopes}`;
}

/**
 * Creates a ready-to-use ToolDefinition from a Google Workspace Remote MCP server definition.
 */
export function createToolDefinitionFromWorkspaceMcpServer(
  server: GoogleWorkspaceMcpServerDefinition,
  preset: GoogleWorkspaceScopePreset = 'read_only'
): ToolDefinition {
  const workspaceConfig: GoogleWorkspaceMcpConfig = {
    serviceId: server.id,
    companionRestApi: server.companionRestApi,
    mcpServiceName: server.mcpServiceName,
    scopePreset: preset,
    readOnlyScopes: [...server.readOnlyScopes],
    readWriteScopes: [...server.readWriteScopes],
    callerAuthMode: 'caller_oauth',
    tokenStateKey: 'user_access_token',
    userProject: '${GOOGLE_CLOUD_PROJECT}',
  };

  return {
    id: server.id,
    name: server.name,
    description: server.description,
    type: 'MCP',
    isBuiltIn: false,
    category: 'google_workspace_mcp',
    parameters: [],
    mcpConfig: {
      transport: 'http',
      serverUrl: server.defaultEndpoint,
      timeout: 30,
      authType: 'google_cloud_oauth',
      authProviderType: 'google_credentials',
      headers: {
        'X-Goog-User-Project': '${GOOGLE_CLOUD_PROJECT}',
      },
      oauthConfig: {
        serviceName: server.mcpServiceName,
        scopes: getWorkspaceScopesForPreset(server, preset),
        useAdc: true,
        projectId: '${GOOGLE_CLOUD_PROJECT}',
      },
      workspaceConfig,
      toolFilter: [],
    },
  };
}

export const GOOGLE_WORKSPACE_MCP_DEFAULT_TOOLS: ToolDefinition[] = GOOGLE_WORKSPACE_MCP_SERVERS.map((s) =>
  createToolDefinitionFromWorkspaceMcpServer(s)
);
