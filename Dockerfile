# Stage 1: Build static frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python FastAPI runtime
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

RUN mkdir -p /data

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /frontend/dist ./static

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
VOLUME ["/data"]

ENTRYPOINT ["/app/entrypoint.sh"]