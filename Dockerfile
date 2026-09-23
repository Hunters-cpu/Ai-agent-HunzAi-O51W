FROM node:20-alpine

# Install dependencies untuk Baileys
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create sessions directory
RUN mkdir -p /app/sessions

ENV NODE_ENV=production
ENV SESSION_DIR=/app/sessions

CMD ["node", "index.js"]
