---
name: vertex-eval
description: "Vertex AI Agent Evaluation assets: eval_dataset.jsonl golden dataset format and evaluate.py using vertexai.evaluation.EvalTask, including Agent Runtime console registration; required by the tests agent."
metadata:
  usedBy: [generator, reviewer]
  targets: [all]
---

# Vertex AI Agent Evaluation

## `eval_dataset.jsonl`

- `eval_dataset.jsonl`: Golden evaluation dataset matching all workflow test scenarios for Vertex AI Agent Evaluation. Format as JSON Lines (JSONL), where each line is a self-contained record defining the test `prompt`, expected reference ground truth (`reference`), and `expected_tool_calls` list derived from trigger node test scenarios.

6. `eval_dataset.jsonl`: Golden evaluation dataset matching all workflow test scenarios.

## `evaluate.py`

- `evaluate.py`: Vertex AI Agent Evaluation script utilizing `vertexai.evaluation.EvalTask` for quality, groundedness, and safety evaluation. Ensure default location argument fallback matches the Gemini 3.7 global regional requirement: `parser.add_argument("--location", default=os.getenv("GOOGLE_CLOUD_LOCATION", "global"))`.

7. `evaluate.py`: Vertex AI Agent Evaluation script using vertexai.evaluation.EvalTask.

### Agent Runtime (Agent Engine)

- `evaluate.py`: Vertex AI Agent Evaluation script utilizing `vertexai.evaluation.EvalTask` against `eval_dataset.jsonl` for quality, trajectory, groundedness, and safety evaluation, ensuring default location argument fallback matches the Gemini 3.7 global regional requirement: `parser.add_argument("--location", default=os.getenv("GOOGLE_CLOUD_LOCATION", "global"))`, and registering GCS-backed `evaluationItems` (with `prompt.userScenario` `oneof`), `evaluationSets` (patched with `agentConfigs`), `evaluationExperiments` (`v1beta1/projects/{project}/locations/{region}/evaluationExperiments` with `labels={"vertex-ai-evaluation-set-name": ..., "vertex-ai-evaluation-agent-engine-id": ..., "vertex-ai-evaluation-agent-engine-location": ...}`), and an initial `evaluationRuns` execution so tests are immediately visible and runnable in the Cloud Console Evaluation tab.

## Dependency Rule (CRITICAL)
- The `vertexai` module used by `evaluate.py` (`vertexai.evaluation.EvalTask`) is provided by `google-cloud-aiplatform`. NEVER add a separate `vertexai` package to `requirements.txt` or `pyproject.toml`: the standalone `vertexai` distribution conflicts with `google-cloud-aiplatform>=1.126.1` and makes `pip install -r requirements.txt` fail with `ResolutionImpossible`.
