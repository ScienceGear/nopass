# NovaBank backend  dev image (tsx watch)
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3001
CMD ["npm", "run", "dev"]
