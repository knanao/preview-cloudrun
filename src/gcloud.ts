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

import fs from "fs";

import {
  ServiceManifest,
  parseServiceManifest,
} from './cloudrun';
import { getExecOutput } from '@actions/exec';

export class Gcloud {
  private toolCommand: string;
  private _projectId: string;

  constructor(toolCommand: string) {
    this.toolCommand = toolCommand;
  }

  set projectId(id: string) {
    this.projectId = id;
  }

  public async getCloudRunServiceManifest(service: string, region: string): Promise<ServiceManifest> {
    const cmd = ['run', 'services', 'describe', service];
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

  public async updateCloudRunService(manifest: ServiceManifest): Promise<void> {
    const file = 'temp/service.yaml'
    const cmd = ['run', 'services', 'replace', file];
    if (this.projectId) cmd.push('--project', this.projectId);

    fs.writeFileSync(file, manifest.object);
    try {
      const output = await getExecOutput(this.toolCommand, cmd);
      if (output.exitCode !== 0) {
        const errMsg = output.stderr || `command exited ${output.exitCode}, but stderr had no output`;
        throw new Error(`failed to execute gcloud command \`${this.toolCommand} ${cmd.join(' ')}\`: ${errMsg}`);
      }
    } finally {
      fs.unlinkSync(file);
    }
  }
}
