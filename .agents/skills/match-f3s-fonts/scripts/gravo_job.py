#!/usr/bin/env python3

"""
Colony Print client for the gravo engraving node: waits for the dry run
jobs submitted through the Signatur viewport (capture.js) and downloads
the Gravostyle screenshots gravo-pilot takes, and submits guarded dry
run payloads directly when probing the F3S model.

Every payload that leaves this script is a dry run: a payload without a
literal `dry_run: true` is refused, `check_path` (which fires the laser
light) and `record` are forced off and the serialized body is decoded
and checked once more right before it is sent. Direct submissions are
also refused when the F3S model predicts that the text overflows the
engraving area (Gravostyle would resize it).

Usage:
    python gravo_job.py fetch OUT_DIR
    python gravo_job.py submit cases.json OUT_DIR [--plan]

Configuration (environment):
    PRINT_URL      the Colony Print base URL (https://print.bemisc.com)
    PRINT_KEY      the secret key, else read from ~/.colony-print-key
    ENGRAVE_NODE   the node driving Gravostyle (gravo-gold-std)

Files written per case: <name>-composition.png (the Gravostyle text
composition, the one to compare with the viewport), <name>-engraving.png
(the engraving panel) and <name>-result.json (the job result and logs).
"""

import os
import sys
import json
import time
import base64
import argparse
import urllib.parse
import urllib.request

import f3s_model as M
import cases as C

PRINT_URL = os.environ.get("PRINT_URL", "https://print.bemisc.com").rstrip("/")
ENGRAVE_NODE = os.environ.get("ENGRAVE_NODE", "gravo-gold-std")
KEY_PATH = os.path.expanduser("~/.colony-print-key")

# the node runs the queued jobs one after the other and reports them
# all at the end of the batch, about 45 seconds (up to 2 minutes) each
JOB_TIMEOUT = 3600
POLL_INTERVAL = 5

DONE = ("finished", "failed", "error", "canceled", "cancelled")


def key():
    if os.environ.get("PRINT_KEY"):
        return os.environ["PRINT_KEY"]
    with open(KEY_PATH, encoding="utf-8") as file:
        return file.read().strip()


def request(path, data=None, timeout=60):
    request = urllib.request.Request(
        PRINT_URL + path, data=data, headers={"X-Secret-Key": key()}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def guard(payload):
    """
    Validates a gravo payload so it can only ever run as a dry run,
    raising when the caller did not explicitly ask for one.
    """

    if not payload.get("dry_run") is True:
        raise RuntimeError("refusing a payload without dry_run=true")
    payload = dict(payload)
    payload["check_path"] = False
    payload["record"] = False
    payload["debug"] = True
    return payload


def build_payload(case):
    """
    Builds the gravo payload Signatur sends for a case (see the confirm
    modal in `static/js/plugins/modal.js`): the text as [font, text]
    segments split by [None, "\n"], the Cool Emojis characters rewritten
    to their per glyph engraving fonts and their spaces to Helvetica 4L.
    """

    mapping = M.load_mapping()
    text = []
    for index, line in enumerate(case["lines"]):
        if index > 0:
            text.append([None, "\n"])
        for font, chars in M.segments(line, case["font"]):
            if font == M.EMOJI_FONT:
                for char in chars:
                    if char == " ":
                        text.append([M.EMOJI_SPACE_FONT, " "])
                    elif char in mapping:
                        text.append([mapping[char], "a"])
            else:
                text.append([font, chars])
    payload = dict(
        text=text,
        font=None if case["font"] == M.EMOJI_FONT else case["font"],
        font_size=case["font_size"],
        width=case["width"],
        height=case["height"],
        margins=case["margins"],
        dry_run=True,
        record=False,
        check_path=False,
        debug=True,
    )
    extra_fonts = case.get("extra_fonts")
    if extra_fonts:
        payload["extra_fonts"] = dict()
        for name, path in extra_fonts.items():
            with open(path, "rb") as file:
                payload["extra_fonts"][name] = base64.b64encode(file.read()).decode(
                    "ascii"
                )
    return payload


def submit(payload, name=None):
    payload = guard(payload)
    fields = [("type", "gravo"), ("data", json.dumps(payload))]
    if name:
        fields.append(("name", name))
    body = urllib.parse.urlencode(fields).encode("utf-8")

    # re-decodes the exact bytes that are going to be sent and checks
    # the dry run flag once more, so a bug above can never slip through
    sent = json.loads(urllib.parse.parse_qs(body.decode("utf-8"))["data"][0])
    if not sent.get("dry_run") is True or sent.get("check_path"):
        raise RuntimeError("guard failure on the serialized body")

    return json.loads(request("/nodes/%s/print" % ENGRAVE_NODE, data=body))["id"]


def wait(job_id, timeout=JOB_TIMEOUT):
    start = time.time()
    while time.time() - start < timeout:
        job = json.loads(request("/jobs/%s" % job_id))
        if job.get("status") in DONE:
            return job
        time.sleep(POLL_INTERVAL)
    raise RuntimeError("timeout waiting for job %s" % job_id)


def download(job_id, out_dir, name):
    saved = []
    for entry in json.loads(request("/jobs/%s/files" % job_id)):
        source = entry["name"]
        target = "result.json" if source.endswith(".json") else source
        if not target in ("composition.png", "engraving.png", "result.json"):
            continue
        data = request("/jobs/%s/files/%s" % (job_id, urllib.parse.quote(source)))
        path = os.path.join(out_dir, "%s-%s" % (name, target))
        with open(path, "wb") as file:
            file.write(data)
        saved.append(path)
    return saved


def collect(jobs, out_dir):
    """
    Waits for every (name, job id) pair printing the progress, as the
    node reports the whole batch at once, and downloads the screenshots.
    """

    results = dict()
    for index, (name, job_id) in enumerate(jobs):
        job = wait(job_id)
        status = job.get("status")
        files = download(job_id, out_dir, name) if status == "finished" else []
        results[name] = dict(
            job_id=job_id,
            status=status,
            files=[os.path.basename(path) for path in files],
        )
        print(
            "[%s/%s] %-8s %-28s %s" % (index + 1, len(jobs), status, name, job_id),
            flush=True,
        )
    path = os.path.join(out_dir, "jobs.json")
    previous = dict()
    if os.path.exists(path):
        with open(path, encoding="utf-8") as file:
            previous = json.load(file)
    previous.update(results)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(previous, file, indent=4)
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and submit dry run gravo jobs through Colony Print"
    )
    modes = parser.add_subparsers(dest="mode", required=True)
    fetch = modes.add_parser(
        "fetch", help="wait for the jobs capture.js submitted and download them"
    )
    fetch.add_argument("out_dir")
    direct = modes.add_parser(
        "submit", help="submit cases as direct dry run payloads (model probing)"
    )
    direct.add_argument("cases")
    direct.add_argument("out_dir")
    direct.add_argument(
        "--plan", action="store_true", help="print the payloads without sending them"
    )
    args = parser.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    if args.mode == "fetch":
        with open(os.path.join(args.out_dir, "capture.json"), encoding="utf-8") as file:
            captures = json.load(file)["cases"]
        jobs = [
            (name, entry["job"]["id"])
            for name, entry in captures.items()
            if entry.get("job")
        ]
        if not jobs:
            sys.exit("no submitted jobs in capture.json, run capture.js with --submit")
        collect(jobs, args.out_dir)
        return

    with open(args.cases, encoding="utf-8") as file:
        cases = json.load(file)
    problems = [problem for case in cases for problem in C.validate(case)]
    if problems:
        sys.exit("refusing to submit:\n  %s" % "\n  ".join(problems))
    payloads = [(case["name"], guard(build_payload(case))) for case in cases]
    if args.plan:
        for name, payload in payloads:
            shown = dict(
                payload, extra_fonts=sorted(payload.get("extra_fonts", {})) or None
            )
            print(name, json.dumps(shown, ensure_ascii=False))
        return
    jobs = []
    for name, payload in payloads:
        jobs.append((name, submit(payload, name="f3s-match-%s" % name)))
        shown = dict(
            payload, extra_fonts=sorted(payload.get("extra_fonts", {})) or None
        )
        with open(
            os.path.join(args.out_dir, "%s-sent.json" % name), "w", encoding="utf-8"
        ) as file:
            json.dump(shown, file, indent=4)
        print("queued %-28s %s" % (name, jobs[-1][1]), flush=True)
    collect(jobs, args.out_dir)


if __name__ == "__main__":
    main()
