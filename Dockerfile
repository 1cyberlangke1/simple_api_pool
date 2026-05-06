FROM alpine:3.21 AS builder
ENV GO_VERSION=1.26.1
ENV GO_TARBALL_URL=https://mirrors.aliyun.com/golang/go1.26.1.linux-amd64.tar.gz
ENV PATH=/usr/local/go/bin:${PATH}
WORKDIR /src
RUN wget -O /tmp/go.tgz ${GO_TARBALL_URL} \
	&& tar -C /usr/local -xzf /tmp/go.tgz \
	&& rm /tmp/go.tgz
COPY backend/ /src/backend/
COPY frontend/ /src/frontend/
WORKDIR /src/backend
RUN CGO_ENABLED=0 go build -o /out/server .

FROM alpine:3.21
WORKDIR /app
COPY --from=builder /out/server ./server
COPY --from=builder /src/frontend ./frontend
EXPOSE 18080
CMD ["./server"]
