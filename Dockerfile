# Base Node image
FROM node:20-alpine AS base
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile and workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./

# Copy all packages and workspaces
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Build libraries and all apps
RUN pnpm run build

# Runner stage
FROM node:20-alpine AS runner
RUN npm install -g pnpm

WORKDIR /app

# Copy built outputs and node_modules from base
COPY --from=base /app /app

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

# Start the unified backend server
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
