# Etapa 1: compilar la aplicación con Node
FROM node:22-slim AS compilacion

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta VITE_API_URL al compilar; si cambia hay que reconstruir.
ARG VITE_API_URL=http://localhost:3000/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Etapa 2: servir dist con Nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion /app/dist /usr/share/nginx/html

EXPOSE 80
