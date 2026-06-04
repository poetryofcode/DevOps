# syntax=docker/dockerfile:1.7

# ---- Stage 1: builder ----
# TODO:
#   - Set the working directory
#   - Declare a build argument VITE_API_URL and expose it as an env var
#     (Vite bakes env vars into the bundle at build time)
#   - Install all dependencies
#   - Copy the source code
#   - Run the production build (static files go to dist/)
FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: nginx runtime ----
# TODO:
#   - Copy the built static files from the builder stage to nginx's html dir
#   - Copy the custom nginx.conf into /etc/nginx/conf.d/
#   - EXPOSE port 80 and run nginx in the foreground
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
# Correct, no need for WORKDIR in stage 2 — nginx serves files from /usr/share/nginx/html
# It's the default folder where nginx looks for static files to serve. When a browser requests your site, nginx reads the files from that folder and sends them back.
# no need COPY package*.json .?
# Correct, no need. Stage 2 is nginx — it just serves static files. No Node, no npm, no dependencies to install. 
# but for backend we did for second stage
# Yes, because the backend stage 2 runs Node (node dist/main.js) — it needs the production npm packages to execute.
# where did you get /app/dist
# From stage 1 — WORKDIR /app sets the working directory to /app, and npm run build outputs the compiled files to dist/ inside that working directory. So the full path is /app/dist
# nginx — starts nginx
# The ; is nginx config syntax — every directive must end with a semicolon.