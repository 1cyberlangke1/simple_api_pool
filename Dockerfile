ARG BUILDPLATFORM=linux/amd64
FROM --platform=${BUILDPLATFORM} alpine:3.21 AS builder

ARG BUILDARCH=amd64
ARG TARGETOS=linux
ARG TARGETARCH=amd64

ENV GO_VERSION=1.26.1
ENV GO_TARBALL_URL=https://mirrors.aliyun.com/golang/go${GO_VERSION}.linux-${BUILDARCH}.tar.gz
ENV PATH=/usr/local/go/bin:${PATH}

RUN apk add --no-cache ca-certificates tar wget

WORKDIR /src/backend

RUN wget -O /tmp/go.tgz ${GO_TARBALL_URL} \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY frontend/ /src/frontend/

RUN GOOS=$TARGETOS GOARCH=$TARGETARCH CGO_ENABLED=0 go build -o /out/server .

FROM alpine:3.21

WORKDIR /app

COPY --from=builder /out/server ./server
COPY --from=builder /src/frontend ./frontend

EXPOSE 18080

CMD ["./server"]
