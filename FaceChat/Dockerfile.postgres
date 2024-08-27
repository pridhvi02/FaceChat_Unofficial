# Use the official PostgreSQL image from the Docker Hub
FROM postgres:16

# Install dependencies and pgvector
RUN apt-get update && \
    apt-get install -y postgresql-server-dev-16 gcc make git && \
    git clone https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install

# Add pgvector to shared_preload_libraries
RUN echo "shared_preload_libraries = 'vector'" >> /usr/share/postgresql/postgresql.conf.sample

# Expose PostgreSQL port
EXPOSE 5432
