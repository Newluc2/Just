FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p data uploads

EXPOSE 5001

CMD ["node", "src/index.js"]
