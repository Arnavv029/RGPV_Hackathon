FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend project
COPY . /app/

# Collect static files with WhiteNoise
RUN python manage.py collectstatic --no-input

EXPOSE 8000

CMD ["gunicorn", "ev_backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
