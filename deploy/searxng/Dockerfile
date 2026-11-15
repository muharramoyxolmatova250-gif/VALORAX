FROM searxng/searxng:latest

# Render routes HTTP traffic to PORT. SearXNG's image reads these env vars.
ENV SEARXNG_BIND_ADDRESS=0.0.0.0
ENV SEARXNG_PORT=10000

# Use the repository-managed settings, with JSON enabled for OmniSight.
COPY settings.yml /etc/searxng/settings.yml

EXPOSE 10000
