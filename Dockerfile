FROM alpine:latest

RUN apk add --no-cache \
    postgresql-client \
    ffmpeg \
    curl \
    bash \
    tzdata \
    && rm -rf /var/cache/apk/*

