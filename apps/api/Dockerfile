FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/server ./cmd/server && \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/server /server
COPY --from=build /out/seed /seed
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
