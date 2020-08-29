FROM node:10 AS builder
WORKDIR /usr
COPY package.json ./
RUN yarn install --frozen-lockfile
COPY webpack.config.js tsconfig.json ./
COPY ./src ./src
RUN yarn build

FROM node:10
WORKDIR /usr/app
COPY --from=builder /usr/dist /usr/package.json ./
RUN yarn install --frozen-lockfile --production
EXPOSE 8080
CMD [ "node", "server.js" ]
