# Use a Node.js base image
FROM node:22-alpine

# Install yq (which provides xq)
RUN apk add --no-cache yq

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Creates a 'dist' folder with the compiled project.
RUN npm run build

# Your app binds to port 32397 so you'll use this port in your docker-compose file
EXPOSE 32397

# Start the app
CMD [ "node", "dist/main.js", "--config=/config/config.json" ]
