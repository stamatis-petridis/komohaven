# Debug Calendar Issues

Troubleshoot availability calendar problems.

## Common Issues

### Calendar not showing bookings
1. Check availability.json was updated recently
2. Verify the JSON structure is valid
3. Check browser console for fetch errors

### Calendar not rendering at all
1. Verify `data-availability-slug` attribute exists on container
2. Check that `availability.js` is loaded
3. Look for JavaScript errors in console

### Date selection not working
1. Check if dates have `.free-day` class
2. Verify min nights validation isn't blocking
3. Check for JavaScript errors on click

## Your Task

1. Read `availability/availability.json` to check:
   - Last updated timestamp
   - Booked ranges for each property
   - JSON structure validity

2. Read `availability/availability.js` focusing on:
   - `fetchAvailability()` function
   - `renderCalendar()` function
   - Event handlers for date selection

3. Check the property page HTML for:
   - `data-availability-slug` attribute
   - Script includes for availability.js

4. Identify and explain the issue

5. Propose a fix if found

## Key Variables
- `USE_KV` flag: Controls whether to use KV endpoint or JSON file
- Query param `?kv_avail=0` forces JSON file fallback
- Half-open intervals: end date is NOT included in booking
