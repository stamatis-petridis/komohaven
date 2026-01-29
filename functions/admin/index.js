// GET /admin - Login page
// POST /admin - Authenticate and set session

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    return getLoginPage();
  }

  if (request.method === 'POST') {
    return handleLogin(request, env);
  }

  return new Response('Method not allowed', { status: 405 });
}

function getLoginPage() {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KomoHaven Admin - Login</title>
  <link rel="stylesheet" href="/admin.css">
</head>
<body>
  <div class="login-wrapper">
    <div class="login-container">
      <h1>🏠 KomoHaven Admin</h1>
      <p class="subtitle">Manage availability & bookings</p>
      
      <form id="loginForm">
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            placeholder="Enter admin password"
            autocomplete="off"
            required
          >
        </div>
        
        <button type="submit" class="btn-primary">Login</button>
        
        <div class="error" id="error"></div>
        <div class="loading" id="loading">Authenticating...</div>
      </form>
    </div>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const passwordInput = document.getElementById('password');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.classList.remove('show');
      loadingDiv.classList.remove('show');

      const password = passwordInput.value;
      
      if (!password) {
        showError('Password is required');
        return;
      }

      loadingDiv.classList.add('show');

      try {
        const response = await fetch('/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
          localStorage.setItem('admin_session', data.token);
          localStorage.setItem('admin_expires', data.expires);
          window.location.href = '/admin/dashboard';
        } else {
          showError(data.error || 'Authentication failed');
        }
      } catch (err) {
        showError('Network error: ' + err.message);
      } finally {
        loadingDiv.classList.remove('show');
      }
    });

    function showError(message) {
      errorDiv.textContent = message;
      errorDiv.classList.add('show');
    }

    passwordInput.focus();
  </script>
</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return jsonResponse({ ok: false, error: 'Password required' }, 400);
    }

    const adminPassword = env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD not set in environment');
      return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
    }

    if (password !== adminPassword) {
      return jsonResponse({ ok: false, error: 'Invalid password' }, 401);
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const token = btoa(`${Date.now()}:${adminPassword}`);

    return jsonResponse({
      ok: true,
      token,
      expires,
      message: 'Login successful'
    });
  } catch (err) {
    console.error('Login error:', err);
    return jsonResponse({ ok: false, error: 'Invalid request' }, 400);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
