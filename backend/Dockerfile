FROM node:18-alpine

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com

COPY package*.json ./
RUN npm config set registry "${NPM_REGISTRY}" \
  && npm install --production

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server.js"]
