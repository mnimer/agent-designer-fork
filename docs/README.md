# Project Documentation Directory

> **Author**: Mike Nimer <mikenimer@google.com>  
> **Project**: Visual Studio Code Agent Flow Builder

---

## 📚 Living Architecture & Planning Documents

The canonical, living specifications and task trackers for this project reside at the root of the repository:

| Document | Description |
| :--- | :--- |
| **[`DESIGN_DOC.md`](../DESIGN_DOC.md)** | Master technical design document detailing extension architecture, RPC protocols, React Flow canvas topologies, prompt-driven code generation, and test execution engines. |
| **[`REQUIREMENTS.md`](../REQUIREMENTS.md)** | Master functional requirements specification covering canvas interactions, node cards, inspector drawers, code generator options, and quality invariants. |
| **[`RELEASE_PLAN.md`](../RELEASE_PLAN.md)** | 13-release master roadmap spanning single-agent MVPs (v1.0.0) through multi-agent delegation, A2A protocols, dynamic routers, MCP tool integration, and LangGraph/TypeScript support. |
| **[`TASKS.md`](../TASKS.md)** | Actionable task breakdown and sub-agent instructions matrix (TASK-100 through TASK-250). |

---

## 🧭 Architecture Decision Records (`docs/adr/`)

The `docs/adr/` directory stores detailed architectural reviews, deferred sample designs, and technical trade-off records:

- **[`001-retail-data-and-ai-demo-architecture.md`](./adr/001-retail-data-and-ai-demo-architecture.md)**: Full architectural blueprint for the unified 3-sub-agent `cloud-gtm/retail-data-and-ai-demo` sample (*Conversational Analytics + Merchandising + Inventory*), 10 ordered Test Runner demo prompts, and Dual-Mode Local SQLite (`sqlite3`) / BigQuery execution plan.

---

## 🏛 EGM Audit & Review Archive (`docs/egm-audits/`)

The `docs/egm-audits/` subfolder contains historical design reports, discovery interviews, zero-context Goldfish comprehension reviews, adversarial critic reports, and implementation readiness evaluations generated during the Elephant-Goldfish Model (EGM) specification process:

- **[`discussion_summary.md`](./egm-audits/discussion_summary.md)**: Architectural discovery interview, developer constraints, and trade-off analysis.
- **[`comprehension_report.md`](./egm-audits/comprehension_report.md)**: Zero-context Goldfish comprehension review of the initial design draft.
- **[`critic_review_report.md`](./egm-audits/critic_review_report.md)**: Adversarial critic review evaluating edge cases and failure modes.
- **[`readiness_report.md`](./egm-audits/readiness_report.md)**: Implementation readiness test report (100/100 sign-off).
- **[`intermediate_zoom_out_report.md`](./egm-audits/intermediate_zoom_out_report.md)**: Mid-phase checkpoint report.
- **[`zoom_out_report.md`](./egm-audits/zoom_out_report.md)**: Final executive summary of the 13-release master architecture.
- **[`implementation_plan.md`](./egm-audits/implementation_plan.md)**: Task plan for the webview UI parity build.
- **[`walkthrough.md`](./egm-audits/walkthrough.md)**: Build verification walkthrough for webview UI parity.
