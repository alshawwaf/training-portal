# Frontend Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 9999

# Run dev server (for development) - bind to all interfaces
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
