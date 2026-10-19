# Code Reviewing Agent

This blueprint demonstrates the use of Google Agent Development Kit (ADK) to build a production-grade, multi-agent automated code review system. A team of domain-specialist agents collaborates to inspect code changes, identify security vulnerabilities, evaluate software architecture, and verify test and packaging readiness.

## Overview

Code review workloads require distinct analytical lenses (architecture, security, packaging). In this system, the **Code Review Coordinator** (`agent_code_review_coordinator`) manages three specialized sub-agents:

1. **Architecture & Code Quality Specialist (`agent_architecture_reviewer`)**:
   - Inspects software design, modularity, and separation of concerns.
   - Detects monolithic 'god classes', tight coupling, and leaky abstractions.
   - Audits clean code practices, naming conventions, and language-idiomatic constructs.
   - Flags unhandled exceptions, resource leaks, and performance bottlenecks.

2. **Security & Vulnerability Specialist (`agent_security_reviewer`)**:
   - Audits code against the **OWASP Top 10** vulnerability categories.
   - Enforces **CWE-89** SQL injection prevention (verifying parameterized queries instead of string concatenation).
   - Enforces **CWE-918** Server-Side Request Forgery (SSRF) checks and network timeout bounds.
   - Scans for hardcoded credentials, unredacted tokens, and plaintext API keys.
   - Validates authentication, authorization, and input sanitization boundaries.

3. **Testing, Packaging & Dependencies Specialist (`agent_packaging_reviewer`)**:
   - Audits unit and integration test coverage across newly added or modified logic.
   - Verifies test isolation and mocking boundaries for external network and cloud dependencies.
   - Validates dependency declarations (`requirements.txt`, `pyproject.toml`, `package.json`).
   - Checks container configurations (`Dockerfile`, `.dockerignore`) for non-root execution and minimal attack surface.

## Dual Entry Points

The agent system is designed to be invoked in two complementary ways:

* **Git Pull Request (Diff / Patch)**:
  Submit a raw Git unified diff or PR patch text. The coordinator uses `parse_git_diff_tool` to analyze file additions, deletions, and hunk line numbers, routing changed files to the sub-agents for surgical line-by-line review.
* **Local Repository / Directory Inspection**:
  Submit a directory path (e.g. `./src/services` or `./api`). The coordinator uses `inspect_directory_tool` to traverse the repository tree and review file contents across services.

## Interactive Chat Report Delivery

Unlike batch CI linters that write static markdown files to disk, this agent delivers an interactive, executive-ready review brief directly in the chat session:
- **Verdict**: `APPROVED`, `CHANGES_REQUESTED`, or `COMMENT`.
- **Scorecard**: Architecture, Security, and Testing scores (0-100).
- **Blockers & Warnings**: Categorized issues citing file paths, line numbers, and CWE references.
- **Code Remediation**: Actionable, copy-paste-ready code suggestions.

## Architecture & Model Configuration

| Component | Specification |
| :--- | :--- |
| **Framework** | Google Agent Development Kit (`google-adk`) |
| **Language** | Python 3.11+ |
| **Coordinator Model** | `gemini-3.7-flash` (Vertex AI `global` region) |
| **Specialist Models** | `gemini-3.7-flash` |
| **Memory** | In-Memory Turn Session State |
| **Deployment Target** | Vertex AI Agent Engine or Cloud Run |

## Included Python Tools (`./tools/`)

* `tools/code_inspection_tools.py`:
  * `parse_git_diff_tool(diff_text)`: Parses unified git diff patches into per-file chunks, additions, and deletions.
  * `inspect_directory_tool(directory_path)`: Traverses local directories and loads source code files for static inspection.

## Automated Test Suite (6 Scenarios)

The attached Test Suite node (`trigger_code_review_tester`) includes 6 comprehensive evaluation scenarios:

1. **SQL Injection Vulnerability in User Query Tool**: Detects unparameterized string formatting in database queries.
2. **Plaintext Secret Leak in Payment Client**: Detects hardcoded API keys committed into source code.
3. **Undeclared Third-Party Import in Service**: Flags imports present in Python files but omitted from `requirements.txt`.
4. **Monolithic God-Class Violating Single Responsibility**: Flags architectural anti-patterns with mixed concerns.
5. **SSRF Flaw with Unvalidated URL & Missing Timeout**: Detects raw outbound HTTP calls without validation or timeouts.
6. **Clean Production PR with Tests and Parameterized Queries**: Verifies that well-architected, tested code receives an `APPROVED` verdict.
