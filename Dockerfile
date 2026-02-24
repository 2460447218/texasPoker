# Use Node.js 18
FROM node:18

# Set working directory
WORKDIR /app

# Copy root package.json (if any)
COPY package*.json ./

# Copy backend
COPY backend/package*.json ./backend/

# Install dependencies for backend
WORKDIR /app/backend
RUN npm install

# Copy source code
COPY backend/ ./

# Expose port 7860 (Hugging Face Spaces default)
EXPOSE 7860

# Set environment variable for port
ENV PORT=7860

# Start the server
CMD ["node", "server.js"]
