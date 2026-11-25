# Build Stage
FROM rust:1.99-bookworm AS builder

# Build from the repository root with -f backend/api/Dockerfile.
WORKDIR /usr/src/app/backend/api
COPY backend/api/Cargo.toml backend/api/Cargo.lock ./
COPY backend/api/src ./src
COPY backend/api/migrations_local ./migrations_local
COPY backend/api/migrations_cloud ./migrations_cloud
COPY backend/api/migrations_sqlite ./migrations_sqlite

# Build release binary
RUN cargo build --release --locked --bins

# Production Runtime Stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled binary from builder
COPY --from=builder /usr/src/app/backend/api/target/release/hotel_crm_api /app/hotel_crm_api

COPY --from=builder /usr/src/app/backend/api/target/release/migrate /app/migrate

ENV PORT=3000
ENV ENVIRONMENT=production

EXPOSE 3000

CMD ["/bin/sh", "-c", "/app/migrate && exec /app/hotel_crm_api"]
