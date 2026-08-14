# Dockerfile para DT Táctico
FROM node:20-alpine

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application source files
COPY src/ ./src/
COPY public/ ./public/
COPY .env.example ./.env.example

# Create data directory for persistent SQLite database
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV DB_PATH=/app/data/tactics.db

CMD ["node", "src/server.js"]
