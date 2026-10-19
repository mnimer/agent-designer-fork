"""
Unit tests for Autonomous Multi-Agent Code Reviewer Tools.

Author: Mike Nimer <mikenimer@google.com>
"""

import os
import sys
import unittest
from pathlib import Path

SAMPLE_ROOT = Path(__file__).resolve().parent.parent
if str(SAMPLE_ROOT) not in sys.path:
    sys.path.insert(0, str(SAMPLE_ROOT))

from tools import parse_git_diff_tool, inspect_directory_tool


class TestCodeReviewerTools(unittest.TestCase):
    def test_parse_empty_diff(self):
        result = parse_git_diff_tool("")
        self.assertEqual(result["status"], "empty")
        self.assertEqual(result["files_count"], 0)

    def test_parse_valid_git_diff(self):
        sample_diff = """diff --git a/services/user_service.py b/services/user_service.py
index 1234567..89abcdef 100644
--- a/services/user_service.py
+++ b/services/user_service.py
@@ -10,4 +10,6 @@ def get_user():
-    cursor.execute('SELECT * FROM users WHERE id = %s', (uid,))
+    # Insecure query
+    cursor.execute(f"SELECT * FROM users WHERE id = '{uid}'")
"""
        result = parse_git_diff_tool(sample_diff)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["files_count"], 1)
        self.assertEqual(result["files"][0]["filename"], "services/user_service.py")
        self.assertGreaterEqual(result["total_additions"], 1)
        self.assertGreaterEqual(result["total_deletions"], 1)

    def test_inspect_directory_tool(self):
        current_dir = os.path.dirname(__file__)
        result = inspect_directory_tool(current_dir)
        self.assertEqual(result["status"], "success")
        self.assertGreaterEqual(result["files_count"], 1)

    def test_inspect_nonexistent_directory(self):
        result = inspect_directory_tool("/path/to/nonexistent/directory/xyz")
        self.assertEqual(result["status"], "error")


if __name__ == "__main__":
    unittest.main()
