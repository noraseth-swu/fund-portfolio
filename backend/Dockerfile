# Stage 1: Cargo Chef Planner
FROM lukemathwalker/cargo-chef:latest-rust-1-bookworm AS planner
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo chef prepare --recipe-path recipe.json

# Stage 2: Cargo Chef Cook & Build
FROM lukemathwalker/cargo-chef:latest-rust-1-bookworm AS builder
WORKDIR /app
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --bin backend

# Stage 3: Runtime
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# Install runtime dependencies and python3 for email harvester
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    sqlite3 \
    python3 \
    python3-pip \
    python3-venv \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Create application user and data directory
RUN useradd -m -u 10001 -U appuser && \
    mkdir -p /app/data /app/scripts /app/config && \
    chown -R appuser:appuser /app

# Copy binary from builder
COPY --from=builder /app/target/release/backend /app/backend

# Copy python harvester scripts and config
COPY scripts/ /app/scripts/
COPY config/ /app/config/

# Ensure permissions
RUN chown -R appuser:appuser /app/scripts /app/config /app/backend

USER appuser

ENV SERVER_PORT=8088
ENV DATABASE_URL=sqlite:/app/data/portfolio.db

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8088/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/backend"]
