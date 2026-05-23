FROM node:26-trixie-slim

LABEL version="2.1"
LABEL maintainer="Hive Solutions <development@hive.pt>"

EXPOSE 8080

ENV LEVEL=INFO
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ghostscript \
    inkscape \
    pstoedit \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json /app/
RUN npm install --omit=dev && npm cache clean --force

COPY app.js /app/
COPY config /app/config
COPY lib /app/lib
COPY res /app/res
COPY static /app/static
COPY views /app/views

RUN groupadd --gid 10001 signatur &&\
    useradd --create-home --shell /bin/bash --uid 10001 --gid 10001 signatur &&\
    chown -R signatur:signatur /app
USER signatur

CMD ["node", "/app/app.js"]
