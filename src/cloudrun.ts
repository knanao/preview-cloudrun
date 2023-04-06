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
import { errorMessage, presence } from '@google-github-actions/actions-utils';

export class ServiceManifest {
  private _object: any;
  
  constructor(data: string) {
    this._object = loadYaml(data);
  }

  get object(): any {
    return this._object;
  }

  public getAPIVersion(): string {
    return this._object ? this._object.apiVersion : '';
  }

  public getServiceName(): string {
    return this._object?.metadata ? this._object.metadata.name : '';
  }

  public getImage(): string {
    return this._object?.spec?.template?.spec?.containers ? this._object.spec.template.spec.containers[0].image : '';
  }

  public getTraffic(): Array<TrafficTarget> {
    const res: Array<TrafficTarget> = [];
    if (!this._object?.status?.traffic) return res;

    for (const t of this._object.status.traffic) {
       const v: TrafficTarget = { revisionName: t.revisionName.toString() };
       if (t.tag) v.tag = t.tag.toString();
       if (t.percent) v.percent = +t.percent.toString();
       if (t.url) v.url = t.url.toString();

       res.push(v);
    }
    return res
  }

  public updatePreviewTraffic(revision: string, tag: string): void {
    if (!this._object?.spec?.traffic) {
      throw new Error("failed to get the .spec.traffic field.");
    }

    const traffic: Array<TrafficTarget> = this._object.spec.traffic as Array<TrafficTarget>;
    for (let i = 0; i < traffic.length; i++) {
      if (traffic[i].tag == tag) delete traffic[i].tag;
    }

    traffic.push({
      "revisionName": revision,
      "tag": tag,
    });

    this._object.spec.traffic = traffic;
  }
}

export interface TrafficTarget {
  revisionName: string;
  percent?: number;
  tag?: string;
  url?: string;
}

export function parseServiceManifest(data: string): ServiceManifest {
  try {
    data = presence(data);
    if (!data || data === '{}' || data === '[]') {
      throw new Error("the data must be set.");
    }
    return new ServiceManifest(data);
  } catch(err) {
    const msg = errorMessage(err);
    throw new Error(`failed to parse service manifest: ${msg}, stdout: ${data}`);
  }
}
