.PHONY: help build dev prod up down logs clean test shell db-shell redis-shell

# Default target
help:
	@echo "BSV Torrent - Docker Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment with hot reload"
	@echo "  make build-dev    - Build development Docker image"
	@echo "  make logs-dev     - Show development container logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make build        - Build production Docker image"
	@echo "  make logs         - Show production container logs"
	@echo ""
	@echo "Common:"
	@echo "  make up           - Start all services (production)"
	@echo "  make down         - Stop all services"
	@echo "  make restart      - Restart all services"
	@echo "  make ps           - List running containers"
	@echo "  make clean        - Remove containers and volumes"
	@echo ""
	@echo "Utilities:"
	@echo "  make shell        - Access app container shell"
	@echo "  make db-shell     - Access MongoDB shell"
	@echo "  make redis-shell  - Access Redis CLI"
	@echo "  make test         - Run tests in container"
	@echo "  make lint         - Run linter in container"
	@echo ""
	@echo "Database:"
	@echo "  make db-backup    - Backup MongoDB database"
	@echo "  make db-restore   - Restore MongoDB database"

# Development commands
dev:
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Development server running at http://localhost:3000"
	@echo "MongoDB Express at http://localhost:8081"
	@echo "Redis Commander at http://localhost:8082"

build-dev:
	docker-compose -f docker-compose.dev.yml build --no-cache

logs-dev:
	docker-compose -f docker-compose.dev.yml logs -f

down-dev:
	docker-compose -f docker-compose.dev.yml down

# Production commands
prod:
	docker-compose up -d
	@echo "Production server running at http://localhost:3000"

build:
	docker-compose build --no-cache

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

ps:
	docker-compose ps

# Clean up
clean:
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v
	docker system prune -f

clean-all:
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v
	docker system prune -af --volumes

# Shell access
shell:
	docker-compose exec app sh

shell-dev:
	docker-compose -f docker-compose.dev.yml exec app sh

db-shell:
	docker-compose exec mongodb mongosh bsv-torrent

db-shell-dev:
	docker-compose -f docker-compose.dev.yml exec mongodb mongosh bsv-torrent

redis-shell:
	docker-compose exec redis redis-cli

redis-shell-dev:
	docker-compose -f docker-compose.dev.yml exec redis redis-cli

# Testing
test:
	docker-compose exec app npm test

test-dev:
	docker-compose -f docker-compose.dev.yml exec app npm test

test-watch:
	docker-compose -f docker-compose.dev.yml exec app npm run test:watch

test-coverage:
	docker-compose -f docker-compose.dev.yml exec app npm run test:coverage

lint:
	docker-compose exec app npm run lint

lint-dev:
	docker-compose -f docker-compose.dev.yml exec app npm run lint

# Database operations
db-backup:
	@mkdir -p backups
	docker-compose exec -T mongodb mongodump --db=bsv-torrent --archive=/tmp/backup.gz --gzip
	docker-compose exec -T mongodb cat /tmp/backup.gz > backups/bsv-torrent-$$(date +%Y%m%d-%H%M%S).gz
	@echo "Database backed up to backups/"

db-restore:
	@echo "Usage: make db-restore FILE=backups/bsv-torrent-20240101-120000.gz"
	@test -n "$(FILE)" || exit 1
	@test -f "$(FILE)" || (echo "File not found: $(FILE)" && exit 1)
	cat $(FILE) | docker-compose exec -T mongodb sh -c 'cat > /tmp/restore.gz'
	docker-compose exec mongodb mongorestore --db=bsv-torrent --archive=/tmp/restore.gz --gzip --drop
	@echo "Database restored from $(FILE)"

# Environment setup
env-setup:
	@test -f .env || cp .env.example .env
	@echo "Environment file created. Please edit .env with your settings."

# Health check
health:
	@curl -f http://localhost:3000/api/health || echo "Service unhealthy"

# Quick start for first time users
quickstart: env-setup build-dev dev
	@echo ""
	@echo "BSV Torrent is now running!"
	@echo "- Application: http://localhost:3000"
	@echo "- MongoDB UI: http://localhost:8081"
	@echo "- Redis UI: http://localhost:8082"
	@echo ""
	@echo "To stop: make down-dev"
	@echo "To view logs: make logs-dev"