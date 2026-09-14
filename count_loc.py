#!/usr/bin/env python3
"""Count lines of code across all public repos for a GitHub user.

Outputs:
  loc-badge.json  – shields.io endpoint badge (schemaVersion 1)
  loc-data.json   – detailed per-repo / per-language breakdown
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

import requests

USERNAME = "hawike22405"
EXCLUDE_FORKS = True  # Set False to include forked repos


def get_repos(username):
    """Fetch every public repo for *username* (handles pagination)."""
    repos, page = [], 1
    while True:
        resp = requests.get(
            f"https://api.github.com/users/{username}/repos",
            params={"per_page": 100, "page": page},
            headers={"Accept": "application/vnd.github+json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        repos.extend(data)
        page += 1
    return repos


def clone_and_count(repo_url, repo_name, tmpdir):
    """Shallow-clone a repo, run ``cloc --json``, return parsed JSON."""
    dest = os.path.join(tmpdir, repo_name)
    subprocess.run(
        ["git", "clone", "--depth", "1", "--single-branch", repo_url, dest],
        capture_output=True,
        timeout=120,
    )
    result = subprocess.run(
        ["cloc", "--json", "--quiet", dest],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def fmt(n):
    """Format a number with K / M suffix for badge display."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def main():
    repos = get_repos(USERNAME)
    if EXCLUDE_FORKS:
        repos = [r for r in repos if not r.get("fork")]

    print(f"Found {len(repos)} repos (forks excluded={EXCLUDE_FORKS})")

    total_code = 0
    total_comment = 0
    total_blank = 0
    per_repo = {}
    lang_totals = {}

    with tempfile.TemporaryDirectory() as tmpdir:
        for repo in repos:
            name = repo["name"]
            url = repo["clone_url"]
            print(f"  Counting {name} ...")
            data = clone_and_count(url, name, tmpdir)
            if not data or "SUM" not in data:
                print("    (skipped — no code files)")
                continue
            s = data["SUM"]
            code = s.get("code", 0)
            comment = s.get("comment", 0)
            blank = s.get("blank", 0)
            total_code += code
            total_comment += comment
            total_blank += blank
            per_repo[name] = {"code": code, "comment": comment, "blank": blank}

            # Aggregate per-language
            for lang, stats in data.items():
                if lang in ("header", "SUM"):
                    continue
                lang_totals.setdefault(lang, 0)
                lang_totals[lang] += stats.get("code", 0)

    # ── Write shields.io badge JSON ──────────────────────────────────
    badge = {
        "schemaVersion": 1,
        "label": "Lines of Code",
        "message": fmt(total_code),
        "color": "blue",
    }
    script_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(script_dir, "loc-badge.json"), "w") as f:
        json.dump(badge, f, indent=2)

    # ── Write detailed data JSON (consumed by generate_card.py) ──────
    loc_data = {
        "total_code": total_code,
        "total_comment": total_comment,
        "total_blank": total_blank,
        "per_repo": per_repo,
        "per_language": dict(sorted(lang_totals.items(), key=lambda x: -x[1])),
    }
    with open(os.path.join(script_dir, "loc-data.json"), "w") as f:
        json.dump(loc_data, f, indent=2)

    print(f"\nTotal Lines of Code: {total_code} ({fmt(total_code)})")
    print("Badge written to loc-badge.json")
    print("Data written to loc-data.json")


if __name__ == "__main__":
    main()
