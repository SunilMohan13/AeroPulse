# ADR-0001: Pack logical services into few Compose containers

## Status

Accepted

## Context

LLD §6 lists many logical services. Running each as a container locally is operationally expensive for a laptop/MVP.

## Decision

Keep Python package boundaries (`libs/`, `apps/`, `connectors/`) and deploy as `api`, `worker`, `connector`, plus data stores.

## Consequences

Horizontal scale is Kafka consumer groups and `docker compose --scale`. Kubernetes is deferred.
