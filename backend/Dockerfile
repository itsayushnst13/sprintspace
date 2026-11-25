FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/src ./src
USER node
EXPOSE 5001
CMD ["node", "src/server.js"]
