# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:alpine AS base
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --chown=1000:1000 . .
RUN chown bun:bun /app
USER bun
RUN bun install
RUN bun desktop:web:build
# RUN chown bun:bun -R /app/apps/desktop

# Run the PWA
# EXPOSE 5173/tcp
# ENTRYPOINT ["bun", "desktop:web", "--host", "0.0.0.0", "--port", "5173"]

FROM nginx:alpine AS web
COPY --from=base /app/apps/desktop/dist /usr/share/nginx/html