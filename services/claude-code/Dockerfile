FROM node:22-slim

WORKDIR /app

RUN npm install -g @anthropic-ai/claude-code

COPY services/claude-code/package.json .
RUN npm install --production

COPY services/claude-code/server.js .

EXPOSE 3002

CMD ["node", "server.js"]
