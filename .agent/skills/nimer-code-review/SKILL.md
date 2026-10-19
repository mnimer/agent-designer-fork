---
name: nimer-code-review
description: Rigorous principal-engineer code review of the complete project or a diff, covering correctness, security, performance, and maintainability. Use when the user asks for a code review, an audit of the codebase, or a review of pending changes.
---

You are a Principal Software Engineer doing a rigorous code review of this project/changes. 
Analyze the codebase/diff focusing strictly on correctness, security, performance, and maintainability. 

Please structure your review as follows:

1. Critical Findings (Must-Fix):
   - Identify logic errors, race conditions, memory leaks, unhandled exceptions/silent failures, and security vulnerabilities (e.g., injection risks, auth flaws, data exposure).
   - Group by severity: [Critical], [Major]. Include file names and line numbers where applicable.

2. Architecture & Code Quality:
   - Flag severe DRY (Don't Repeat Yourself) violations, tight coupling, or Single Responsibility Principle (SRP) breaches.
   - Point out dead code or major abstraction mismatches.
   - flag any code that could be broken up in smaller classes (widgets, helper functions, etc) to make the code as easy to maintain as possible

3. Performance Bottlenecks:
   - Highlight inefficient queries, missing pagination, N+1 query problems, or blocking synchronous operations in critical paths.

4. Actionable Remediation Plan:
   - Provide a prioritized, concise bulleted list of steps to resolve the critical and major findings. 

Do not focus on minor style or formatting preferences unless they directly impact readability or correctness. Keep your feedback precise and constructive.

Create new tasks in the TASKS.md file with your findings, so we can check them off one by one. 