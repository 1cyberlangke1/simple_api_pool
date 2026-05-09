ARG BUILDPLATFORM=linux/amd64
FROM --platform=${BUILDPLATFORM} alpine:3.21 AS builder

ARG BUILDARCH=amd64
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG APP_VERSION=dev
ARG APP_REVISION=local
ARG APP_BUILD_TIME=unknown
ARG GO_TARBALL_SHA256=

ENV GO_VERSION=1.26.1
ENV GO_TARBALL_URL=https://go.dev/dl/go${GO_VERSION}.linux-${BUILDARCH}.tar.gz
ENV PATH=/usr/local/go/bin:${PATH}

RUN apk add --no-cache ca-certificates tar wget

WORKDIR /src/src/backend

RUN case "${BUILDARCH}" in \
        amd64) expected_sha256="${GO_TARBALL_SHA256:-031f088e5d955bab8657ede27ad4e3bc5b7c1ba281f05f245bcc304f327c987a}" ;; \
        arm64) expected_sha256="${GO_TARBALL_SHA256:-a290581cfe4fe28ddd737dde3095f3dbeb7f2e4065cab4eae44dfc53b760c2f7}" ;; \
        *) expected_sha256="${GO_TARBALL_SHA256}" ;; \
    esac \
    && if [ -z "${expected_sha256}" ]; then echo "missing GO_TARBALL_SHA256 for ${BUILDARCH}"; exit 1; fi \
    && wget -O /tmp/go.tgz "${GO_TARBALL_URL}" \
    && echo "${expected_sha256}  /tmp/go.tgz" | sha256sum -c - \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz

COPY src/backend/go.mod src/backend/go.sum ./
RUN go mod download

COPY src/backend/ ./
COPY src/frontend/ /src/src/frontend/
COPY scripts/ /src/scripts/

RUN go run /src/scripts/build_frontend.go -root /src \
    && mkdir -p /out/frontend \
    && cp -R /src/src/frontend/. /out/frontend/ \
    && sed -i \
        -e "s|__APP_VERSION__|${APP_VERSION}|g" \
        -e "s|__APP_REVISION__|${APP_REVISION}|g" \
        -e "s|__APP_BUILD_TIME__|${APP_BUILD_TIME}|g" \
        /out/frontend/index.html \
    && GOOS=$TARGETOS GOARCH=$TARGETARCH CGO_ENABLED=0 go build -o /out/server .

FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /out/server ./server
COPY --from=builder /out/frontend ./frontend

EXPOSE 18080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:18080/api/health || exit 1

CMD ["./server"]
