import importlib.util
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("probe", Path(__file__).resolve().parents[1] / "scripts" / "verify_compiler.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class CompilerProbeTests(unittest.TestCase):
    def test_accepts_parameterless_nothing_action(self):
        value = {"WFWorkflowActions": [{"WFWorkflowActionIdentifier": "is.workflow.actions.nothing"}]}
        self.assertEqual(probe.read_workflow(plistlib.dumps(value)), value)

    def test_accepts_real_plist_formats(self):
        value = {"WFWorkflowActions": [{"WFWorkflowActionIdentifier": "is.workflow.actions.showresult", "WFWorkflowActionParameters": {"Text": "测试"}}]}
        for fmt in (plistlib.FMT_XML, plistlib.FMT_BINARY):
            self.assertEqual(probe.read_workflow(plistlib.dumps(value, fmt=fmt)), value)

    def test_rejects_fake_install_files(self):
        invalid = [b"", b"<html>502 Bad Gateway</html>", b'{"status":"signed"}', b"AEA1", b"bplist00broken"]
        invalid.extend(plistlib.dumps(value) for value in [[], {}, {"WFWorkflowActions": []}, {"WFWorkflowActions": ["invalid"]}, {"WFWorkflowActions": [{"WFWorkflowActionIdentifier": "", "WFWorkflowActionParameters": {}}]}, {"WFWorkflowActions": [{"WFWorkflowActionIdentifier": "x", "WFWorkflowActionParameters": []}]}])
        for data in invalid:
            with self.subTest(data=data[:60]), self.assertRaises(ValueError):
                probe.read_workflow(data)

    def test_rejects_oversized_output(self):
        with self.assertRaises(ValueError):
            probe.read_workflow(b"x" * (5 * 1024 * 1024 + 1))

    def test_does_not_allow_arbitrary_source_paths(self):
        with self.assertRaises(ValueError):
            probe.compile_fixture(Path("compiler"), "../../private", Path("unused"), [])

    def test_compiler_timeout_propagates(self):
        local = probe.ROOT / ".local"
        local.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=str(local)) as temporary:
            with patch.object(probe.subprocess, "run", side_effect=subprocess.TimeoutExpired("compiler", 15)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    probe.compile_fixture(Path("compiler"), "hello", Path(temporary) / "run", probe.COMPILE_ARGUMENTS)

    def test_cannot_enable_signing(self):
        for arguments in ([], ["--hubsign"], probe.COMPILE_ARGUMENTS + ["--signing-server=https://example.com"]):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                probe.compile_fixture(Path("compiler"), "hello", Path("unused"), arguments)


if __name__ == "__main__":
    unittest.main()
