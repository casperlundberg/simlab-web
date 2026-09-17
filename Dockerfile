FROM node:22-alpine AS build

WORKDIR /src

# Dependencies first, so editing source does not re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Which code this bundle is. There is no .git in the build context, so CI
# passes the version and commit in; vite.config.ts stamps them into the bundle.
ARG VERSION=""
ARG COMMIT=""
ENV SIMLAB_WEB_VERSION=${VERSION} \
    SIMLAB_WEB_COMMIT=${COMMIT}

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

# The backend's address is substituted at start-up rather than baked in, so
# one image works in any namespace.
ENV SIMLAB_API_HOST=simlab-api \
    SIMLAB_API_PORT=8081

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 8080
