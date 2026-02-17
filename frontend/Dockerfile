# Stage 0, "build-stage", based on Node.js, to build and compile the frontend
FROM node:20-alpine AS build-stage

WORKDIR /app

COPY package*.json /app/

RUN npm install

COPY ./ /app/

ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_BOOKS_API_KEY

RUN npm run build


# Stage 1, based on Nginx unprivileged, ready for production
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY --from=build-stage /app/dist/ /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx-proxy.conf /etc/nginx/extra-conf.d/backend-proxy.conf
