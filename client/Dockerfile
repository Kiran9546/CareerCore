# CareerCore web client: built once, served as static files by nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Leave VITE_API_URL empty to call the API through the same origin (/api),
# which the nginx config below proxies to the API service.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
# The site's public https address, e.g. https://careercore.example.edu.
# Canonical links, Open Graph URLs, structured data and sitemap.xml use it;
# without it they are left out of the build.
ARG VITE_SITE_URL=
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN npm run build

FROM nginx:1.27-alpine
# Substituted into the template at container start. See the template for
# what SITE_HOST does; empty means no host or https redirects.
ENV API_UPSTREAM=http://server:4000
ENV SITE_HOST=
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/cc-headers.conf /etc/nginx/snippets/cc-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
