
# Use Node.js image to build the frontend
FROM node:18 as build

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json into the container
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the entire frontend directory into the container
COPY . .

# Copy the .env file into the container
COPY .env .env

# Build the React/Next.js app
RUN npm run build

# Serve the frontend using a Node.js server
EXPOSE 3000
CMD ["npm", "start"]




