"""Offline regression tests for the actual documentation link-check CLI."""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("check-links.py")


class LinkCheckTests(unittest.TestCase):
    def check(self, body, nav=None, redirects=None, llms=None):
        with tempfile.TemporaryDirectory(prefix="payai-doc-links-") as directory:
            root = pathlib.Path(directory)
            (root / "guide").mkdir()
            (root / "guide/start.mdx").write_text(body)
            (root / "guide/next.mdx").write_text("## Next")
            (root / "docs.json").write_text(json.dumps({
                "navigation": {"pages": nav or ["guide/start", "guide/next"]},
                "redirects": redirects or [],
            }))
            if llms is not None:
                (root / "llms.txt").write_text(llms)
            return subprocess.run([sys.executable, str(SCRIPT), str(root)],
                                  capture_output=True, text=True)

    def test_relative_and_absolute_agent_links(self):
        result = self.check("[next](./next?source=test#next) [agent](https://docs.payai.network/guide/next.md)")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_broken_relative_link(self):
        result = self.check("[missing](./missing)")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("./missing", result.stdout)

    def test_navigation_cannot_make_missing_page_valid(self):
        result = self.check("[missing](/invented)", nav=["guide/start", "invented"])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("docs.json navigation", result.stdout)

    def test_redirect_destination_must_exist(self):
        result = self.check("", redirects=[{"source": "/old", "destination": "/missing"}])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("docs.json redirects", result.stdout)

    def test_same_origin_redirect_destination_must_exist(self):
        result = self.check("", redirects=[{
            "source": "/old", "destination": "https://docs.payai.network/missing"
        }])
        self.assertNotEqual(result.returncode, 0)

    def test_redirect_cycles_fail(self):
        result = self.check("", redirects=[
            {"source": "/a", "destination": "/b"},
            {"source": "/b", "destination": "/a"},
        ])
        self.assertNotEqual(result.returncode, 0)

    def test_valid_redirect_chain_and_jsx_links(self):
        result = self.check("<Card href='/old' /> <Card href='./next' />", redirects=[
            {"source": "/old", "destination": "/older"},
            {"source": "/older", "destination": "/guide/next.md?source=test#next"},
        ])
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_skip_code_external_links_and_pure_fragments(self):
        result = self.check('[external](https://example.test/no) [section](#intro)\n'
                            '\x60\x60\x60jsx\n<a href="/illustrative-only">Example</a>\n\x60\x60\x60')
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_llms_txt_must_list_every_nav_page(self):
        result = self.check("", llms="# Docs\n\n- [Start](https://docs.payai.network/guide/start.md)\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("nav page not listed", result.stdout)
        self.assertIn("/guide/next", result.stdout)

    def test_llms_txt_listing_every_nav_page_passes(self):
        result = self.check("", llms="# Docs\n\n- [Start](https://docs.payai.network/guide/start.md)\n"
                                     "\n## Optional\n\n- [Next](https://docs.payai.network/guide/next.md)\n")
        self.assertEqual(result.returncode, 0, result.stdout)


if __name__ == "__main__":
    unittest.main()
