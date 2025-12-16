# Update Availability

Refresh the availability data from iCal feeds.

## Your Task

1. Check if the `.env` file exists in `availability/`:
   ```bash
   ls -la availability/.env
   ```

2. If it exists, run the availability build script:
   ```bash
   cd availability && python3 build_availability_json.py
   ```

3. If successful, show a summary:
   - Last updated timestamp from the JSON
   - Number of booked ranges per property
   - Any upcoming bookings in the next 30 days

4. Ask if the user wants to commit and push the changes:
   ```bash
   git add availability/availability.json
   git commit -m "chore: update availability feeds"
   git push
   ```

## Notes
- The `.env` file must contain iCal URLs matching pattern `<PROPERTY>_ICAL_URL_<SOURCE>`
- GitHub Actions also runs this every 30 minutes automatically
- Only commits when booking data actually changes (ignores timestamp-only diffs)
