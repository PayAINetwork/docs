#!/usr/bin/env python3
"""Regression tests for the small guide-index guard."""

import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("guide_hubs", ROOT / "scripts/check-guide-hubs.py")
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class GuideHubsTest(unittest.TestCase):
    def test_current_guides(self):
        self.assertEqual(CHECKER.validate(ROOT), [])

    def test_new_guides_require_links_outside_tabs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / "introduction.mdx").write_text((ROOT / "introduction.mdx").read_text())
            for family in ("clients", "servers"):
                directory = root / "x402" / family
                directory.mkdir(parents=True)
                (directory / "introduction.mdx").write_text(
                    (ROOT / "x402" / family / "introduction.mdx").read_text()
                )
                (directory / "new-guide.mdx").write_text("# New guide\n")
            self.assertEqual(len(CHECKER.validate(root)), 2)
            for family in ("clients", "servers"):
                hub = root / "x402" / family / "introduction.mdx"
                link = f"[New guide](/x402/{family}/new-guide)"
                hub.write_text(hub.read_text() + f"\n<Tabs><Tab>{link}</Tab></Tabs>\n")
            self.assertEqual(len(CHECKER.validate(root)), 2)
            for family in ("clients", "servers"):
                hub = root / "x402" / family / "introduction.mdx"
                hub.write_text(hub.read_text() + f"\n[New guide](/x402/{family}/new-guide)\n")
            self.assertEqual(CHECKER.validate(root), [])


if __name__ == "__main__":
    unittest.main()
