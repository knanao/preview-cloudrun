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

import { errorMessage, presence } from '@google-github-actions/actions-utils';
import { loadYaml } from '@kubernetes/client-node';

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

  public getRevisionName(): string {
    return this._object?.spec?.template?.metadata ? this._object?.spec?.template?.metadata.name : '';
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
      throw new Error('failed to get the .spec.traffic field');
    }

    const traffic: Array<TrafficTarget> = this._object.spec.traffic as Array<TrafficTarget>;
    const next: Array<TrafficTarget> = [];
    for (let i = 0; i < traffic.length; i++) {
      if (traffic[i].latestRevision && this.getRevisionName()) {
        next.push({
          percent: 100,
          revisionName: this.getRevisionName(),
        });
        continue;
      }

      if (traffic[i].percent || (traffic[i].tag && traffic[i].tag !== tag)) {
        next.push({
          percent: traffic[i].percent,
          tag: traffic[i].tag,
          revisionName: traffic[i].revisionName,
        });
      }
    }

    next.push({
      'revisionName': revision,
      'tag': tag,
    });

    this._object.spec.traffic = next;
  }

  public removeTag(tag: string): void {
    if (!this._object?.spec?.traffic) {
      throw new Error('failed to get the .spec.traffic field');
    }

    const traffic: Array<TrafficTarget> = this._object.spec.traffic as Array<TrafficTarget>;
    const next: Array<TrafficTarget> = [];
    for (let i = 0; i < traffic.length; i++) {
      if (traffic[i].tag === tag) continue;
      next.push(traffic[i]);
    }

    this._object.spec.traffic = next;
  }

  public updateRevisionName(revision: string): void {
    if (!this.getRevisionName()) {
      throw new Error('failed to get the revision name');
    }

    this._object.spec.template.metadata.name = revision;
  }

  public updateImage(image: string): void {
    if (!this.getImage()) {
      throw new Error('failed to get the image');
    }

    this._object.spec.template.spec.containers[0].image = image;
  }
}

export interface TrafficTarget {
  revisionName: string;
  percent?: number;
  tag?: string;
  url?: string;
  latestRevision?: string;
}

export function parseServiceManifest(data: string): ServiceManifest {
  try {
    data = presence(data);
    if (!data || data === '{}' || data === '[]') {
      throw new Error("the data must be set");
    }
    return new ServiceManifest(data);
  } catch(err) {
    const msg = errorMessage(err);
    throw new Error(`failed to parse service manifest: ${msg}, stdout: ${data}`);
  }
}
