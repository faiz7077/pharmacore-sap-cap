FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Demo profile: mocked users + in-memory SQLite seeded on every start
ENV NODE_ENV=development PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
