# Container shortcuts for MacDown Web (podman). Run `just` to list them.

export PODMAN_COMPOSE_WARNING_LOGS := "false"

default:
    @just --list

# Build the image and start the container on http://localhost:8080
up:
    podman machine start 2>/dev/null || true
    podman compose up --build -d
    @echo "MacDown Web: http://localhost:8080"

# Stop and remove the container (keeps the image for a fast next start)
down:
    podman compose down

# Remove the container, the image and its build cache
clean:
    podman compose down --rmi all --remove-orphans
    podman image prune -f

# Show container status
ps:
    podman compose ps

# Follow the container logs
logs:
    podman compose logs -f
