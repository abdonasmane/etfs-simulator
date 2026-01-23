FROM grafana/grafana:latest

# Copy provisioning configs
COPY provisioning /etc/grafana/provisioning

# Anonymous read access (no login needed to view dashboards)
ENV GF_AUTH_ANONYMOUS_ENABLED=true
ENV GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
ENV GF_SECURITY_ADMIN_PASSWORD=admin
ENV GF_SERVER_HTTP_PORT=3000

# Default Prometheus URL (override in Render)
ENV PROMETHEUS_URL=http://localhost:9090

EXPOSE 3000
