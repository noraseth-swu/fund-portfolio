# ==============================================================================
# Multi-stage Dockerfile for Fund Portfolio Management Web App
# Produces an ultra-lean, high-performance production container (< 50MB)
# ==============================================================================

# Stage 1: Build React Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Build Rust Backend
FROM rust:1-slim-bookworm AS backend-builder
WORKDIR /app/backend

# Install build dependencies for SQLite & OpenSSL/Rustls
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY backend/Cargo*.toml ./
# Build dummy project to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

# Copy real backend source code
COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

# Stage 3: Lightweight Production Runtime (< 40MB)
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates sqlite3 && rm -rf /var/lib/apt/lists/*

# Copy compiled backend binary from Stage 2
COPY --from=backend-builder /app/backend/target/release/backend /app/backend

# Copy compiled static frontend from Stage 1 into /app/dist
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Persistent data directory for SQLite database
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV SERVER_PORT=8088
ENV DATABASE_URL="sqlite:/app/data/portfolio.db"
EXPOSE 8088

ENTRYPOINT ["/app/backend"]
