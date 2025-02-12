// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as path from 'path';
import { Uri } from 'vscode';
import { DebugConfigStrings } from '../../../../../client/common/utils/localize';
import { DebuggerTypeName } from '../../../../../client/debugger/constants';
import { buildFileLaunchDebugConfiguration } from '../../../../../client/debugger/extension/configuration/providers/fileLaunch';

suite('Debugging - Configuration Provider File', () => {
    test('Launch JSON with default managepy path', async () => {
        const folder = { uri: Uri.parse(path.join('one', 'two')), name: '1', index: 0 };
        const state = { config: {}, folder };

        await buildFileLaunchDebugConfiguration(undefined as any, state);

        const config = {
            name: DebugConfigStrings.file.snippet.name,
            type: DebuggerTypeName,
            request: 'launch',
            program: '${file}',
            console: 'integratedTerminal',
            justMyCode: true,
        };

        expect(state.config).to.be.deep.equal(config);
    });
});
