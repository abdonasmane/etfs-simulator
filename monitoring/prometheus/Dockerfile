FROM prom/prometheus:latest

USER root

# Copy config template
COPY prometheus.yml /etc/prometheus/prometheus.yml.template

# Entrypoint: inject env vars and start prometheus
# - BACKEND_HOST: e.g. etfs-simulator-backend.onrender.com
# - FRONTEND_HOST: e.g. etfs-m9tm.onrender.com
RUN printf '#!/bin/sh\n\
sed -e "s|BACKEND_HOST_PLACEHOLDER|${BACKEND_HOST:-localhost:8080}|g" \
    -e "s|FRONTEND_HOST_PLACEHOLDER|${FRONTEND_HOST:-localhost:80}|g" \
    /etc/prometheus/prometheus.yml.template > /etc/prometheus/prometheus.yml\n\
exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=1h \
  --storage.tsdb.retention.size=50MB \
  --web.listen-address=0.0.0.0:9090 \
  --web.enable-lifecycle\n' > /entrypoint.sh && chmod +x /entrypoint.sh

USER nobody

EXPOSE 9090

ENTRYPOINT ["/entrypoint.sh"]
