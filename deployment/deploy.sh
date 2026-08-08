#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${SCRIPT_DIR}/CONFIG"

if ! podman volume exists "${CONTENT_VOLUME}"; then
    podman volume create "${CONTENT_VOLUME}" >/dev/null
fi
podman rm -f "${CONTAINER_NAME}" 2>/dev/null || true

podman run \
    --detach \
    --name "${CONTAINER_NAME}" \
    --network "${PODMAN_NETWORK}" \
    --publish "${SSH_HOST_PORT}:22" \
    --publish "${HTTP_HOST_PORT}:80" \
    --publish "${HTTPS_HOST_PORT}:443" \
    --volume /etc/localtime:/etc/localtime:ro \
    --volume /etc/timezone:/etc/timezone:ro \
    --volume "${CONTENT_VOLUME}:/var/www/html:ro" \
    --health-cmd 'curl -fsS http://localhost/ || exit 1' \
    --health-interval 10s \
    --health-timeout 5s \
    --health-start-period 10s \
    --health-retries 3 \
    "${NGINX_IMAGE}"

echo "Container '${CONTAINER_NAME}' started."
echo "Content volume '${CONTENT_VOLUME}' mounted at /var/www/html (read-only)."
