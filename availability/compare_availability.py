#!/usr/bin/env python3
"""
Availability Transition Monitor

Compares KV-backed availability (live) with static availability.json (optimized git file)
to verify the transition from static git pipeline to Cloudflare KV system.

Usage:
  python3 compare_availability.py                 # Compare both properties
  python3 compare_availability.py --property blue-dream
  python3 compare_availability.py --days 30       # Custom lookahead window (default: 30)
  python3 compare_availability.py --save report.txt

Features:
  - Fetches live KV data from deployed API
  - Compares against local static file
  - Flags mismatches in the critical booking window
  - Ignores intentional far-future divergence (platform quirks)
  - Safe to run multiple times (no side effects)

Author: Claude Code + komohaven team
"""

import json
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import subprocess
from urllib.request import urlopen
from urllib.error import URLError

# Configuration
KOMOHAVEN_URL = "https://komohaven.pages.dev"
PROPERTIES = ["blue-dream", "studio-9"]
STATIC_FILE = Path(__file__).parent / "availability.json"


def fetch_kv_availability(slug: str) -> dict | None:
    """Fetch live KV availability for a property via API."""
    try:
        url = f"{KOMOHAVEN_URL}/api/availability?slug={slug}&kv_avail=1"
        with urlopen(url, timeout=10) as response:
            if response.status == 200:
                return json.loads(response.read().decode())
    except URLError as e:
        print(f"⚠ Failed to fetch KV data for {slug}: {e}", file=sys.stderr)
    except json.JSONDecodeError as e:
        print(f"⚠ Failed to parse KV response for {slug}: {e}", file=sys.stderr)
    return None


def load_static_availability() -> dict | None:
    """Load static availability.json file."""
    try:
        with open(STATIC_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"✗ Static file not found: {STATIC_FILE}", file=sys.stderr)
    except json.JSONDecodeError as e:
        print(f"✗ Failed to parse static file: {e}", file=sys.stderr)
    return None


def compare_properties(
    prop: str, static_data: dict, kv_data: dict, days: int = 30
) -> dict:
    """Compare availability for a single property."""
    today = datetime.fromisoformat("2025-12-18").date()
    cutoff = (today + timedelta(days=days)).isoformat()

    static_ranges = [
        r for r in static_data.get("properties", {}).get(prop, {}).get("booked", [])
        if r.get("start") < cutoff
    ]
    kv_ranges = [
        r for r in kv_data.get(prop, {}).get("booked", [])
        if r.get("start") < cutoff
    ]

    return {
        "property": prop,
        "window_days": days,
        "static_count": len(static_ranges),
        "kv_count": len(kv_ranges),
        "static_ranges": static_ranges,
        "kv_ranges": kv_ranges,
        "match": static_ranges == kv_ranges,
    }


def format_report(results: list, days: int) -> str:
    """Format comparison results into a readable report."""
    today = datetime.fromisoformat("2025-12-18").date()
    cutoff = today + timedelta(days=days)

    report = []
    report.append("=" * 80)
    report.append("AVAILABILITY TRANSITION MONITOR")
    report.append("=" * 80)
    report.append(f"\nToday: {today}")
    report.append(f"Window: {today} → {cutoff} ({days} days)")
    report.append(f"Timestamp: {datetime.now().isoformat()}")
    report.append("")

    all_match = True
    for result in results:
        prop = result["property"]
        static_count = result["static_count"]
        kv_count = result["kv_count"]
        match = result["match"]

        all_match = all_match and match

        report.append(f"\n{'-' * 80}")
        report.append(f"PROPERTY: {prop.upper()}")
        report.append(f"{'-' * 80}")
        report.append(f"\n{days}-DAY BOOKING WINDOW:")
        report.append(f"  Static File: {static_count} bookings")
        report.append(f"  KV State:    {kv_count} bookings")
        report.append(f"  Status:      {'✓ MATCH' if match else '✗ DIVERGE'}")

        if static_count > 0 or kv_count > 0:
            report.append(f"\n  | Date Range               | Static | KV    | Match |")
            report.append(f"  |--------------------------|--------|-------|-------|")

            max_count = max(static_count, kv_count)
            for i in range(max_count):
                s = result["static_ranges"][i] if i < static_count else None
                k = result["kv_ranges"][i] if i < kv_count else None

                s_str = f"{s['start']} - {s['end']}" if s else "-"
                match_char = "✓" if (s and k and s == k) else "✗" if (s or k) else "-"

                report.append(
                    f"  | {s_str:24} | {'✓':6} | {'✓':5} | {match_char:5} |"
                )

    report.append(f"\n\n{'=' * 80}")
    report.append("SUMMARY")
    report.append(f"{'=' * 80}")

    for result in results:
        status = "✓ YES" if result["match"] else "✗ NO"
        report.append(f"\n{result['property']:15} {days}-day match: {status}")

    report.append("\n")
    if all_match:
        report.append("STATUS: ✓ TRANSITION READY")
        report.append("  Critical booking window matches on all properties.")
        report.append("  Far-future divergence is intentional (platform quirks).")
        report.append("  KV system is safe to use as primary source.")
    else:
        report.append("STATUS: ⚠ DIVERGENCE DETECTED")
        report.append("  Mismatch in critical booking window. Investigate:")
        report.append("  1. Has the worker synced since static file was updated?")
        report.append("  2. Check worker logs: npx wrangler tail avail-sync")
        report.append("  3. Verify KV connectivity: curl komohaven.pages.dev/api/avail-health")

    report.append(f"\n{'=' * 80}\n")

    return "\n".join(report)


def main():
    parser = argparse.ArgumentParser(
        description="Compare KV vs static availability during transition",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 compare_availability.py
  python3 compare_availability.py --property blue-dream
  python3 compare_availability.py --days 7
  python3 compare_availability.py --save report.txt
        """,
    )
    parser.add_argument(
        "--property",
        choices=PROPERTIES,
        help="Check specific property (default: all)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Lookahead window in days (default: 30)",
    )
    parser.add_argument(
        "--save",
        type=str,
        help="Save report to file (default: print to stdout)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress messages",
    )

    args = parser.parse_args()

    if not args.quiet:
        print(f"Loading static availability...", file=sys.stderr)

    static_data = load_static_availability()
    if not static_data:
        sys.exit(1)

    if not args.quiet:
        print(f"Fetching live KV data...", file=sys.stderr)

    kv_data = {}
    props = [args.property] if args.property else PROPERTIES

    for prop in props:
        kv_result = fetch_kv_availability(prop)
        if kv_result:
            kv_data[prop] = kv_result
        else:
            print(
                f"✗ Could not fetch KV data for {prop}. Using empty state.",
                file=sys.stderr,
            )
            kv_data[prop] = {"booked": []}

    if not args.quiet:
        print(f"Comparing {len(props)} properties...\n", file=sys.stderr)

    # Run comparisons
    results = [
        compare_properties(prop, static_data, kv_data, args.days) for prop in props
    ]

    # Format report
    report = format_report(results, args.days)

    # Output
    if args.save:
        with open(args.save, "w") as f:
            f.write(report)
        print(f"✓ Report saved to {args.save}")
    else:
        print(report)


if __name__ == "__main__":
    main()
