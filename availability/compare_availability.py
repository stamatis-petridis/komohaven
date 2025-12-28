#!/usr/bin/env python3
"""
Availability Transition Monitor

Compares KV-backed availability (live) with freshly-synced iCal feeds
to verify the Cloudflare Worker is correctly merging Airbnb + Booking bookings.

Fetches live iCal URLs from environment (.env file) and parses them directly,
bypassing any local state to provide a ground-truth comparison.

Usage:
  python3 compare_availability.py                 # Compare live iCals vs KV (default: 210 days)
  python3 compare_availability.py --property blue-dream
  python3 compare_availability.py --days 30       # Custom lookahead window
  python3 compare_availability.py --save report.txt
  python3 compare_availability.py --compare-json  # Compare static JSON instead of live iCals

Features:
  - Fetches & parses live Airbnb + Booking iCal feeds
  - Merges both feeds using same logic as build_availability_json.py
  - Compares merged iCal bookings against live KV state
  - Shows if worker correctly synced both sources
  - No local state dependencies (always fresh comparison)
  - Safe to run multiple times (read-only)

Author: Claude Code + komohaven team
"""

import json
import sys
import argparse
import os
import re
import urllib.request
from datetime import datetime, timedelta, date, timezone
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
from urllib.error import URLError
from urllib.request import urlopen

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(path):
        pass

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

# Configuration
KOMOHAVEN_URL = "https://komohaven.pages.dev"
PROPERTIES = ["blue-dream", "studio-9"]
STATIC_FILE = Path(__file__).parent / "availability.json"
ENV_FILE = Path(__file__).parent / ".env"
ENV_PATTERN = re.compile(r"([A-Z0-9_]+)_ICAL_URL_([A-Z0-9_]+)")
ATHENS_TZ = ZoneInfo("Europe/Athens")


def slugify(value: str) -> str:
    """Convert ENV-style property name (BLUE_DREAM) into URL-friendly slug."""
    raw = value.strip().lower()
    if raw == "studio9" or raw == "studio-9":
        return "studio-9"
    return raw.replace("_", "-")


def unfold_ics(text: str) -> List[str]:
    """Unfold RFC5545 folded iCal lines into plain lines."""
    out: List[str] = []
    for line in text.splitlines():
        if line.startswith((" ", "\t")) and out:
            out[-1] += line[1:]
        else:
            out.append(line.rstrip("\r"))
    return out


def parse_to_athens_date(value: str) -> Optional[date]:
    """Convert ICS date strings into a local (Athens) date object."""
    value = value.strip()
    if not value:
        return None

    # Date-only: YYYYMMDD
    if len(value) == 8 and value.isdigit():
        return datetime.strptime(value, "%Y%m%d").date()

    # UTC datetime: YYYYMMDDTHHMMSSZ
    if value.endswith("Z"):
        aware = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return aware.astimezone(ATHENS_TZ).date()

    # Naive datetime
    if "T" in value and len(value) >= 15:
        naive = datetime.strptime(value, "%Y%m%dT%H%M%S")
        aware = naive.replace(tzinfo=ATHENS_TZ)
        return aware.date()

    # ISO format fallback
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ATHENS_TZ)
        return parsed.astimezone(ATHENS_TZ).date()
    except ValueError:
        return None


def extract_date(event: Dict[str, str], key: str) -> Optional[date]:
    """Extract DTSTART/DTEND value from raw event dictionary."""
    for stored_key, value in event.items():
        if stored_key.split(";", 1)[0] == key:
            return parse_to_athens_date(value)
    return None


def parse_ics_events(text: str) -> List[Tuple[date, date]]:
    """Parse VEVENT blocks from ICS string and return list of (start, end) dates."""
    lines = unfold_ics(text)
    events: List[Tuple[date, date]] = []
    current: Dict[str, str] = {}

    for raw in lines:
        line = raw.strip()
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current:
                start = extract_date(current, "DTSTART")
                end = extract_date(current, "DTEND")
                if start and end and end > start:
                    events.append((start, end))
            current = {}
        elif ":" in line:
            key, value = line.split(":", 1)
            current[key] = value

    return events


def fetch_ics(url: str) -> str:
    """Fetch an ICS feed and return its textual contents (UTF-8)."""
    with urllib.request.urlopen(url, timeout=10) as response:
        return response.read().decode("utf-8", errors="ignore")


def merge_ranges(ranges: List[Tuple[date, date]]) -> List[Tuple[date, date]]:
    """Merge overlapping date ranges while preserving half-open semantics."""
    if not ranges:
        return []
    ordered = sorted(ranges, key=lambda pair: pair[0])
    merged: List[Tuple[date, date]] = []
    cur_start, cur_end = ordered[0]

    for start, end in ordered[1:]:
        if start < cur_end:  # overlapping
            if end > cur_end:
                cur_end = end
        else:
            merged.append((cur_start, cur_end))
            cur_start, cur_end = start, end

    merged.append((cur_start, cur_end))
    return merged


def discover_feeds() -> Dict[str, Dict[str, str]]:
    """Discover all feed URLs from environment variables (ENV file + system env)."""
    feeds: Dict[str, Dict[str, str]] = defaultdict(dict)

    # Load from .env file
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)

    for key, url in os.environ.items():
        if not url:
            continue
        match = ENV_PATTERN.fullmatch(key)
        if not match:
            continue
        prop_raw, source = match.groups()
        slug = slugify(prop_raw)
        feeds[slug][source.lower()] = url

    return dict(feeds)


def fetch_and_merge_feeds(feeds: Dict[str, Dict[str, str]]) -> Dict[str, List[dict]]:
    """Fetch and merge iCal feeds per property (no cutoff—matches worker behavior)."""
    availability: Dict[str, List[dict]] = {}

    for slug, sources in feeds.items():
        all_ranges: List[Tuple[date, date]] = []

        for source_name, url in sources.items():
            try:
                ics_text = fetch_ics(url)
                ranges = parse_ics_events(ics_text)
                all_ranges.extend(ranges)
            except Exception as exc:
                print(f"⚠ Failed to fetch {slug} feed ({source_name}): {exc}", file=sys.stderr)

        merged = merge_ranges(all_ranges)
        availability[slug] = [
            {"start": start.isoformat(), "end": end.isoformat()}
            for start, end in merged
        ]

    return availability


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
    prop: str, source_data: dict, kv_data: dict, days: int = 210, is_json: bool = False
) -> dict:
    """Compare availability for a single property."""
    today = datetime.fromisoformat("2025-12-18").date()
    cutoff = (today + timedelta(days=days)).isoformat()

    # Handle both iCal data (list) and JSON data (dict with "booked" key)
    if is_json:
        source_raw = source_data.get(prop, {}).get("booked", [])
    else:
        source_raw = source_data.get(prop, [])

    source_ranges = [
        r for r in source_raw
        if r.get("start") < cutoff
    ]
    kv_ranges = [
        r for r in kv_data.get(prop, {}).get("booked", [])
        if r.get("start") < cutoff
    ]

    return {
        "property": prop,
        "window_days": days,
        "source_count": len(source_ranges),
        "kv_count": len(kv_ranges),
        "source_ranges": source_ranges,
        "kv_ranges": kv_ranges,
        "match": source_ranges == kv_ranges,
    }


def format_report(results: list, days: int, source_name: str) -> str:
    """Format comparison results into a readable report."""
    today = datetime.fromisoformat("2025-12-18").date()
    cutoff = today + timedelta(days=days)

    report = []
    report.append("=" * 80)
    report.append(f"AVAILABILITY TRANSITION MONITOR - Timestamp: {datetime.now().isoformat()}")
    report.append("=" * 80)
    report.append(f"\nToday: {today}")
    report.append(f"Window: {today} → {cutoff} ({days} days)")
    report.append(f"Source: {source_name}")
    report.append(f"Timestamp: {datetime.now().isoformat()}")
    report.append("")

    all_match = True
    for result in results:
        prop = result["property"]
        source_count = result["source_count"]
        kv_count = result["kv_count"]
        match = result["match"]

        all_match = all_match and match

        report.append(f"\n{'-' * 80}")
        report.append(f"PROPERTY: {prop.upper()}")
        report.append(f"{'-' * 80}")
        report.append(f"\n{days}-DAY BOOKING WINDOW:")
        report.append(f"  {source_name}: {source_count} bookings")
        report.append(f"  KV State:       {kv_count} bookings")
        report.append(f"  Status:         {'✓ MATCH' if match else '✗ DIVERGE'}")

        if source_count > 0 or kv_count > 0:
            report.append(f"\n  | Date Range               | {source_name[:6]:6} | KV    | Match |")
            report.append(f"  |--------------------------|--------|-------|-------|")

            max_count = max(source_count, kv_count)
            for i in range(max_count):
                s = result["source_ranges"][i] if i < source_count else None
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
        report.append("STATUS: ✓ SYNC VERIFIED")
        report.append(f"  Worker correctly synced {source_name.lower()} feeds.")
        report.append("  All bookings match between source and KV storage.")
    else:
        report.append("STATUS: ⚠ SYNC DIVERGENCE")
        report.append("  Mismatch between source and KV. Investigate:")
        report.append("  1. Check worker logs: npx wrangler tail avail-sync")
        report.append("  2. Verify feed URLs are correct in Cloudflare secrets")
        report.append("  3. Test KV connectivity: curl komohaven.pages.dev/api/avail-health")

    report.append(f"\n{'=' * 80}\nTHE END - Timestamp: {datetime.now().isoformat()}\n{'=' * 80}\n")

    return "\n".join(report)


def main():
    parser = argparse.ArgumentParser(
        description="Compare live iCals or static file vs KV availability",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 compare_availability.py                 # Compare live iCals vs KV (210 days)
  python3 compare_availability.py --property blue-dream
  python3 compare_availability.py --days 30       # 30-day window instead
  python3 compare_availability.py --compare-json  # Compare static JSON instead of live iCals
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
        default=210,
        help="Lookahead window in days (default: 210)",
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
    parser.add_argument(
        "--compare-json",
        action="store_true",
        help="Compare static JSON instead of live iCal feeds",
    )

    args = parser.parse_args()

    # Choose data source
    if args.compare_json:
        if not args.quiet:
            print(f"Loading static availability.json...", file=sys.stderr)
        static_data = load_static_availability()
        if not static_data:
            sys.exit(1)
        source_data = static_data.get("properties", {})
        source_name = "Static JSON"
    else:
        if not args.quiet:
            print(f"Discovering iCal feeds from .env...", file=sys.stderr)
        feeds = discover_feeds()
        if not feeds:
            print(f"✗ No iCal feeds found in {ENV_FILE}", file=sys.stderr)
            sys.exit(1)

        if not args.quiet:
            print(f"Fetching and parsing {sum(len(s) for s in feeds.values())} feeds...", file=sys.stderr)
        source_data = fetch_and_merge_feeds(feeds)
        source_name = "Live iCals (Airbnb + Booking)"

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
        compare_properties(prop, source_data, kv_data, args.days, is_json=args.compare_json) for prop in props
    ]

    # Format report
    report = format_report(results, args.days, source_name)

    # Output
    if args.save:
        with open(args.save, "w") as f:
            f.write(report)
        print(f"✓ Report saved to {args.save}")
    else:
        print(report)


if __name__ == "__main__":
    main()
