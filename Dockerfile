# syntax=docker/dockerfile:1

# --- build stage: compile the SvelteKit app with yarn ---------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
# install deps against the lockfile first for better layer caching
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
RUN yarn build

# --- runtime stage: node + ffmpeg, self-contained adapter-node output -----
FROM node:22-alpine AS runtime
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PEEKABOO_CONFIG=/config/config.yaml
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "build"]
