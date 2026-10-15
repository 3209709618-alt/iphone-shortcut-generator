"""Local phase-one probe. Only checked-in synthetic fixtures; never signs/uploads."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
COMPILE_ARGUMENTS = ["--skip-sign", "--derive-uuids", "--no-ansi"]
FIXTURES = {
    "hello": "GeneratorProbe",
    "input-preview": "InputPreviewProbe",
    "csv-append": "CsvAppendProbe",
    "import-question": "ImportQuestionProbe",
    "browser-actions": "BrowserActionsProbe",
}


def read_workflow(data):
    if not data or len(data) > 5 * 1024 * 1024:
        raise ValueError("Empty or oversized compiler output")
    try:
        workflow = plistlib.loads(data)
    except Exception as error:
        raise ValueError("Compiler output is not a valid Apple plist") from error
    if not isinstance(workflow, dict):
        raise ValueError("Workflow must be a dictionary")
    actions = workflow.get("WFWorkflowActions")
    if not isinstance(actions, list) or not actions:
        raise ValueError("Workflow has no actions")
    for action in actions:
        if not isinstance(action, dict):
            raise ValueError("Invalid action")
        identifier = action.get("WFWorkflowActionIdentifier")
        if not isinstance(identifier, str) or not identifier:
            raise ValueError("Invalid action identifier")
        if not isinstance(action.get("WFWorkflowActionParameters", {}), dict):
            raise ValueError("Invalid action parameters")
    return workflow


def check_fixture(name, workflow):
    actions = workflow["WFWorkflowActions"]
    identifiers = [a["WFWorkflowActionIdentifier"] for a in actions]
    if name == "hello":
        assert identifiers == ["is.workflow.actions.showresult"]
        assert actions[0]["WFWorkflowActionParameters"]["Text"] == "测试数据：快捷指令编译验证成功。"
    elif name == "input-preview":
        assert workflow["WFWorkflowHasShortcutInputVariables"] is True
        assert workflow["WFWorkflowInputContentItemClasses"] == ["WFStringContentItem"]
        assert "ExtensionInput" in json.dumps(actions)
    elif name == "csv-append":
        by_id = {a["WFWorkflowActionIdentifier"]: a.get("WFWorkflowActionParameters", {}) for a in actions}
        assert by_id["is.workflow.actions.file.append"]["WFAppendFileWriteMode"] == "Append"
        assert by_id["is.workflow.actions.file.append"]["WFFilePath"] == "GeneratorValidation/probe.csv"
        assert by_id["is.workflow.actions.documentpicker.save"]["WFSaveFileOverwrite"] is False
        assert by_id["is.workflow.actions.documentpicker.open"]["WFFileErrorIfNotFound"] is False
        assert "is.workflow.actions.conditional" in identifiers
    elif name == "import-question":
        questions = workflow["WFWorkflowImportQuestions"]
        assert len(questions) == 1
        assert "TEST-ONLY" in json.dumps(questions)
    elif name == "browser-actions":
        # Compare all parameters and references against the independent browser compiler.
        result = subprocess.run(
            ["node", "--experimental-strip-types", str(ROOT / "scripts" / "browser-fixture.ts")],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, check=True,
        )
        browser = read_workflow(result.stdout)

        def normalize(value, uuids):
            if isinstance(value, dict):
                return {key: normalize(item, uuids) for key, item in value.items()}
            if isinstance(value, list):
                return [normalize(item, uuids) for item in value]
            if isinstance(value, str):
                return uuids.get(value, value)
            return value

        def normalized(value):
            uuids = {a["WFWorkflowActionParameters"]["UUID"]: "step-" + str(i)
                     for i, a in enumerate(value["WFWorkflowActions"])
                     if "UUID" in a.get("WFWorkflowActionParameters", {})}
            return normalize(value, uuids)

        assert normalized(workflow) == normalized(browser), "Browser mapping differs from Cherri"
    else:
        raise ValueError("Unknown probe")


def compile_fixture(compiler, name, directory, arguments, timeout=15):
    if name not in FIXTURES:
        raise ValueError("Only fixed synthetic probe fixtures are allowed")
    if arguments != COMPILE_ARGUMENTS:
        raise ValueError("Probe arguments must disable signing and use deterministic UUIDs")
    directory.mkdir(parents=True)
    source = ROOT / "fixtures" / (name + ".cherri")
    (directory / "probe.cherri").write_bytes(source.read_bytes())
    # Executable and arguments remain separate; no shell, package install or signing.
    result = subprocess.run(
        [str(compiler), "probe.cherri"] + arguments,
        cwd=str(directory), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=timeout, check=False,
    )
    if result.returncode:
        raise RuntimeError("Compilation failed: " + (result.stdout + result.stderr).decode("utf-8", "replace"))
    expected = directory / (FIXTURES[name] + "_unsigned.shortcut")
    outputs = list(directory.glob("*.shortcut"))
    if outputs != [expected]:
        raise ValueError("Expected exactly one explicitly unsigned output")
    data = expected.read_bytes()
    workflow = read_workflow(data)
    check_fixture(name, workflow)
    return data, workflow


def main():
    lock = json.loads((ROOT / "compiler.lock.json").read_text(encoding="utf-8"))
    assert lock["compileArguments"] == COMPILE_ARGUMENTS
    suffix = ".exe" if sys.platform == "win32" else ""
    compiler = Path(os.environ.get("CHERRI_BIN", str(ROOT / ".local" / "tools" / ("cherri" + suffix)))).resolve()
    version = subprocess.run([str(compiler), "--version", "--no-ansi"],
                             capture_output=True, timeout=5, check=True).stdout.decode("utf-8").strip()
    if version != "Cherri Compiler " + lock["version"]:
        raise ValueError("Unexpected compiler version: " + version)
    checks = ROOT / ".local" / "checks"
    checks.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix="compiler-", dir=str(checks)))
    report = {
        "status": "running", "compiler": version, "platform": sys.platform,
        "compilerSha256": hashlib.sha256(compiler.read_bytes()).hexdigest(),
        "arguments": lock["compileArguments"], "runDirectory": str(run),
        "signed": False, "iphoneVerified": False, "fixtures": [],
    }
    report_path = run / "report.json"
    try:
        for name in FIXTURES:
            started = time.monotonic()
            first, workflow = compile_fixture(compiler, name, run / name / "first", lock["compileArguments"])
            second, _ = compile_fixture(compiler, name, run / name / "second", lock["compileArguments"])
            assert first == second, "Compilation is not deterministic: " + name
            report["fixtures"].append({
                "name": name, "bytes": len(first), "actions": len(workflow["WFWorkflowActions"]),
                "sha256": hashlib.sha256(first).hexdigest(), "deterministic": True,
                "twoCompilationsMs": round((time.monotonic() - started) * 1000),
            })
        report["status"] = "local-unsigned-compilation-passed"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        raise
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(str(report_path))
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
