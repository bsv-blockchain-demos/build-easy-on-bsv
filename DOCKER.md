# BSV Torrent - Docker Deployment Guide

## Overview

BSV Torrent is containerized with Docker for easy deployment across different environments. This guide covers setup for development, testing, and production deployments.

## Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- 4GB+ available RAM
- 20GB+ available disk space

### Development Setup

1. **Clone and Setup Environment**
   ```bash
   git clone <repository-url>
   cd bsv-torrent
   cp .env.example .env
   ```

2. **Edit Environment Variables**
   ```bash
   nano .env
   ```
   Update the following key variables:
   - `BSV_MNEMONIC`: Your 12-word mnemonic for wallet generation
   - `ARC_URL` and `ARC_API_KEY`: BSV transaction broadcasting service
   - `OVERLAY_SERVICE_URL`: BSV overlay network endpoint

3. **Start Development Environment**
   ```bash
   make dev
   # OR
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. **Access Services**
   - **Application**: http://localhost:3000
   - **MongoDB Admin**: http://localhost:8081
   - **Redis Admin**: http://localhost:8082

### Production Setup

1. **Build Production Images**
   ```bash
   make build
   # OR
   docker-compose build --no-cache
   ```

2. **Start Production Stack**
   ```bash
   make prod
   # OR
   docker-compose up -d
   ```

3. **With Nginx Reverse Proxy**
   ```bash
   docker-compose --profile production up -d
   ```

## Docker Configuration

### Images Built

- **bsv-torrent-app**: Next.js application with BSV integration
- **mongo:7.0-jammy**: MongoDB database
- **redis:7-alpine**: Redis cache
- **nginx:alpine**: Reverse proxy (production)

### Volumes

- `mongodb-data`: Persistent MongoDB data
- `redis-data`: Redis persistence
- `torrent-data`: Uploaded torrent files
- `uploads`: Temporary upload storage

### Networks

- `bsv-torrent-network`: Custom bridge network for service communication

## Environment Variables

### Core Application

```env
NODE_ENV=production
MONGODB_URI=mongodb://mongodb:27017/bsv-torrent
MONGODB_DB=bsv-torrent
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### BSV Configuration

```env
BSV_NETWORK=testnet                    # or mainnet
BSV_MNEMONIC="your twelve word..."     # Wallet mnemonic
BSV_WALLET_PATH="m/44'/236'/0'"        # HD derivation path
ARC_URL=https://arc.taal.com          # Transaction broadcaster
ARC_API_KEY=your-arc-key              # ARC API access
```

### Services

```env
OVERLAY_SERVICE_URL=https://overlay.example.com
OVERLAY_API_KEY=your-overlay-key
REDIS_URL=redis://redis:6379
SESSION_SECRET=your-secret-key-32-chars-min
```

## Available Commands

### Makefile Commands

```bash
# Development
make dev          # Start development with hot reload
make build-dev    # Build development image
make logs-dev     # Show development logs
make down-dev     # Stop development environment

# Production
make prod         # Start production environment
make build        # Build production image
make logs         # Show production logs

# Utilities
make shell        # Access app container shell
make db-shell     # Access MongoDB shell
make redis-shell  # Access Redis CLI
make test         # Run tests in container
make lint         # Run linter in container

# Database
make db-backup    # Backup MongoDB
make db-restore FILE=backup.gz  # Restore from backup

# Quick setup
make quickstart   # First-time setup with defaults
```

### Docker Compose Files

- `docker-compose.yml`: Production configuration
- `docker-compose.dev.yml`: Development with hot reload
- `docker-compose.simple.yml`: Minimal setup without networks

## Deployment Scenarios

### Local Development

```bash
# Hot reload development
make dev

# Access logs
make logs-dev

# Run tests
make test-dev

# Access database
make db-shell-dev
```

### Staging/Testing

```bash
# Build fresh images
make build

# Deploy with production config
make prod

# Health check
make health

# Monitor logs
make logs
```

### Production Deployment

```bash
# Full production stack with Nginx
docker-compose --profile production up -d

# Monitor services
docker-compose ps
docker-compose logs -f app

# Scale horizontally (if needed)
docker-compose up -d --scale app=3
```

### Cloud Deployment

For cloud providers (AWS, GCP, Azure):

1. **Build and Push Images**
   ```bash
   # Tag for registry
   docker tag bsv-torrent-app your-registry/bsv-torrent:latest

   # Push to registry
   docker push your-registry/bsv-torrent:latest
   ```

2. **Use Orchestration**
   - **Kubernetes**: See `k8s/` directory (if provided)
   - **Docker Swarm**: Use docker-compose with swarm mode
   - **ECS/EKS**: Convert compose to task definitions

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:3000/api/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "app": "operational",
    "database": "operational",
    "redis": "operational",
    "bsv": "operational"
  }
}
```

### Container Health

```bash
# Check container status
docker-compose ps

# View container logs
docker-compose logs app
docker-compose logs mongodb

# Execute commands in container
docker-compose exec app npm run test
docker-compose exec mongodb mongosh bsv-torrent
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check port usage
   lsof -i :3000
   lsof -i :27017

   # Change ports in docker-compose.yml
   ports:
     - "3001:3000"  # Use different host port
   ```

2. **Network Issues**
   ```bash
   # Reset Docker networks
   docker network prune -f

   # Use host networking (last resort)
   network_mode: host
   ```

3. **Build Failures**
   ```bash
   # Clean Docker cache
   docker system prune -af

   # Rebuild without cache
   docker-compose build --no-cache
   ```

4. **Database Connection**
   ```bash
   # Check MongoDB logs
   docker-compose logs mongodb

   # Test connection manually
   docker-compose exec app node -e "
     require('mongodb').MongoClient
       .connect('mongodb://mongodb:27017')
       .then(() => console.log('Connected'))
       .catch(console.error)
   "
   ```

5. **Memory Issues**
   ```bash
   # Increase Docker memory limit
   # Docker Desktop: Settings > Resources > Memory > 4GB+

   # Monitor container memory
   docker stats
   ```

### Performance Optimization

1. **Production Builds**
   ```bash
   # Multi-stage builds minimize image size
   # Enable BuildKit
   export DOCKER_BUILDKIT=1
   docker-compose build
   ```

2. **Resource Limits**
   ```yaml
   # In docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 1G
         cpus: '0.5'
   ```

3. **Volume Performance**
   ```bash
   # Use named volumes for better performance
   volumes:
     - mongodb-data:/data/db  # Named volume
     # NOT: ./data:/data/db   # Bind mount (slower)
   ```

## Security Considerations

### Secrets Management

- Use Docker secrets in production
- Never commit `.env` files
- Rotate API keys regularly
- Use read-only containers where possible

### Network Security

```yaml
# Restrict network access
networks:
  app-network:
    driver: bridge
    internal: true  # No external access

  proxy-network:
    driver: bridge  # Only proxy has external access
```

### Container Security

```yaml
# Run as non-root user
user: 1001:1001

# Read-only filesystem
read_only: true
tmpfs:
  - /tmp

# Drop capabilities
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE
```

## Backup & Recovery

### Automated Backups

```bash
# Schedule with cron
0 2 * * * cd /path/to/bsv-torrent && make db-backup

# Backup script
#!/bin/bash
cd /path/to/bsv-torrent
make db-backup
aws s3 cp backups/ s3://your-backup-bucket/ --recursive
```

### Disaster Recovery

```bash
# Restore from backup
make db-restore FILE=backups/bsv-torrent-20240115-020000.gz

# Rebuild from scratch
docker-compose down -v  # Remove volumes
docker-compose up -d    # Fresh start
```

## Support

- **Documentation**: See `/docs` directory
- **Issues**: GitHub Issues
- **Logs**: Use `make logs` commands
- **Health**: Check `/api/health` endpoint

---

**Note**: This Docker setup is optimized for the BSV Torrent application with Bitcoin SV micropayments and overlay network integration. Ensure your BSV configuration is properly set before deployment.