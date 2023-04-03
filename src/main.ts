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

import {
  Gcloud,
  GcloudOptions,
} from './gcloud';
import path from 'path';
import {
  getInput,
  addPath,
  setFailed,
  info,
  warning,
} from '@actions/core';
import * as toolCache from '@actions/tool-cache';
import { 
  readFileSync
} from 'fs';
import {
  errorMessage,
} from '@google-github-actions/actions-utils';
import {
  authenticateGcloudSDK,
  getLatestGcloudSDKVersion,
  installGcloudSDK,
  isInstalled,
} from '@google-github-actions/setup-cloud-sdk';

export async function run(): Promise<void> {
  try {
    const project = getInput('project');
    const region = getInput('region') || 'us-central1';
    const service = getInput('service');
    const image = getInput('image');
    const revision = getInput('revision') || await generateRevisionName(service, image);
    const tag = getInput('tag') || await generateTrafficTag();
    const cleanup = (getInput('cleanup') || 'true').toLowerCase() === "true";
    const token = getInput('token');
    const gcloudVersion = await computeGcloudVersion(getInput('gcloud_version'));

    if (!service) throw new Error('service name must be set.');
    if (!image) throw new Error('container image must be set.');
    if (!token) throw new Error('github token muset be set.');

    if (!isInstalled(gcloudVersion)) {
      await installGcloudSDK(gcloudVersion);
    } else {
      const toolPath = toolCache.find('gcloud', gcloudVersion);
      addPath(path.join(toolPath, 'bin'));
    }

    const credFile = process.env.GOOGLE_GHA_CREDS_PATH;
    if (credFile) {
      await authenticateGcloudSDK(credFile);
      info('Successfully authenticated');
    } else {
      warning('No authentication found, authenticate with `google-github-actions/auth`.');
    }

    const opts: GcloudOptions = {}
    if (project) opts.projectId = project;
    const gcloud = new Gcloud(opts);

    const manifest = await gcloud.getCloudRunServiceManifest(service, region);
    if (manifest) {
      info(`Successfuly get the Cloud Run service: ${service}`)
    } else {
      throw new Error(`failed to get the Cloud Run service: ${service}.`);
    }
    manifest.addPreviewTraffic(revision, tag);

    await gcloud.updateCloudRunService(manifest);
    
    // TODO: if `cleanup` variable is true, all revisions should be checked whether these have an old tag or not and removed.
  } catch(err) {
    const msg = errorMessage(err);
    setFailed(`knanao/preview-cloudrun failed with: ${msg}`);
  }
}

async function generateRevisionName(svc: string, image: string): Promise<string> {
  const version = image.slice(image.indexOf(':')+1);
  return svc + version.replace('.', '');
}

async function generateTrafficTag(): Promise<string> {
  const path = process.env.GITHUB_EVENT_PATH;
  const payload = JSON.parse(readFileSync(path).toString());
  if (!(payload?.pull_request)) {
    throw new Error("failed to parse GitHub Event payload.");
  }
  return "pr" + payload.pull_request.number
}

async function computeGcloudVersion(str: string): Promise<string> {
  str = (str || '').trim();
  if (str === '' || str === 'latest') {
    return await getLatestGcloudSDKVersion();
  }
  return str;
}

if (require.main === module) run();
