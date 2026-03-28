ARG NODE_IMAGE=node:current-alpine3.23
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src

ENV PORT=8081

EXPOSE 8081

CMD ["npm", "run", "start"]
