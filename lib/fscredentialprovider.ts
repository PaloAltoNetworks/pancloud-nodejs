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

import { commonLogger } from './common'
import { PanCloudError } from './error'
import { Credentials } from './credentials'
import { env } from 'process'
import { CortexCredentialProvider, CredentialProviderOptions, CredentialsItem, isCredentialItem } from './credentialprovider'
import { createCipheriv, createDecipheriv, createHash } from 'crypto'
import { promises as fspromises, constants as fsconstants } from 'fs'

interface ConfigFile {
    credentialItems: { [dlid: string]: CredentialsItem },
    refreshTokens: { [dlid: string]: string }
}

function isConfigFile(obj: any): obj is ConfigFile {
    return typeof obj == 'object' &&
        obj.credentialItems && typeof obj.credentialItems == 'object' &&
        Object.entries(obj.credentialItems).every(v => typeof v[0] == 'string' && isCredentialItem(v[1])) &&
        obj.refreshTokens && typeof obj.refreshTokens == 'object' &&
        Object.entries(obj.refreshTokens).every(v => typeof v[0] == 'string' && typeof v[1] == 'string')
}

class FsCredProvider extends CortexCredentialProvider {
    key: string
    iv: string
    configFileName: string

    constructor(ops: CredentialProviderOptions &
    { clientId: string, clientSecret: string } &
    { key: string, iv: string, configFileName: string }) {
        super(ops)
        this.key = ops.key
        this.iv = ops.iv
        this.configFileName = this.configFileName
    }

    private async fullSync(): Promise<void> {
        let configFile: ConfigFile = {
            credentialItems: this.credentials,
            refreshTokens: {}
        }
        Object.entries(this.credentialsRefreshToken).forEach(v => {
            let aes = createCipheriv('aes-128-ccm', this.key, this.iv)
            aes.update(v[1])
            configFile.refreshTokens[v[0]] = aes.final('base64')
        })
        try {
            await fspromises.writeFile(this.configFileName, JSON.stringify(configFile))
        } catch (e) {
            throw PanCloudError.fromError(this, e)
        }
    }

    protected createCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void> {
        return this.fullSync()
    }

    protected updateCortexRefreshToken(datalakeId: string, refreshToken: string): Promise<void> {
        return this.fullSync()
    }

    protected deleteCortexRefreshToken(datalakeId: string): Promise<void> {
        return this.fullSync()
    }

    protected async retrieveCortexRefreshToken(datalakeId: string): Promise<string> {
        let configFile = await this.loadConfigFile()
        let cryptedRefreshToken = configFile.refreshTokens[datalakeId]
        if (!cryptedRefreshToken) {
            throw new PanCloudError(this, 'CONFIG', `Refresh token for datalake ${datalakeId} not found in configuration file ${this.configFileName}`)
        }
        let decr = createDecipheriv('aes-128-ccm', this.key, this.iv)
        decr.update(Buffer.from(cryptedRefreshToken, 'base64'))
        return decr.final('utf8')
    }

    protected createCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void> {
        return this.fullSync()
    }

    protected updateCredentialsItem(datalakeId: string, credentialsItem: CredentialsItem): Promise<void> {
        return this.fullSync()
    }

    protected deleteCredentialsItem(datalakeId: string): Promise<void> {
        return this.fullSync()
    }

    private async loadConfigFile(): Promise<ConfigFile> {
        let jsonConfig: any
        try {
            let configFile = await fspromises.readFile(this.configFileName)
            jsonConfig = JSON.parse(configFile.toString('utf8'))
        } catch (e) {
            throw PanCloudError.fromError(this, e)
        }
        if (!isConfigFile(jsonConfig)) {
            throw new PanCloudError(this, 'PARSER', `Invalid configuration file format in ${this.configFileName}`)
        }
        return jsonConfig
    }

    protected async loadCredentialsDb(): Promise<{ [dlid: string]: CredentialsItem }> {
        let configFile = await this.loadConfigFile()
        return configFile.credentialItems
    }

    protected credentialsObjectFactory(datalakeId: string, accTokenGuardTime: number,
        prefetch?: { accessToken: string, validUntil: number }): Promise<Credentials> {
        return this.defaultCredentialsObjectFactory(datalakeId, accTokenGuardTime, prefetch)
    }
}

const ENV_PREFIX = 'PAN'
const CONFIG_FILE = 'pancloud_config.js'

export async function fsCredProvider(ops: CredentialProviderOptions &
{ envPrefix?: string, clientId?: string, clientSecret?: string, secret: string }): Promise<FsCredProvider> {
    let { key, iv } = passIvGenerator(ops.secret)
    let ePrefix = (ops && ops.envPrefix) ? ops.envPrefix : ENV_PREFIX
    let envClientId = `${ePrefix}_MASTER_CLIENTID`
    let envClientSecret = `${ePrefix}_MASTER_CLIENTSECRET`
    let cId = (ops && ops.clientId) ? ops.clientId : env[envClientId]
    if (!cId) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envClientId} not found or empty value`)
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_id' from environment variable ${envClientId}`)
    let cSec = (ops && ops.clientSecret) ? ops.clientSecret : env[envClientSecret]
    if (!cSec) {
        throw new PanCloudError({ className: 'DefaultCredentialsProvider' }, 'CONFIG',
            `Environment variable ${envClientSecret} not found or empty value`)
    }
    commonLogger.info({ className: "defaultCredentialsFactory" }, `Got 'client_secret' from environment variable ${envClientSecret}`)
    let configFileName = `${ePrefix}_${CONFIG_FILE}`
    try {
        await fspromises.stat(configFileName)
    } catch (e) {
        commonLogger.info({ className: 'fsCredProvider' }, `${configFileName} does not exist. Creating it`)
        let blankConfig: ConfigFile = {
            credentialItems: {},
            refreshTokens: {}
        }
        await fspromises.writeFile(configFileName, JSON.stringify(blankConfig))
    }
    try {
        await fspromises.access(configFileName, fsconstants.W_OK | fsconstants.R_OK)
    } catch (e) {
        throw new PanCloudError({ className: 'fsCredProvider' }, 'CONFIG', `Invalid permissions in configuration file ${configFileName}`)
    }
    return new FsCredProvider({
        clientId: cId,
        clientSecret: cSec,
        key: key,
        iv: iv,
        configFileName: configFileName,
        ...ops
    })
}

function passIvGenerator(secret: string): { key: string, iv: string } {
    let code = createHash('sha1').update(secret).digest()
    return {
        key: code.toString('utf8', 0, 16),
        iv: code.toString('utf8', 16, 32)
    }
}
