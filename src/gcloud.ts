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
  mkdtempSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
  unlinkSync
} from 'fs';
import { dump } from 'js-yaml';

import {
  info,
} from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { getToolCommand } from '@google-github-actions/setup-cloud-sdk';

import {
  ServiceManifest,
  parseServiceManifest,
} from './cloudrun';

export interface GcloudOptions {
  projectId?: string;
}

export class Gcloud {
  private toolCommand: string;
  private projectId: string;

  constructor(options: GcloudOptions = {}) {
    if (options.projectId) {
      this.projectId = options.projectId;
    }
    this.toolCommand = getToolCommand();
  }

  public async getCloudRunServiceManifest(service: string, region: string): Promise<ServiceManifest> {
    const cmd = ['run', 'services', 'describe', service, '--quiet'];
    cmd.push('--region', region);
    cmd.push('--format', 'yaml');
    if (this.projectId) cmd.push('--project', this.projectId);

    const output = await getExecOutput(this.toolCommand, cmd);
    if (output.exitCode !== 0) {
      const errMsg = output.stderr || `command exited ${output.exitCode}, but stderr had no output`;
      throw new Error(`failed to execute gcloud command \`${this.toolCommand} ${cmd.join(' ')}\`: ${errMsg}`);
    }

    return parseServiceManifest(output.stdout);
  }

  public async updateCloudRunService(manifest: ServiceManifest): Promise<ServiceManifest> {
    const tempDir = mkdtempSync('temp');
    const file = `${tempDir}/service.yaml`;
    const cmd = ['run', 'services', 'replace', file, '--quiet'];
    cmd.push('--format', 'yaml');
    if (this.projectId) cmd.push('--project', this.projectId);

    const data = dump(manifest.object);
    writeFileSync(file, data, {flag: 'w'});
    info(readFileSync(file, 'utf8'));
    try {
      const output = await getExecOutput(this.toolCommand, cmd);
      if (output.exitCode !== 0) {
        const errMsg = output.stderr || `command exited ${output.exitCode}, but stderr had no output`;
        throw new Error(`failed to execute gcloud command \`${this.toolCommand} ${cmd.join(' ')}\`: ${errMsg}`);
      }

      // Trim unnecessary output from the stdout.
      // FIXME: this should not depend on the output format.
      let stdout = output.stdout;
      stdout = stdout.slice(stdout.indexOf('apiVersion'));
      return parseServiceManifest(stdout);
    } finally {
      unlinkSync(file);
      rmdirSync(tempDir);
    }
  }
}
