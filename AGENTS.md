
# AGENTS.md: Visual AI Agent Designer (VS Code Plugin)

## Project Overview & Purpose

* **Primary Goal:** The primary goal of the project is to create a VS Code plugin that gives users a drag-n-drop experience when designing agents.  Once the user defines the agent, this project will use Gemini to generate a code base  that follows best practices and can be deployed, commited to source control, and edited. (editing code will be overwritten if you use the designer to generate code again.)


This document provides essential context for AI models interacting with the `agent-designer` codebase.

## General Coding Rules
- Strict DRY--Don't repeat yourself--and zero magic constants. No hardcoded literals for code reviews to nitpick
- Anti-Looping! If a fix fails twice with the same error, STOP and rethink--No endless retry loops!
- Maintain a live TASK.md tracker to anchor context and cure LLM attention drift.
- Come up with an upfront plan first and write an isolated failing test in context, then iterate until we get true verification passes


## Code Generation Architecture & Anti-Pattern Rules
- **Pure Prompt-Driven Code Generation**: All target code, test suites, infrastructure (Terraform), and deployment configs are generated 100% by LLM calls to Gemini (`GeminiCodeGenEngine`) using the prompt templates located in `resource/prompts/*.txt`.
- **Zero Procedural Post-Processing**: All code must be generated directly by our LLM call to Gemini. It must NEVER be written, rewritten, standardized, or modified afterwards through procedural transformation scripts or AST parsers.
- **NO Normalization or Standardization Scripts**: Under NO circumstances should normalization, standardization, migration, or "just-in-case" guardrail scripts be created or maintained in `workflowSync.ts`, canvas components, or extension loaders to modify or fix code or `.agent` files. Procedural scripts that try to fix LLM outputs are an anti-pattern that grows out of control.
- **Fix Prompts and Blueprints Directly**: If generated code or workflow definitions need corrections (such as edge styles, handle bindings, imports, model defaults, or framework patterns), ALWAYS update the code generation prompt templates under `resource/prompts/*.txt` or the sample definitions directly. Do NOT write loader hacks or normalization scripts in the codebase.


## Coding Conventions & Style Guide
- **Author Tag**: Add `Mike Nimer <mikenimer@google.com>` as the Author to every class modified.
- **Git Commits**: Never commit code unless explicitly requested by the user. When commiting code include detailed summary of work done.
- **CSS / UI Spacing**: Use the 8pt grid system for all spacing (margins, paddings, sizing in multiples of 8px).
- **TypeScript / React**: Nested components should take props in and emit events up. Avoid unnecessary two-way data binding.  Do not write large files, break the files up into components and helper classes following general best practices for React, Typescript, and code in general. 
- In the generated code, DO NOT add unnecessary/undocumented fallbacks, search the web for documentation or fail fast instead.


## Testing guidelines
   * **New Code:** All new code must have detailed unit tests, for 100% code coverage.   Test should include simple conditions, extreme conditions, and failure conditions. 
   * **Regressions:**  Every bug fix must include a unit test that validates the bug fix. So we never have a regression bug.  


## Architectural Patterns

* **Overall Architecture:** TBD
* **Directory Structure Philosophy:**
    * `/`: The root contains the documentation, vite config, and package dependencity
    * `/src`: Contains the plugin extension source code
    * `/resource`: Contains the prompts, scaffolding examples
    * `/tests` : Contains all unit tests for the plugin.


## Documentation Guidelines

### In-line Code documentation
* **Class Documentation:** Add a description to the top of every class you modify, explaining the purpose of this class and it's job inside the application.   Keep a running list of architectural decisions made in this class OR instructions for the next model session about this class and how it works.
* **Method Documentation:** document every method you modify
* **Code Documentation:** Inside any method, add detailed documentation to
- each section of the code
- detailed comments about the logic flow inside a method.  
- You may use the following tags:  "// TODO:" to denote sections that need further improvement, "// NOTE:" to denote important information, "// HACK:" to denote a workaround, "// FIXME:" to denote something that is broken.
  

### Project Documentation
* `/ARCHITECTURE.md`: Living technical architecture reference detailing system subsystems (Extension Host vs. Webview SPA), Mermaid diagrams, generated code structure, and deep-dive runtime patterns (Universal Agent Adapter and Vertex AI Evaluation). Sync Instructions: Keep in sync on system structure or runtime pattern changes. Update when adding new extension host managers, modifying high-level Mermaid diagrams, altering the structure of the generated target repositories, or changing test harness and evaluation execution flows. Isolated bug fixes or internal method refactors do not require updates.
* `/DESIGN_DOC.md` : Master technical architecture document detailing system subsystems, webview-to-host RPC protocols, canvas topologies, LLM prompt-driven codegen, and test execution runners. Sync Instructions: Keep in sync on architectural changes. Update when introducing new core subsystems, altering the RPC message bus protocol, changing persistence mechanisms (e.g., file JSON vs. localStorage), or modifying code generation and deployment pipelines. Minor UI tweaks and bug fixes do not require updates.
* `/RELEASE_PLAN.md` : Phased 13-release master roadmap organizing milestones and feature scopes from single-agent foundations (v1.0.0) through multi-agent delegation, tools, MCP, and multi-framework targets. Sync Instructions: Keep in sync on milestone or scope shifts. Update when a feature is deferred, promoted to an earlier release milestone, or when release boundaries and architectural themes change. Routine day-to-day task completions belong in TASKS.md, not here.
* `/REQUIREMENTS.md` : Exhaustive functional and UI/UX specification defining canvas node types, property inspector drawer fields, validation rules, default parameter matrices, and lifecycle states. Sync Instructions: Keep in sync on UI/functional changes. Update whenever adding or removing fields on agent/tool/trigger nodes, changing inspector drawer forms, altering connection validation constraints, or introducing new user-facing canvas tabs or features.
* `/docs` : Project documentation directory housing docs/README.md and the docs/egm-audits/ archive of discovery interviews, Goldfish comprehension reviews, and readiness sign-offs. Sync Instructions: Do NOT keep in sync (This is an Historical Archive). The reports inside docs/egm-audits/ are frozen, point-in-time audit snapshots from the initial design phase and should remain untouched. Only update docs/README.md if new subfolders or living guides are added to /docs.



## GIT guidelines
   * **Never commit code**  User will commit code after reviewing changes. 

   * **Commit Messages:** 
    * Commit messages should be in the format: `<type>: <subject>`
    * Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
    * After completing a plan, write up a git commit message explaining all of the changes you made.

   * **Branching Strategy:** 
    * **Mainline:** `main`
    * **Development:** `develop`
    * **Feature Branches:** `feature/<feature-name>`
    * **Hotfix Branches:** `hotfix/<hotfix-name>`
    * **Release Branches:** `release/<release-name>`


## Infrastructure as code
   * **Terraform:** Project configuration must be 100% deployed with terraform.   Do not auto-run the terraform, as me to run it after you modify it. 
   * **Security:** Be mindful of security. Do not hardcode secrets or keys. Use the provided Terraform variables for any sensitive information.
   