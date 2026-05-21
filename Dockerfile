FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS builder

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates \
    g++ \
    libgs-dev \
    make \
    pkg-config \
    tar \
    wget \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN wget -O pstoedit.tar.gz https://sourceforge.net/projects/pstoedit/files/pstoedit/4.01/pstoedit-4.01.tar.gz/download &&\
    tar -zxf pstoedit.tar.gz &&\
    cd pstoedit-4.01 &&\
    ./configure --prefix=/opt/pstoedit &&\
    make &&\
    make install

FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

LABEL version="2.0"
LABEL maintainer="Hive Solutions <development@hive.pt>"

EXPOSE 8080

ENV LEVEL=INFO
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production
ENV PATH=/opt/pstoedit/bin:$PATH
ENV LD_LIBRARY_PATH=/opt/pstoedit/lib:$LD_LIBRARY_PATH

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ghostscript \
    inkscape \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/pstoedit /opt/pstoedit

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
