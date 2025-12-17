# Use the official Node.js runtime as the base image
# Use the 20-alpine image to satisfy undici requirements (Node.js >= 20.18.1)
FROM node:20-alpine

# Labels
LABEL maintainer="AIClient2API Team"
LABEL description="Docker image for AIClient2API server"

# Working directory
WORKDIR /app

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
# Note: we currently install all deps (no --production/--omit=dev) as defined by the project
RUN npm install 

# Copy source code
COPY . .

USER root

# Prepare persistent data directories/files and keep legacy paths working via symlinks
RUN mkdir -p /app/data/configs /app/data/logs /home/app \
    && touch /app/data/provider_pools.json /app/data/token-store.json \
    && rm -rf /app/logs /app/configs /app/provider_pools.json /app/token-store.json /app/config.json /app/input_system_prompt.txt /app/fetch_system_prompt.txt /app/pwd \
    && ln -s /app/data/logs /app/logs \
    && ln -s /app/data/configs /app/configs \
    && ln -s /app/data/provider_pools.json /app/provider_pools.json \
    && ln -s /app/data/token-store.json /app/token-store.json \
    && ln -s /app/data/config.json /app/config.json \
    && ln -s /app/data/input_system_prompt.txt /app/input_system_prompt.txt \
    && ln -s /app/data/fetch_system_prompt.txt /app/fetch_system_prompt.txt \
    && ln -s /app/data/pwd /app/pwd

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Startup command
# Starts the server with default config; supports additional args via environment variable.
# Example: docker run -e ARGS="--api-key mykey --port 8080" ...
CMD ["sh", "-c", "mkdir -p /app/data/configs /app/data/logs && touch /app/data/provider_pools.json /app/data/token-store.json && node src/api-server.js $ARGS"]