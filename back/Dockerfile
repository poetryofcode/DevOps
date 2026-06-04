# syntax=docker/dockerfile:1.7

# ---- Stage 1: builder ----
# TODO:
#   - Set the working directory
#   - Install all dependencies (including dev deps needed to compile)
#   - Copy TypeScript config files (tsconfig*.json, nest-cli.json) and the src/ folder
#   - Run the production build (compile TS into dist/)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm install
COPY tsconfig*.json . 
COPY nest-cli.json . 
COPY src ./src
RUN npm run build 
# That's npm run build — it's building the TypeScript code into JavaScript (dist/), not building a Docker image. The Docker image is built by the docker build command in the Makefile.

# ---- Stage 2: runtime ----
# TODO:
#   - Set the working directory
#   - Set NODE_ENV=production
#   - Install only production dependencies
#   - Copy the compiled dist/ from the builder stage
#   - EXPOSE the app port and start the server (node dist/main.js)
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json .
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist
EXPOSE 3000
CMD [ "node", "dist/main.js" ]
# by default npm ci installs all dependencies including dev. You need --omit=dev to skip dev dependencies.

# EXPOSE ${PORT}
# EXPOSE doesn't read env vars from .env files — those are only loaded at runtime by Docker Compose. Use the hardcoded value: EXPOSE 3000



