FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
