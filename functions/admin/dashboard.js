// GET /admin/dashboard - Admin dashboard with calendar and blocking controls

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'GET') {
    return getDashboard();
  }

  return new Response('Method not allowed', { status: 405 });
}

function getDashboard() {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KomoHaven Admin - Dashboard</title>
  <link rel="stylesheet" href="/admin.css">
  <style>
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }

    .calendar-month {
      background: white;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid var(--admin-border);
    }

    .calendar-month h3 {
      margin: 0 0 12px;
      font-size: 16px;
      color: var(--admin-fg);
    }

    .calendar-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .calendar-table th {
      padding: 6px 2px;
      color: var(--admin-muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      text-align: center;
    }

    .calendar-table td {
      padding: 6px 2px;
      text-align: center;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
      user-select: none;
      font-weight: 500;
    }

    .calendar-table td.empty {
      cursor: default;
    }

    .calendar-table td.past {
      color: var(--admin-muted);
      opacity: 0.4;
      cursor: default;
    }

    .calendar-table td.today {
      outline: 2px solid var(--admin-brand);
      font-weight: 700;
    }

    .calendar-table td.available {
      color: var(--admin-fg);
    }

    .calendar-table td.available:hover {
      background: var(--admin-card);
    }

    .calendar-table td.booked-airbnb {
      background: #ff6b6b;
      color: white;
      cursor: default;
    }

    .calendar-table td.booked-booking {
      background: #4dabf7;
      color: white;
      cursor: default;
    }

    .calendar-table td.blocked-manual {
      background: #51cf66;
      color: white;
      cursor: default;
    }

    .calendar-table td.range-start,
    .calendar-table td.range-mid,
    .calendar-table td.range-end,
    .calendar-table td.range-single {
      background: rgba(102, 126, 234, 0.3);
      outline: 2px solid var(--admin-brand);
    }

    .calendar-table td.range-start {
      border-radius: 4px 0 0 4px;
    }

    .calendar-table td.range-end {
      border-radius: 0 4px 4px 0;
    }

    .calendar-table td.range-single {
      border-radius: 4px;
    }

    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 20px;
      padding: 16px;
      background: var(--admin-card);
      border-radius: 8px;
      border: 1px solid var(--admin-border);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .legend-swatch {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }

    .legend-swatch.airbnb {
      background: #ff6b6b;
    }

    .legend-swatch.booking {
      background: #4dabf7;
    }

    .legend-swatch.manual {
      background: #51cf66;
    }

    .legend-swatch.available {
      background: white;
      border: 1px solid var(--admin-border);
    }

    .controls {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .status-bar {
      padding: 16px;
      background: var(--admin-card);
      border-radius: 8px;
      border: 1px solid var(--admin-border);
      margin-top: 20px;
      font-size: 14px;
    }

    .status-bar p {
      margin: 0 0 8px;
    }

    .status-bar p:last-child {
      margin: 0;
    }

    .property-selector {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }

    .property-selector button {
      flex: 1;
      padding: 12px 16px;
      background: var(--admin-card);
      border: 2px solid var(--admin-border);
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      color: var(--admin-fg);
      transition: all 0.2s;
    }

    .property-selector button:hover {
      border-color: var(--admin-brand);
    }

    .property-selector button.active {
      background: var(--admin-brand);
      color: white;
      border-color: var(--admin-brand);
    }

    .loading {
      text-align: center;
      padding: 40px 20px;
      color: var(--admin-muted);
    }

    .error {
      padding: 16px;
      background: #ffebee;
      border: 1px solid #ff6b6b;
      color: #d32f2f;
      border-radius: 8px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="navbar">
    <h1>🏠 KomoHaven Admin</h1>
    <div class="navbar-actions">
      <button class="btn-danger" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="container">
    <div class="card">
      <h2>Select Property</h2>
      <div class="property-selector">
        <button class="active" onclick="selectProperty('blue-dream')">🌊 Blue Dream</button>
        <button onclick="selectProperty('studio-9')">🎨 Studio 9</button>
      </div>
    </div>

    <div class="card">
      <h2>Availability Calendar</h2>
      <div id="calendar-container" class="loading">Loading calendar...</div>
      
      <div class="legend">
        <div class="legend-item">
          <span class="legend-swatch airbnb"></span>
          <span>Booked (Airbnb)</span>
        </div>
        <div class="legend-item">
          <span class="legend-swatch booking"></span>
          <span>Booked (Booking.com)</span>
        </div>
        <div class="legend-item">
          <span class="legend-swatch manual"></span>
          <span>Blocked (Your blocks)</span>
        </div>
        <div class="legend-item">
          <span class="legend-swatch available"></span>
          <span>Available</span>
        </div>
      </div>

      <div class="controls">
        <button class="btn-success" onclick="blockDates()" id="block-btn" disabled>
          🔒 Block Selected Dates
        </button>
        <button class="btn-secondary" onclick="unblockDates()" id="unblock-btn" disabled>
          🔓 Unblock Selected Dates
        </button>
        <button class="btn-secondary" onclick="clearSelection()" id="clear-btn" disabled>
          ✕ Clear Selection
        </button>
      </div>

      <div class="status-bar">
        <p id="status-message">Click dates to select a range</p>
      </div>

      <div id="error-message" class="error" style="display: none;"></div>
    </div>
  </div>

  <script>
    let currentProperty = 'blue-dream';
    let calendarData = { booked: [], blocked: [] };
    let selectedRange = { start: null, end: null };

    async function selectProperty(slug) {
      currentProperty = slug;
      selectedRange = { start: null, end: null };
      
      document.querySelectorAll('.property-selector button').forEach(btn => {
        btn.classList.remove('active');
      });
      event.target.classList.add('active');

      await loadCalendar();
    }

    async function loadCalendar() {
      const container = document.getElementById('calendar-container');
      container.innerHTML = '<div class="loading">Loading calendar...</div>';
      console.log('[calendar] loadCalendar called for property:', currentProperty);

      try {
        // Fetch booked dates from KV
        console.log('[calendar] fetching /api/availability?slug=' + currentProperty);
        const bookedRes = await fetch(\`/api/availability?slug=\${currentProperty}\`);
        console.log('[calendar] availability response:', bookedRes.status, bookedRes.statusText);
        if (!bookedRes.ok) {
          throw new Error(\`Failed to fetch availability: \${bookedRes.status} \${bookedRes.statusText}\`);
        }
        const bookedData = await bookedRes.json();
        console.log('[calendar] availability data:', bookedData);
        if (!bookedData.ok) {
          throw new Error(\`Availability endpoint error: \${bookedData.error}\`);
        }

        // Fetch blocked dates from KV
        console.log('[calendar] fetching /api/blocked-dates/status?slug=' + currentProperty);
        const blockedRes = await fetch(\`/api/blocked-dates/status?slug=\${currentProperty}\`);
        console.log('[calendar] blocked-dates response:', blockedRes.status, blockedRes.statusText);
        let blockedData = { blocked: [] };
        if (blockedRes.ok) {
          const parsed = await blockedRes.json();
          console.log('[calendar] blocked data:', parsed);
          if (parsed.ok) {
            blockedData = parsed;
          }
        }

        calendarData = {
          booked: Array.isArray(bookedData.booked) ? bookedData.booked : [],
          blocked: Array.isArray(blockedData.blocked) ? blockedData.blocked : []
        };

        console.log('[calendar] combined calendar data:', calendarData);
        renderCalendar(container);
        hideError();
      } catch (err) {
        console.error('[calendar] Failed to load calendar:', err);
        showError('Failed to load calendar: ' + err.message);
        container.innerHTML = '<div class="error">Unable to load calendar. Check browser console for details.</div>';
      }
    }

    function renderCalendar(container) {
      console.log('[calendar] renderCalendar() called, calendarData:', calendarData);
      container.innerHTML = '';
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const calendarGrid = document.createElement('div');
      calendarGrid.className = 'calendar-grid';

      for (let offset = 0; offset < 3; offset++) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const monthCard = document.createElement('div');
        monthCard.className = 'calendar-month';

        const heading = document.createElement('h3');
        heading.textContent = monthDate.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric'
        });
        monthCard.appendChild(heading);

        const table = document.createElement('table');
        table.className = 'calendar-table';

        // Header
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(day => {
          const th = document.createElement('th');
          th.textContent = day;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        const leadingBlanks = (firstDay.getDay() + 6) % 7;
        const totalCells = leadingBlanks + daysInMonth;
        const trailingBlanks = (7 - (totalCells % 7)) % 7;
        const totalSlots = totalCells + trailingBlanks;
        let dayCounter = 1;

        for (let slot = 0; slot < totalSlots; slot++) {
          if (slot % 7 === 0) {
            tbody.appendChild(document.createElement('tr'));
          }
          const row = tbody.lastElementChild;
          const td = document.createElement('td');

          if (slot < leadingBlanks || dayCounter > daysInMonth) {
            td.className = 'empty';
          } else {
            const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayCounter);
            td.textContent = dayCounter;
            td.dataset.date = formatISODate(date);
            applyDateState(td, date, today);
            dayCounter++;
          }
          row.appendChild(td);
        }

        table.appendChild(tbody);
        monthCard.appendChild(table);
        calendarGrid.appendChild(monthCard);
      }

      container.appendChild(calendarGrid);
      console.log('[calendar] calendar grid appended to container, grid HTML length:', calendarGrid.innerHTML.length);
      updateButtons();
    }

    function applyDateState(td, date, today) {
      const dateStr = formatISODate(date);

      if (date < today) {
        td.className = 'past';
        return;
      }

      if (isSameDay(date, today)) {
        td.classList.add('today');
      }

      const bookedSource = getDateSource(date);
      if (bookedSource === 'airbnb') {
        td.classList.add('booked-airbnb');
      } else if (bookedSource === 'booking') {
        td.classList.add('booked-booking');
      } else if (bookedSource === 'manual') {
        td.classList.add('blocked-manual');
      } else {
        td.classList.add('available');
        td.style.cursor = 'pointer';
        td.addEventListener('click', () => handleDateClick(dateStr));
      }
    }

    function getDateSource(date) {
      const dateStr = formatISODate(date);
      
      // Check booked dates
      for (const range of calendarData.booked) {
        const start = new Date(range.start);
        const end = new Date(range.end);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        
        if (date >= start && date < end) {
          // Determine if it's from Airbnb or Booking based on some heuristic
          // For now, alternate for demo (you can enhance this)
          return range.source === 'booking' ? 'booking' : 'airbnb';
        }
      }

      // Check blocked dates
      for (const range of calendarData.blocked) {
        const start = new Date(range.start);
        const end = new Date(range.end);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        
        if (date >= start && date < end) {
          return 'manual';
        }
      }

      return null;
    }

    function handleDateClick(dateStr) {
      if (!selectedRange.start) {
        selectedRange.start = dateStr;
        selectDateInCalendar(dateStr);
      } else if (dateStr === selectedRange.start) {
        clearSelection();
      } else if (dateStr < selectedRange.start) {
        selectedRange.start = dateStr;
        selectDateInCalendar(dateStr);
      } else {
        selectedRange.end = dateStr;
        highlightRange(selectedRange.start, selectedRange.end);
      }
      updateButtons();
      updateStatus();
    }

    function selectDateInCalendar(dateStr) {
      clearRangeHighlight();
      const cell = document.querySelector(\`[data-date="\${dateStr}"]\`);
      if (cell) {
        cell.classList.add('range-single');
      }
    }

    function highlightRange(startStr, endStr) {
      clearRangeHighlight();
      const [startY, startM, startD] = startStr.split('-').map(Number);
      const [endY, endM, endD] = endStr.split('-').map(Number);
      
      const cursor = new Date(startY, startM - 1, startD);
      const limit = new Date(endY, endM - 1, endD);

      let isFirst = true;
      while (cursor <= limit) {
        const dateStr = formatISODate(cursor);
        const cell = document.querySelector(\`[data-date="\${dateStr}"]\`);
        
        if (cell) {
          if (isFirst && cursor.getTime() === limit.getTime()) {
            cell.classList.add('range-single');
          } else if (isFirst) {
            cell.classList.add('range-start');
          } else if (cursor.getTime() === limit.getTime()) {
            cell.classList.add('range-end');
          } else {
            cell.classList.add('range-mid');
          }
        }
        cursor.setDate(cursor.getDate() + 1);
        isFirst = false;
      }
    }

    function clearRangeHighlight() {
      document.querySelectorAll('.range-start, .range-mid, .range-end, .range-single').forEach(cell => {
        cell.classList.remove('range-start', 'range-mid', 'range-end', 'range-single');
      });
    }

    function clearSelection() {
      selectedRange = { start: null, end: null };
      clearRangeHighlight();
      updateButtons();
      updateStatus();
    }

    async function blockDates() {
      if (!selectedRange.start || !selectedRange.end) {
        showError('Please select a date range first');
        return;
      }

      try {
        const res = await fetch('/api/blocked-dates/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: currentProperty,
            start: selectedRange.start,
            end: selectedRange.end
          })
        });

        const data = await res.json();
        if (data.ok) {
          hideError();
          clearSelection();
          await loadCalendar();
          updateStatus();
        } else {
          showError('Failed to block dates: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showError('Error: ' + err.message);
      }
    }

    async function unblockDates() {
      if (!selectedRange.start || !selectedRange.end) {
        showError('Please select a date range first');
        return;
      }

      try {
        const res = await fetch('/api/blocked-dates/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: currentProperty,
            start: selectedRange.start,
            end: selectedRange.end
          })
        });

        const data = await res.json();
        if (data.ok) {
          hideError();
          clearSelection();
          await loadCalendar();
          updateStatus();
        } else {
          showError('Failed to unblock dates: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showError('Error: ' + err.message);
      }
    }

    function updateButtons() {
      console.log('[calendar] updateButtons called');
      const hasSelection = selectedRange.start && selectedRange.end;
      document.getElementById('block-btn').disabled = !hasSelection;
      document.getElementById('unblock-btn').disabled = !hasSelection;
      document.getElementById('clear-btn').disabled = !hasSelection;
    }

    function updateStatus() {
      const msg = document.getElementById('status-message');
      if (!selectedRange.start) {
        msg.textContent = 'Click dates to select a range';
      } else if (!selectedRange.end) {
        msg.textContent = \`Start: \${selectedRange.start} — Click end date or same date to confirm\`;
      } else {
        const nights = calculateNights(selectedRange.start, selectedRange.end);
        msg.textContent = \`Selected: \${selectedRange.start} to \${selectedRange.end} (\${nights} nights)\`;
      }
    }

    function showError(message) {
      const el = document.getElementById('error-message');
      el.textContent = message;
      el.style.display = 'block';
    }

    function hideError() {
      document.getElementById('error-message').style.display = 'none';
    }

    function formatISODate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return \`\${year}-\${month}-\${day}\`;
    }

    function isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear() &&
             a.getMonth() === b.getMonth() &&
             a.getDate() === b.getDate();
    }

    function calculateNights(startStr, endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      return Math.ceil((end - start) / (24 * 60 * 60 * 1000));
    }

    function logout() {
      if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('admin_session');
        localStorage.removeItem('admin_expires');
        window.location.href = '/admin';
      }
    }

    function checkAuth() {
      const token = localStorage.getItem('admin_session');
      const expires = localStorage.getItem('admin_expires');

      if (!token || !expires) {
        window.location.href = '/admin';
        return;
      }

      if (new Date(expires) < new Date()) {
        localStorage.removeItem('admin_session');
        localStorage.removeItem('admin_expires');
        window.location.href = '/admin';
      }
    }

    checkAuth();
    loadCalendar();
  </script>
</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
