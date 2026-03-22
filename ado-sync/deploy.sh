#!/usr/bin/env bash
# deploy.sh — Install and manage the ado-sync systemd service
#
# Usage:
#   ./deploy.sh install   — Install and start the service
#   ./deploy.sh start     — Start the service
#   ./deploy.sh stop      — Stop the service
#   ./deploy.sh restart   — Restart the service
#   ./deploy.sh status    — Show service status
#   ./deploy.sh logs      — Tail the service logs
#   ./deploy.sh uninstall — Stop and remove the service
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="ado-sync"
UNIT_FILE="${SCRIPT_DIR}/ado-sync.service"
USER_UNIT_DIR="${HOME}/.config/systemd/user"

ensure_venv() {
    if [[ ! -f "${SCRIPT_DIR}/.venv/bin/python" ]]; then
        echo "Creating virtual environment..."
        python3 -m venv "${SCRIPT_DIR}/.venv"
    fi
    echo "Installing dependencies..."
    "${SCRIPT_DIR}/.venv/bin/pip" install -q -r "${SCRIPT_DIR}/requirements.txt"
}

install_service() {
    ensure_venv

    mkdir -p "${USER_UNIT_DIR}"

    # Generate a user-mode unit (no root required)
    cat > "${USER_UNIT_DIR}/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=ADO Sync — BacklogMD to Azure DevOps user story bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
EnvironmentFile=${SCRIPT_DIR}/.env
ExecStart=${SCRIPT_DIR}/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8321
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    systemctl --user enable "${SERVICE_NAME}"
    systemctl --user start "${SERVICE_NAME}"
    echo "✅ ${SERVICE_NAME} installed and started"
    echo "   Port: 8321"
    echo "   Logs: journalctl --user -u ${SERVICE_NAME} -f"
    echo "   Health: curl -s http://127.0.0.1:8321/health | python3 -m json.tool"
}

uninstall_service() {
    systemctl --user stop "${SERVICE_NAME}" 2>/dev/null || true
    systemctl --user disable "${SERVICE_NAME}" 2>/dev/null || true
    rm -f "${USER_UNIT_DIR}/${SERVICE_NAME}.service"
    systemctl --user daemon-reload
    echo "✅ ${SERVICE_NAME} uninstalled"
}

case "${1:-help}" in
    install)   install_service ;;
    start)     systemctl --user start "${SERVICE_NAME}" ;;
    stop)      systemctl --user stop "${SERVICE_NAME}" ;;
    restart)   systemctl --user restart "${SERVICE_NAME}" ;;
    status)    systemctl --user status "${SERVICE_NAME}" ;;
    logs)      journalctl --user -u "${SERVICE_NAME}" -f ;;
    uninstall) uninstall_service ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|status|logs|uninstall}"
        exit 1
        ;;
esac
