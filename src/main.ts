/* 
* Copyright 2023 knanao.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { readFileSync } from 'fs';
import path from 'path';

import {
  getInput,
  addPath,
  setFailed,
  info,
  warning,
} from '@actions/core';
import {
  getOctokit,
  context,
} from '@actions/github';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema'
import { graphql } from '@octokit/graphql';
import { ReportedContentClassifiers } from "@octokit/graphql-schema";
import * as toolCache from '@actions/tool-cache';
import {
  errorMessage,
} from '@google-github-actions/actions-utils';
import {
  authenticateGcloudSDK,
  getLatestGcloudSDKVersion,
  installGcloudSDK,
  isInstalled,
} from '@google-github-actions/setup-cloud-sdk';

import {
  Gcloud,
  GcloudOptions,
} from './gcloud';

export async function run(): Promise<void> {
  try {
    const project = getInput('project');
    const region = getInput('region') || 'us-central1';
    const service = getInput('service');
    const image = getInput('image');
    const revision = getInput('revision') || generateRevisionName(service, image);
    const tag = getInput('tag') || generateTrafficTag();
    const gcloudVersion = await computeGcloudVersion(getInput('gcloud_version'));
    const token = getInput('token');
    
    if (!service) throw new Error('service name must be set');
    if (!image) throw new Error('container image must be set');
    if (!token) throw new Error('github token muset be set');

    if (context.eventName !== 'pull_request') {
      throw new Error(`event ${context.eventName} is not supported`);
    }
     
    if (!isInstalled(gcloudVersion)) {
      await installGcloudSDK(gcloudVersion);
    } else {
      const toolPath = toolCache.find('gcloud', gcloudVersion);
      addPath(path.join(toolPath, 'bin'));
    }

    const credFile = process.env.GOOGLE_GHA_CREDS_PATH;
    if (credFile) {
      await authenticateGcloudSDK(credFile);
      info('Successfully authenticated.');
    } else {
      warning('No authentication found, authenticate with `google-github-actions/auth`.');
    }

    const opts: GcloudOptions = {}
    if (project) opts.projectId = project;
    const gcloud = new Gcloud(opts);

    const manifest = await gcloud.getCloudRunServiceManifest(service, region);
    if (manifest) {
      info(`Successfuly get the Cloud Run service: ${service}.`)
    } else {
      throw new Error(`failed to get the Cloud Run service: ${service}`);
    }

    if (context.payload.action === 'closed') {
      manifest.removeTag(tag);

      const updatedManifest = await gcloud.updateCloudRunService(manifest);
      if (updatedManifest) {
        info(`Successfuly cleanup the ${tag} from ${service}.`)
      } else {
        throw new Error(`failed to cleanup the the ${tag} from ${service}`);
      }
      return;
    }

    manifest.updateImage(image);
    manifest.updatePreviewTraffic(revision, tag);
    manifest.updateRevisionName(revision);

    const updatedManifest = await gcloud.updateCloudRunService(manifest);
    if (updatedManifest) {
      info(`Successfuly update the Cloud Run service: ${service}.`);
    } else {
      throw new Error(`failed to update the Cloud Run service: ${service}`);
    }

    const traffics = updatedManifest.getTraffic();
    if (!traffics) throw new Error('failed to get the .status.traffic field');
    let url = '';
    for (const u of traffics) {
      if (u.revisionName === revision && u.url) {
        url = u.url;
        break;
      }
    }
    if (!url) throw new Error(`failed to get the preview url from ${service} manifest`);

    const event = context.payload as PullRequestEvent;
    let projectId = project;
    if (!projectId) projectId = await gcloud.getProjectID();
    const body = generateCommentBody({
      project: projectId,
      service: service,
      region: region,
      commitHash: event.pull_request.head.sha.substring(0, 7),
      url: url,
    });


    const octokit = getOctokit(token);
    const client = graphql.defaults({
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const comments = await octokit.rest.issues.listComments({
      owner: event.repository.owner.login,
      repo: event.repository.name,
      issue_number: event.number,
    });
    for (const comment of comments.data) {
      if (!comment.body.startsWith('<!-- preview-cloudrun -->')) continue;

      const classifier: ReportedContentClassifiers = "OUTDATED";
      const query = `
        mutation {
          minimizeComment(input: {subjectId: "${comment.node_id}", classifier: ${classifier}}) {
            minimizedComment {
              isMinimized
            }
          }
        }
      `; 
      await client(query);
    }

    await octokit.rest.issues.createComment({
      owner: event.repository.owner.login,
      repo: event.repository.name,
      issue_number: event.number,
      body: body,
    });

    // TODO: if `cleanup` variable is true, all revisions should be checked whether these have an old tag or not and removed.
  } catch(err) {
    const msg = errorMessage(err);
    setFailed(`knanao/preview-cloudrun failed with: ${msg}`);
  }
}

function generateRevisionName(svc: string, image: string): string {
  const event = context.payload as PullRequestEvent;
  let version = '';
  if (image.includes(':')) version = image.slice(image.indexOf(':') + 1).split('.').join('');
  return svc + '-' + version + '-' + event.pull_request.head.sha.substring(0, 7);
}

function generateTrafficTag(): string {
  const path = process.env.GITHUB_EVENT_PATH;
  const payload = JSON.parse(readFileSync(path).toString());
  if (!(payload?.pull_request)) {
    throw new Error('failed to parse GitHub Event payload');
  }
  return 'pr-' + payload.pull_request.number
}

function generateCommentBody(
  args: {
    project: string,
    service: string,
    region: string,
    commitHash: string,
    url: string,
  }
): string {
  let str = '';

  const cloudrunUrl = `https://console.cloud.google.com/run/detail/${args.region}/${args.service}/revisions?project=${args.project}`;
  const successBadge = `<!-- preview-cloudrun -->\n[![CLOUDRUN](https://img.shields.io/static/v1?label=CloudRun&message=Revisions&color=success&style=flat)](${cloudrunUrl}) `;

  const actionUrl = getActionsLogUrl();
  const actionBadge = `[![ACTIONS](https://img.shields.io/static/v1?label=CloudRun&message=Actions_Log&style=flat)](${actionUrl})`;
  str = str.concat(successBadge, actionBadge, '\n\n');

  const title = `Ran preview-cloudrun against head commit ${args.commitHash} of this pull request. preview-cloudrun generated a new temporary Cloud Run revision with 0% traffic.`;
  str = str.concat(title, '\n\n');

  const body = `## service: ${args.service}, region: ${args.region}\nRevision URL: ${args.url}\n\nIf this service requires authentication, please refer to this.
\`\`\`
curl -s GET \\
  ${args.url} \\
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
\`\`\`
`;
  str = str.concat(body);

  return str;
}

function getActionsLogUrl(): string {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  if (!serverUrl) return '';

  const repoUrl = process.env.GITHUB_REPOSITORY;
  if (!repoUrl) return '';

  const runId = process.env.GITHUB_RUN_ID;
  if (!runId) return '';

  return `${serverUrl}/${repoUrl}/actions/runs/${runId}`;
}

async function computeGcloudVersion(str: string): Promise<string> {
  str = (str || '').trim();
  if (str === '' || str === 'latest') {
    return await getLatestGcloudSDKVersion();
  }
  return str;
}

run();
