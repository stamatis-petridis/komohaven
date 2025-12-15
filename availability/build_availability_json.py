#!/usr/bin/env python3
"""
Generate a consolidated availability.json directly from live iCal feeds.

Loads Airbnb/Booking (or any) feed URLs from environment variables defined in
`availability/.env`, fetches each feed, merges bookings per property, and writes
`availability.json` for the front-end widget.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore


THIS_DIR = Path(__file__).resolve().parent
OUTPUT_JSON = THIS_DIR / "availability.json"

ENV_PATTERN = re.compile(r"([A-Z0-9_]+)_ICAL_URL_([A-Z0-9_]+)")
ATHENS_TZ = ZoneInfo("Europe/Athens")


# Convert an ENV-style property name (BLUE_DREAM) into a URL-friendly slug.
def slugify(value: str) -> str:
    raw = value.strip().lower()
    if raw == "studio9" or raw == "studio-9":
        return "studio-9"
    return raw.replace("_", "-")


# Unfold RFC5545 folded iCal lines into plain lines for easier parsing.
def unfold_ics(text: str) -> List[str]:
    out: List[str] = []
    for line in text.splitlines():
        if line.startswith((" ", "\t")) and out:
            out[-1] += line[1:]
        else:
            out.append(line.rstrip("\r"))
    return out


# Parse VEVENT blocks from an ICS string and return a list of (start, end) dates.
def parse_ics_events(text: str) -> List[Tuple[dt.date, dt.date]]:
    lines = unfold_ics(text)
    events: List[Tuple[dt.date, dt.date]] = []
    current: Dict[str, str] = {}

    for raw in lines:
        line = raw.strip()
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current:
                start = _extract_date(current, "DTSTART")
                end = _extract_date(current, "DTEND")
                if start and end and end > start:
                    events.append((start, end))
            current = {}
        elif ":" in line:
            key, value = line.split(":", 1)
            current[key] = value
    return events


# Extract a DTSTART/DTEND value from the raw event dictionary and normalize to Athens.
def _extract_date(event: Dict[str, str], key: str) -> Optional[dt.date]:
    for stored_key, value in event.items():
        if stored_key.split(";", 1)[0] == key:
            return parse_to_athens_date(value)
    return None


# Convert ICS date strings into a local (Athens) date object.
def parse_to_athens_date(value: str) -> Optional[dt.date]:
    value = value.strip()
    if not value:
        return None

    if len(value) == 8 and value.isdigit():
        # YYYYMMDD (date-only)
        return dt.datetime.strptime(value, "%Y%m%d").date()

    if value.endswith("Z"):
        aware = dt.datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(
            tzinfo=dt.timezone.utc
        )
        return aware.astimezone(ATHENS_TZ).date()

    if "T" in value and len(value) >= 15:
        naive = dt.datetime.strptime(value, "%Y%m%dT%H%M%S")
        aware = naive.replace(tzinfo=ATHENS_TZ)
        return aware.date()

    try:
        parsed = dt.datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ATHENS_TZ)
        return parsed.astimezone(ATHENS_TZ).date()
    except ValueError:
        return None


# Discover all feed URLs from environment variables matching the naming convention.
def discover_feeds() -> Dict[str, List[str]]:
    feeds: Dict[str, List[str]] = defaultdict(list)
    for key, url in os.environ.items():
        if not url:
            continue
        match = ENV_PATTERN.fullmatch(key)
        if not match:
            continue
        prop_raw, _source = match.groups()
        slug = slugify(prop_raw)
        feeds[slug].append(url)
    return feeds


# Fetch an ICS feed and return its textual contents (UTF-8).
def fetch_ics(url: str) -> str:
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8", errors="ignore")


# Merge overlapping date ranges while preserving half-open semantics.
def merge_ranges(ranges: Iterable[Tuple[dt.date, dt.date]]) -> List[Tuple[dt.date, dt.date]]:
    ordered = sorted(ranges, key=lambda pair: pair[0])
    if not ordered:
        return []
    merged: List[Tuple[dt.date, dt.date]] = []
    cur_start, cur_end = ordered[0]

    for start, end in ordered[1:]:
        if start < cur_end:  # overlapping (half-open, so equal end/start stays separate)
            if end > cur_end:
                cur_end = end
        else:
            merged.append((cur_start, cur_end))
            cur_start, cur_end = start, end
    merged.append((cur_start, cur_end))
    return merged


# Build the final availability mapping by fetching each feed and merging ranges.
def build_availability(feeds: Dict[str, List[str]]) -> Dict[str, Dict[str, List[Dict[str, str]]]]:
    availability: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
    cutoff_date = dt.datetime.now(ATHENS_TZ).date() + dt.timedelta(days=150)

    for slug, urls in feeds.items():
        all_ranges: List[Tuple[dt.date, dt.date]] = []
        for url in urls:
            try:
                ics_text = fetch_ics(url)
                ranges = parse_ics_events(ics_text)
                for start, end in ranges:
                    if start >= cutoff_date:
                        # Drop far-future bookings so the JSON stays focused on the next ~5 months.
                        continue
                    bounded_end = min(end, cutoff_date)
                    if bounded_end > start:
                        all_ranges.append((start, bounded_end))
            except Exception as exc:  # pragma: no cover - network issues
                print(f"[WARN] Failed to ingest {slug} feed {url}: {exc}", file=sys.stderr)

        merged = merge_ranges(all_ranges)
        availability[slug] = {
            "booked": [
                {"start": start.isoformat(), "end": end.isoformat()} for start, end in merged
            ]
        }

    return availability


# Script entry point: load configuration, build availability, write JSON file.
def main() -> None:
    load_dotenv(THIS_DIR / ".env")
    feeds = discover_feeds()
    if not feeds:
        print("[WARN] No iCal feeds discovered. Availability JSON will contain empty data.")

    availability = build_availability(feeds)
    payload = {
        "updated": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "properties": availability,
    }

    OUTPUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[OK] Wrote availability JSON to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
