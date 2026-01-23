FROM grafana/grafana:latest

USER root

# Copy provisioning configs
COPY provisioning /etc/grafana/provisioning

# Entrypoint: inject PROMETHEUS_URL and start grafana
RUN printf '#!/bin/sh\n\
sed -i "s|PROMETHEUS_URL_PLACEHOLDER|${PROMETHEUS_URL:-http://localhost:9090}|g" /etc/grafana/provisioning/datasources/prometheus.yml\n\
exec /run.sh\n' > /entrypoint.sh && chmod +x /entrypoint.sh

USER grafana

# Anonymous read access (no login needed to view dashboards)
ENV GF_AUTH_ANONYMOUS_ENABLED=true
ENV GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
ENV GF_SECURITY_ADMIN_PASSWORD=admin
ENV GF_SERVER_HTTP_PORT=3000

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
