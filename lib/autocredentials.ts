// Copyright 2015-2019 Palo Alto Networks, Inc
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//       http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { defaultCredentialsProviderFactory, CredentialProviderOptions } from './credentialprovider'
import { DevTokenCredentialsOptions, DevTokenCredentials } from './devtokencredentials'
import { Credentials, defaultCredentialsFactory } from './credentials';
import { commonLogger, EntryPoint } from './common'
import { PanCloudError } from './error'
import { env } from 'process'

export async function autoCredentials(opt?: CredentialProviderOptions & DevTokenCredentialsOptions &
{ accessToken?: string, refreshToken?: string, entryPoint?: EntryPoint }): Promise<Credentials> {
    let envClientId = env['PAN_CLIENT_ID']
    let envClientSecret = env['PAN_CLIENT_SECRET']
    let envRefreshToken = (opt && opt.refreshToken) || env['PAN_REFRESH_TOKEN']
    let envAccessToken = (opt && opt.accessToken) || env['PAN_ACCESS_TOKEN']
    let envEntryPoint = env['PAN_ENTRYPOINT']

    let entryPoint: EntryPoint = 'https://api.us.paloaltonetworks.com'
    if (envEntryPoint) {
        entryPoint = envEntryPoint as EntryPoint
    } else {
        commonLogger.info({ className: 'AutoCredentials' }, 'Environmental variable PAN_ENTRYPOINT not set. Assuming https://api.us.paloaltonetworks.com')
    }

    if (!(envAccessToken || (envClientId && envClientSecret && envRefreshToken))) {
        commonLogger.info({ className: 'AutoCredentials' },
            'Neither "PAN_ACCESS_TOKEN" (for static credentials) nor "PAN_CLIENT_ID", "PAN_CLIENT_SECRET" and "PAN_REFRESH_TOKEN" for a memory-based credentials provider where provider. Will try with developer token credetials')
        let devTokCredentias: Credentials = new DevTokenCredentials({ entryPoint: entryPoint, ...opt })
        await devTokCredentias.retrieveAccessToken()
        return devTokCredentias
    }

    if (envClientId && envClientSecret && envRefreshToken) {
        commonLogger.info({ className: 'AutoCredentials' }, 'Using memory based credentials provider')
        return defaultCredentialsProviderFactory({
            clientId: envClientId,
            clientSecret: envClientSecret,
            refreshToken: envRefreshToken,
            entryPoint: entryPoint,
            ...opt
        })
    }

    if (envAccessToken) {
        commonLogger.info({ className: 'AutoCredentials' }, 'Using startic credentials. No refresh available.')
        return defaultCredentialsFactory(entryPoint, envAccessToken)
    }

    throw new PanCloudError({ className: 'AutoCredentials' }, 'CONFIG', 'Unknown error')
}