# Use a lightweight Node.js image
FROM node:20-slim
ENV TZ=America/Santiago

# Install system dependencies required for Puppeteer/Chrome if ever needed, 
# and ca-certificates for secure connections.
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create the auth directory and set permissions
# This is crucial for the volume mount to work correctly with the node user
RUN mkdir -p auth_info_baileys && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
