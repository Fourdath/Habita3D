FROM postgres:18-alpine

# The upstream image bundles gosu built with an older Go standard library.
# Alpine's small C implementation provides the same user:group + exec operation
# used by docker-entrypoint.sh without that unused Go/TLS dependency surface.
RUN apk add --no-cache su-exec \
    && grep -q 'exec gosu postgres' /usr/local/bin/docker-entrypoint.sh \
    && grep -q 'exec gosu postgres' /usr/local/bin/docker-ensure-initdb.sh \
    && sed -i 's/exec gosu postgres/exec su-exec postgres/' \
        /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-ensure-initdb.sh \
    && rm /usr/local/bin/gosu \
    && test "$(su-exec postgres id -u)" = "$(id -u postgres)" \
    && test "$(su-exec postgres:postgres id -g)" = "$(id -g postgres)"
