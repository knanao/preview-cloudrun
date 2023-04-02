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

import { loadYaml } from '@kubernetes/client-node';

export class ServiceManifest {
  private _object: any;
  
  constructor(data: string) {
    this._object = loadYaml(data);
  }

  get object() {
    return this._object;
  }

  public addPreviewTraffic(revision: string, tag: string): void {
    if (!this._object.spec.traffic) {
      throw new Error("failed to ref the .spec.traffic field");
    }

    const preview = {
      "revisionName": revision,
      "tag": tag,
    };
    this._object.spec.traffic.push(preview);
  }
}

export function parseServiceManifest(data: string): ServiceManifest {
  return new ServiceManifest(data);
}
