# Availability Toolkit

Utilities for generating the public availability feed consumed by the property
pages.

## Setup

```bash
cd availability
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and paste the live iCal export URLs for each
property/source. Keys must follow the pattern `<PROPERTY>_ICAL_URL_<SOURCE>`
so the script can auto-discover them (e.g. `BLUE_DREAM_ICAL_URL_AIRBNB`).

## Usage

```bash
cd availability
python build_availability_json.py
```

The script downloads every feed listed in `.env`, merges bookings per property,
and writes the half-open date ranges to `availability.json`, which the frontend
fetches at `/availability/availability.json`.
