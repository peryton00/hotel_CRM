# Build Stage
FROM rust:1.85-bookworm AS builder

WORKDIR /usr/src/app
COPY . .

# Build release binary
RUN cargo build --release --bin hotel_crm_api

# Production Runtime Stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled binary from builder
COPY --from=builder /usr/src/app/target/release/hotel_crm_api /app/hotel_crm_api

ENV PORT=3000
ENV ENVIRONMENT=production

EXPOSE 3000

CMD ["/app/hotel_crm_api"]
