# Node com ffmpeg — é só disso que o montador precisa, sem dependência npm.
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY *.js ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "index.js"]
