FROM hivesolutions/ubuntu_dev:latest

LABEL version="1.0"
LABEL maintainer="Hive Solutions <development@hive.pt>"

EXPOSE 8080

ENV LEVEL INFO
ENV HOST 0.0.0.0
ENV PORT 8080
ENV NODE_ENV production

ADD app.js /app/
ADD package.json /app/
ADD lib /app/lib
ADD static /app/static
ADD views /app/views

WORKDIR /app

RUN curl -sL https://deb.nodesource.com/setup_11.x | bash -
RUN apt-get update && apt-get install -y nodejs g++ ghostscript inkscape
RUN npm install
RUN wget https://sourceforge.net/projects/pstoedit/files/pstoedit/3.74/pstoedit-3.74.tar.gz/download &&\
    tar -zxvf download && cd pstoedit-3.74 && ./configure --prefix /usr && make && make install

CMD ["/usr/bin/node", "/app/app.js"]
