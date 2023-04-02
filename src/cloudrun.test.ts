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

import { expect } from 'chai';

import {
  parseServiceManifest,
} from './cloudrun';

describe('cloudrun', () => {
  it('should load safely', () => {
    const data = `
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  annotations:
    run.googleapis.com/client-name: cloud-console
    run.googleapis.com/ingress: all
    run.googleapis.com/ingress-status: all
  creationTimestamp: '2022-02-28T08:36:32.176035Z'
  generation: 153
  labels:
    cloud.googleapis.com/location: asia-northeast1
  name: helloworld
  namespace: 'xxxxxxxxxx'
  resourceVersion: AAX4CQw8EkQ
  selfLink: /apis/serving.knative.dev/v1/namespaces/xxxxxxxxxx/services/helloworld
  uid: d2023724-21df-8544ff6b7b47
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: '1'
      labels:
      name: helloworld-v001-aa3e4b2
    spec:
      containerConcurrency: 80
      containers:
      - args:
        - server
        image: gcr.io/cloudrun/hello:latest
        ports:
        - containerPort: 9085
          name: http1
        resources:
          limits:
            cpu: 1000m
            memory: 128Mi
      serviceAccountName: xxxxxxxxxx-compute@developer.gserviceaccount.com
      timeoutSeconds: 300
  traffic:
  - percent: 100
    revisionName: helloworld-v001-aa3e4b2
`;
    const res = parseServiceManifest(data); 

    expect(res.object.apiVersion).to.equal('serving.knative.dev/v1');
    expect(res.object.metadata.name).to.equal('helloworld');
    expect(res.object.spec.template.metadata.name).to.equal('helloworld-v001-aa3e4b2');
    expect(res.object.spec.template.spec.containers[0].image).to.equal('gcr.io/cloudrun/hello:latest');

  });
  it('should add preview safely', () => {
    const data = `
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  annotations:
    run.googleapis.com/client-name: cloud-console
    run.googleapis.com/ingress: all
    run.googleapis.com/ingress-status: all
  creationTimestamp: '2022-02-28T08:36:32.176035Z'
  generation: 153
  labels:
    cloud.googleapis.com/location: asia-northeast1
  name: helloworld
  namespace: 'xxxxxxxxxx'
  resourceVersion: AAX4CQw8EkQ
  selfLink: /apis/serving.knative.dev/v1/namespaces/xxxxxxxxxx/services/helloworld
  uid: d2023724-21df-8544ff6b7b47
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: '1'
      labels:
      name: helloworld-v001-aa3e4b2
    spec:
      containerConcurrency: 80
      containers:
      - args:
        - server
        image: gcr.io/cloudrun/hello:latest
        ports:
        - containerPort: 9085
          name: http1
        resources:
          limits:
            cpu: 1000m
            memory: 128Mi
      serviceAccountName: xxxxxxxxxx-compute@developer.gserviceaccount.com
      timeoutSeconds: 300
  traffic:
  - percent: 100
    revisionName: helloworld-v001-aa3e4b2
`;
    const svm = parseServiceManifest(data); 
    svm.addPreviewTraffic('helloworld-v001-bbhf45q', 'pr-1');

    const expected = [
      { 
        'percent': 100,
	'revisionName': 'helloworld-v001-aa3e4b2',
      },
      {
	'revisionName': 'helloworld-v001-bbhf45q',
	'tag': 'pr-1',
      },
    ];
    expect(svm.object.spec.traffic).to.deep.equal(expected);
  });
});
