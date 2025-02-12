// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as typemoq from 'typemoq';
import { assert, expect } from 'chai';
import { ConfigurationTarget, Uri, Event } from 'vscode';
import { EnvironmentDetails, IProposedExtensionAPI } from '../client/apiTypes';
import { IInterpreterPathService } from '../client/common/types';
import { IInterpreterService } from '../client/interpreter/contracts';
import { IServiceContainer } from '../client/ioc/types';
import { buildProposedApi } from '../client/proposedApi';
import {
    IDiscoveryAPI,
    ProgressNotificationEvent,
    ProgressReportStage,
} from '../client/pythonEnvironments/base/locator';
import { PythonEnvironment } from '../client/pythonEnvironments/info';
import { PythonEnvKind, PythonEnvSource } from '../client/pythonEnvironments/base/info';
import { Architecture } from '../client/common/utils/platform';
import { buildEnvInfo } from '../client/pythonEnvironments/base/info/env';

suite('Proposed Extension API', () => {
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let discoverAPI: typemoq.IMock<IDiscoveryAPI>;
    let interpreterPathService: typemoq.IMock<IInterpreterPathService>;
    let interpreterService: typemoq.IMock<IInterpreterService>;
    let onDidExecutionEvent: Event<Uri | undefined>;
    let onRefreshProgress: Event<ProgressNotificationEvent>;

    let proposed: IProposedExtensionAPI;

    setup(() => {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>(undefined, typemoq.MockBehavior.Strict);
        discoverAPI = typemoq.Mock.ofType<IDiscoveryAPI>(undefined, typemoq.MockBehavior.Strict);
        interpreterPathService = typemoq.Mock.ofType<IInterpreterPathService>(undefined, typemoq.MockBehavior.Strict);
        interpreterService = typemoq.Mock.ofType<IInterpreterService>(undefined, typemoq.MockBehavior.Strict);
        onDidExecutionEvent = typemoq.Mock.ofType<Event<Uri | undefined>>().object;
        onRefreshProgress = typemoq.Mock.ofType<Event<ProgressNotificationEvent>>().object;
        interpreterService.setup((i) => i.onDidChangeInterpreterConfiguration).returns(() => onDidExecutionEvent);

        serviceContainer.setup((s) => s.get(IInterpreterPathService)).returns(() => interpreterPathService.object);
        serviceContainer.setup((s) => s.get(IInterpreterService)).returns(() => interpreterService.object);

        discoverAPI.setup((d) => d.onProgress).returns(() => onRefreshProgress);

        proposed = buildProposedApi(discoverAPI.object, serviceContainer.object);
    });

    test('Provide a callback for tracking refresh progress', async () => {
        assert.deepEqual(proposed.environment.onRefreshProgress, onRefreshProgress);
    });

    test('Provide a callback which is called when execution details changes', async () => {
        assert.deepEqual(onDidExecutionEvent, proposed.environment.onDidChangeExecutionDetails);
    });

    test('getExecutionDetails: No resource', async () => {
        const pythonPath = 'this/is/a/test/path';
        interpreterService
            .setup((c) => c.getActiveInterpreter(undefined))
            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
        const actual = await proposed.environment.getExecutionDetails();
        assert.deepEqual(actual, { execCommand: [pythonPath] });
    });

    test('getExecutionDetails: With resource', async () => {
        const resource = Uri.file(__filename);
        const pythonPath = 'this/is/a/test/path';
        interpreterService
            .setup((c) => c.getActiveInterpreter(resource))
            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
        const actual = await proposed.environment.getExecutionDetails(resource);
        assert.deepEqual(actual, { execCommand: [pythonPath] });
    });

    test('getActiveInterpreterPath: No resource', async () => {
        const pythonPath = 'this/is/a/test/path';
        interpreterService
            .setup((c) => c.getActiveInterpreter(undefined))
            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
        const actual = await proposed.environment.getActiveEnvironmentPath();
        assert.deepEqual(actual, { path: pythonPath, pathType: 'interpreterPath' });
    });
    test('getActiveInterpreterPath: With resource', async () => {
        const resource = Uri.file(__filename);
        const pythonPath = 'this/is/a/test/path';
        interpreterService
            .setup((c) => c.getActiveInterpreter(resource))
            .returns(() => Promise.resolve(({ path: pythonPath } as unknown) as PythonEnvironment));
        const actual = await proposed.environment.getActiveEnvironmentPath(resource);
        assert.deepEqual(actual, { path: pythonPath, pathType: 'interpreterPath' });
    });

    test('getInterpreterDetails: no discovered python', async () => {
        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        discoverAPI.setup((p) => p.resolveEnv(typemoq.It.isAny())).returns(() => Promise.resolve(undefined));

        const pythonPath = 'this/is/a/test/path (without cache)';
        const actual = await proposed.environment.getEnvironmentDetails(pythonPath);
        expect(actual).to.be.equal(undefined);
    });

    test('getInterpreterDetails: no discovered python (with cache)', async () => {
        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        discoverAPI.setup((p) => p.resolveEnv(typemoq.It.isAny())).returns(() => Promise.resolve(undefined));

        const pythonPath = 'this/is/a/test/path';
        const actual = await proposed.environment.getEnvironmentDetails(pythonPath, { useCache: true });
        expect(actual).to.be.equal(undefined);
    });

    test('getInterpreterDetails: without cache', async () => {
        const pythonPath = 'this/is/a/test/path';

        const expected: EnvironmentDetails = {
            interpreterPath: pythonPath,
            version: ['3', '9', '0'],
            environmentType: [PythonEnvKind.System],
            metadata: {
                sysPrefix: 'prefix/path',
                bitness: Architecture.x64,
                project: Uri.file('path/to/project'),
            },
            envFolderPath: undefined,
        };

        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        discoverAPI
            .setup((p) => p.resolveEnv(pythonPath))
            .returns(() =>
                Promise.resolve(
                    buildEnvInfo({
                        executable: pythonPath,
                        version: {
                            major: 3,
                            minor: 9,
                            micro: 0,
                        },
                        kind: PythonEnvKind.System,
                        arch: Architecture.x64,
                        sysPrefix: 'prefix/path',
                        searchLocation: Uri.file('path/to/project'),
                    }),
                ),
            );

        const actual = await proposed.environment.getEnvironmentDetails(pythonPath, { useCache: false });
        expect(actual).to.be.deep.equal(expected);
    });

    test('getInterpreterDetails: from cache', async () => {
        const pythonPath = 'this/is/a/test/path';

        const expected: EnvironmentDetails = {
            interpreterPath: pythonPath,
            version: ['3', '9', '0'],
            environmentType: [PythonEnvKind.System],
            metadata: {
                sysPrefix: 'prefix/path',
                bitness: Architecture.x64,
                project: undefined,
            },
            envFolderPath: undefined,
        };

        discoverAPI
            .setup((d) => d.getEnvs())
            .returns(() => [
                {
                    executable: {
                        filename: pythonPath,
                        ctime: 1,
                        mtime: 2,
                        sysPrefix: 'prefix/path',
                    },
                    version: {
                        major: 3,
                        minor: 9,
                        micro: 0,
                    },
                    kind: PythonEnvKind.System,
                    arch: Architecture.x64,
                    name: '',
                    location: '',
                    source: [PythonEnvSource.PathEnvVar],
                    distro: {
                        org: '',
                    },
                },
            ]);
        discoverAPI
            .setup((p) => p.resolveEnv(pythonPath))
            .returns(() =>
                Promise.resolve(
                    buildEnvInfo({
                        executable: pythonPath,
                        version: {
                            major: 3,
                            minor: 9,
                            micro: 0,
                        },
                        kind: PythonEnvKind.System,
                        arch: Architecture.x64,
                        sysPrefix: 'prefix/path',
                    }),
                ),
            );

        const actual = await proposed.environment.getEnvironmentDetails(pythonPath, { useCache: true });
        expect(actual).to.be.deep.equal(expected);
    });

    test('getInterpreterDetails: cache miss', async () => {
        const pythonPath = 'this/is/a/test/path';

        const expected: EnvironmentDetails = {
            interpreterPath: pythonPath,
            version: ['3', '9', '0'],
            environmentType: [PythonEnvKind.System],
            metadata: {
                sysPrefix: 'prefix/path',
                bitness: Architecture.x64,
                project: undefined,
            },
            envFolderPath: undefined,
        };

        // Force this API to return empty to cause a cache miss.
        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        discoverAPI
            .setup((p) => p.resolveEnv(pythonPath))
            .returns(() =>
                Promise.resolve(
                    buildEnvInfo({
                        executable: pythonPath,
                        version: {
                            major: 3,
                            minor: 9,
                            micro: 0,
                        },
                        kind: PythonEnvKind.System,
                        arch: Architecture.x64,
                        sysPrefix: 'prefix/path',
                    }),
                ),
            );

        const actual = await proposed.environment.getEnvironmentDetails(pythonPath, { useCache: true });
        expect(actual).to.be.deep.equal(expected);
    });

    test('getInterpreterPaths: no pythons found', async () => {
        discoverAPI.setup((d) => d.getEnvs()).returns(() => []);
        const actual = await proposed.environment.getEnvironmentPaths();
        expect(actual).to.be.deep.equal([]);
    });

    test('getInterpreterPaths: python found', async () => {
        discoverAPI
            .setup((d) => d.getEnvs())
            .returns(() => [
                {
                    executable: {
                        filename: 'this/is/a/test/python/path1',
                        ctime: 1,
                        mtime: 2,
                        sysPrefix: 'prefix/path',
                    },
                    version: {
                        major: 3,
                        minor: 9,
                        micro: 0,
                    },
                    kind: PythonEnvKind.System,
                    arch: Architecture.x64,
                    name: '',
                    location: '',
                    source: [PythonEnvSource.PathEnvVar],
                    distro: {
                        org: '',
                    },
                },
                {
                    executable: {
                        filename: 'this/is/a/test/python/path2',
                        ctime: 1,
                        mtime: 2,
                        sysPrefix: 'prefix/path',
                    },
                    version: {
                        major: 3,
                        minor: 10,
                        micro: 0,
                    },
                    kind: PythonEnvKind.Venv,
                    arch: Architecture.x64,
                    name: '',
                    location: '',
                    source: [PythonEnvSource.PathEnvVar],
                    distro: {
                        org: '',
                    },
                },
            ]);
        const actual = await proposed.environment.getEnvironmentPaths();
        expect(actual?.map((a) => a.path)).to.be.deep.equal([
            'this/is/a/test/python/path1',
            'this/is/a/test/python/path2',
        ]);
    });

    test('setActiveInterpreter: no resource', async () => {
        interpreterPathService
            .setup((i) => i.update(undefined, ConfigurationTarget.WorkspaceFolder, 'this/is/a/test/python/path'))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await proposed.environment.setActiveEnvironment('this/is/a/test/python/path');

        interpreterPathService.verifyAll();
    });
    test('setActiveInterpreter: with resource', async () => {
        const resource = Uri.parse('a');
        interpreterPathService
            .setup((i) => i.update(resource, ConfigurationTarget.WorkspaceFolder, 'this/is/a/test/python/path'))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await proposed.environment.setActiveEnvironment('this/is/a/test/python/path', resource);

        interpreterPathService.verifyAll();
    });

    test('refreshInterpreters: common scenario', async () => {
        discoverAPI
            .setup((d) => d.triggerRefresh(undefined, undefined))
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());
        discoverAPI
            .setup((d) => d.getEnvs())
            .returns(() => [
                {
                    executable: {
                        filename: 'this/is/a/test/python/path1',
                        ctime: 1,
                        mtime: 2,
                        sysPrefix: 'prefix/path',
                    },
                    version: {
                        major: 3,
                        minor: 9,
                        micro: 0,
                    },
                    kind: PythonEnvKind.System,
                    arch: Architecture.x64,
                    name: '',
                    location: 'this/is/a/test/python/path1/folder',
                    source: [PythonEnvSource.PathEnvVar],
                    distro: {
                        org: '',
                    },
                },
                {
                    executable: {
                        filename: 'this/is/a/test/python/path2',
                        ctime: 1,
                        mtime: 2,
                        sysPrefix: 'prefix/path',
                    },
                    version: {
                        major: 3,
                        minor: 10,
                        micro: 0,
                    },
                    kind: PythonEnvKind.Venv,
                    arch: Architecture.x64,
                    name: '',
                    location: '',
                    source: [PythonEnvSource.PathEnvVar],
                    distro: {
                        org: '',
                    },
                },
            ]);

        const actual = await proposed.environment.refreshEnvironment();
        expect(actual).to.be.deep.equal([
            { path: 'this/is/a/test/python/path1/folder', pathType: 'envFolderPath' },
            { path: 'this/is/a/test/python/path2', pathType: 'interpreterPath' },
        ]);
        discoverAPI.verifyAll();
    });

    test('getRefreshPromise: common scenario', () => {
        const expected = Promise.resolve();
        discoverAPI
            .setup((d) => d.getRefreshPromise(typemoq.It.isValue({ stage: ProgressReportStage.allPathsDiscovered })))
            .returns(() => expected);
        const actual = proposed.environment.getRefreshPromise({ stage: ProgressReportStage.allPathsDiscovered });

        // We are comparing instances here, they should be the same instance.
        // So '==' is ok here.
        // eslint-disable-next-line eqeqeq
        expect(actual == expected).is.equal(true);
    });
});
