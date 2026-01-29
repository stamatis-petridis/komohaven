// GET /admin/dashboard - Admin dashboard (requires auth)

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
      <h2>Property Selection</h2>
      <div class="tabs">
        <button class="tab active" onclick="selectProperty('blue-dream')">🌊 Blue Dream</button>
        <button class="tab" onclick="selectProperty('studio-9')">🎨 Studio 9</button>
      </div>
    </div>

    <div class="card">
      <h2>Calendar & Availability</h2>
      <div class="stub-message">
        📅 Calendar widget will be built here<br>
        <small>Block/unblock dates for managing availability</small>
      </div>
    </div>

    <div class="card">
      <h2>Status</h2>
      <div class="stub-message">
        Status information will display here
      </div>
    </div>
  </div>

  <script>
    function selectProperty(slug) {
      console.log('Selected property:', slug);
      // Update active tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
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
  </script>
</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
