# Etapa de construcción
FROM node:18 AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Etapa de producción
FROM node:18 AS runtime
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

# ✅ Arranque directo (evita el error de "node dist/main")
CMD ["node", "dist/main.js"]
