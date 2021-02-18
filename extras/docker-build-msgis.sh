#!/bin/bash

docker build \
 -t pep-proxy-image \
 --build-arg GITHUB_ACCOUNT=msgis \
 ./docker \
 && docker tag pep-proxy-image docker.msgis.net/odp/fiware-pep-proxy:build-latest \
 && docker push docker.msgis.net/odp/fiware-pep-proxy:build-latest