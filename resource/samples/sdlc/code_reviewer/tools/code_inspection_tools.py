"""
Code Inspection Tools for Autonomous Multi-Agent Code Reviewer.

Author: Mike Nimer <mikenimer@google.com>

Purpose:
Provides deterministic diff parsing and file inspection capabilities for the
Multi-Agent Code Reviewer sample. Enables the coordinator and specialist agents
to inspect Git pull request patches and local directory structures.
"""

import os
import re
from typing import Dict, Any, List


def parse_git_diff_tool(diff_text: str) -> Dict[str, Any]:
    """
    Parses unified git diff or patch text into structured per-file modifications.

    Args:
        diff_text: Raw unified diff string (e.g. from `git diff` or PR patch).

    Returns:
        Dictionary containing file list, added lines, deleted lines, and statistics.
    """
    if not diff_text or not diff_text.strip():
        return {
            "status": "empty",
            "files_count": 0,
            "files": []
        }

    files: List[Dict[str, Any]] = []
    current_file: Dict[str, Any] = {}
    current_hunk: Dict[str, Any] = {}

    lines = diff_text.splitlines()
    for line in lines:
        if line.startswith("diff --git "):
            if current_file:
                if current_hunk:
                    current_file["hunks"].append(current_hunk)
                    current_hunk = {}
                files.append(current_file)

            parts = line.split(" ")
            b_path = parts[-1].replace("b/", "", 1) if len(parts) >= 4 else "unknown"
            current_file = {
                "filename": b_path,
                "additions_count": 0,
                "deletions_count": 0,
                "hunks": []
            }
        elif line.startswith("--- ") or line.startswith("+++ "):
            if not current_file:
                current_file = {
                    "filename": line.split(" ", 1)[-1].replace("b/", "").replace("a/", ""),
                    "additions_count": 0,
                    "deletions_count": 0,
                    "hunks": []
                }
        elif line.startswith("@@ "):
            if current_hunk and current_file:
                current_file["hunks"].append(current_hunk)
            current_hunk = {
                "header": line,
                "changes": []
            }
        elif current_file and current_hunk:
            if line.startswith("+") and not line.startswith("+++"):
                current_file["additions_count"] += 1
                current_hunk["changes"].append({"type": "add", "content": line[1:]})
            elif line.startswith("-") and not line.startswith("---"):
                current_file["deletions_count"] += 1
                current_hunk["changes"].append({"type": "delete", "content": line[1:]})

    if current_file:
        if current_hunk:
            current_file["hunks"].append(current_hunk)
        files.append(current_file)

    total_additions = sum(f["additions_count"] for f in files)
    total_deletions = sum(f["deletions_count"] for f in files)

    return {
        "status": "success",
        "files_count": len(files),
        "total_additions": total_additions,
        "total_deletions": total_deletions,
        "files": files
    }


def inspect_directory_tool(directory_path: str) -> Dict[str, Any]:
    """
    Scans a local repository directory and retrieves code files for review.

    Args:
        directory_path: Relative or absolute path to the directory.

    Returns:
        Dictionary containing file paths, sizes, and contents.
    """
    if not os.path.exists(directory_path):
        return {
            "status": "error",
            "message": f"Directory not found: {directory_path}",
            "files": []
        }

    ignored_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
    allowed_extensions = {".py", ".ts", ".js", ".json", ".yaml", ".yml", ".sql", ".sh", ".dockerfile", ".tf"}

    collected_files: List[Dict[str, Any]] = []

    for root, dirs, files in os.walk(directory_path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in allowed_extensions or file.lower() in {"dockerfile", "requirements.txt"}:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, directory_path)
                try:
                    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read(50000)  # Read up to 50KB per file for review
                    collected_files.append({
                        "path": rel_path,
                        "lines_count": len(content.splitlines()),
                        "content": content
                    })
                except Exception as ex:
                    collected_files.append({
                        "path": rel_path,
                        "error": str(ex)
                    })

    return {
        "status": "success",
        "directory": directory_path,
        "files_count": len(collected_files),
        "files": collected_files
    }
