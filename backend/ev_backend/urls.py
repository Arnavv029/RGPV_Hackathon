"""
Root URL Configuration
----------------------
This is the MAIN router of the entire Django project.

How URLs work in Django:
  Browser/Postman sends a request to → http://localhost:8000/api/auth/login/
  Django reads this file → sees prefix 'api/' → routes to core/urls.py
  core/urls.py → sees 'auth/login/' → calls the correct view function

We also serve uploaded media files (station images) during development.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.db import connection


def health_check(request):
    db_ok = True
    try:
        connection.ensure_connection()
    except Exception:
        db_ok = False
    return JsonResponse({
        'status': 'healthy' if db_ok else 'degraded',
        'database': 'connected' if db_ok else 'disconnected',
        'service': 'HapticEV Backend',
    }, status=200 if db_ok else 503)


urlpatterns = [
    # Health checks for deployment monitors (Render, Railway, Fly, AWS)
    path('health/', health_check, name='health-check'),
    path('api/health/', health_check, name='api-health-check'),

    # Django Admin Panel → http://localhost:8000/admin/
    path('admin/', admin.site.urls),

    # All our API routes → http://localhost:8000/api/...
    path('api/', include('core.urls')),
]

# Serve uploaded images (station photos) during development
# In production, a web server like Nginx would handle this.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
