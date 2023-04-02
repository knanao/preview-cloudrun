# preview-cloudrun
A GitHub Action for deploying preview revisions per a PR to Google Cloud Run. This action deploys a new revision with zero traffic and creates a comment which shows the revision URLs to the PR.

# Prerequisites
- This action requires Google Cloud credentials that are authorized to access the secrets being requested.
- This action doesn't support building and pushing container images by itself, hence it's necessary to push the image which you want to review before using this action.
- If Cloud Run services do not exist yet, please finish a first deployment in some way.

# Usage
```yaml
name: cloudrun

on:
  pull_request:
    branches:
      - main
    types: [opened, synchronize, reopened, labeled]

env:
  TRIGGER_LABEL: cloudrun-preview
  REGISTRY: REGISTRY_NAME
  REGION: SERVICE_REGION
  DOCKERFILE_PATH: DOCKERFILE_PATH
  SERVICE: SERVICE_NAME

jobs:
  preview:
    if: ${{ contains(github.event.pull_request.labels.*.name, env.TRIGGER_LABEL) }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Google Auth
        id: auth
        uses: google-github-actions/auth@v1
        with:
          token_format: access_token
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      # If you want to use GAR or Docker Hub instead of GCR, please update this.
      # https://github.com/docker/login-action
      - name: Login to GCR
        uses: docker/login-action@49ed152c8eca782a232dede0303416e8f356c37b #v2.0.0
        with:
          registry: ${{ env.REGISTRY }}
          username: oauth2accesstoken
          password: ${{ steps.auth.outputs.access_token }}

      - name: Git Tags
        id: tag
        run: echo version=$(git describe --tags --always --dirty --abbrev=7) >> $GITHUB_OUTPUT

      - name: Build and Push Image
        uses: docker/build-push-action@v4
        with:
          push: true
          context: .
          file: ${{ env.DOCKERFILE_PATH }}
          tags: ${{ env.REGISTRY }}:${{ steps.tag.outputs.version }}

      - name: Preview Cloud Run Deployment
        uses: knanao/preview-cloudrun@v1
        with:
          service: ${{ env.SERVICE }}
          image: ${{ env.REGISTRY }}:${{ steps.tag.outputs.version }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

# Inputs

| Name                            | Description                                                                 | Required | Default Value                                        |
|---------------------------------|-----------------------------------------------------------------------------|:--------:|:----------------------------------------------------:|
| project                         | ID of the Google Cloud project in which to deploy the service.              |    no    | the value computed from the environment              |
| region                          | Region in which the service is and to deploy the service.                   |    no    | us-central1                                          |
| service                         | Name of the Cloud Run service.                                              |    yes   |                                                      |
| revision                        | Name of the Cloud Run revision.                                             |    no    | ${SERVICE_NAME}-${TAG_VERSION}                       |
| image                           | Fully-qualified name of the container image to deploy.                      |    yes   |                                                      |
| tag                             | Traffic tag to assign to the newly-created revision.                        |    no    | pr-${PULL_REQUEST_NUMBER}                            |
| gcloud_version                  | Version of the gcloud CLI to use.                                           |    no    | latest                                               |
| cleanup                         | If true, the old tags related PRs that already were closed will be removed. |    no    | true                                                 |
| token                           | Secret of GITHUB_TOKEN. This is used for creating a coments to PRs          |    yes   |                                                      |
