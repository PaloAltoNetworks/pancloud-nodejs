import { defaultCredentialsProviderFactory, CredentialProviderOptions } from './credentialprovider'
import { DevTokenCredentialsOptions, DevTokenCredentials } from './devtokencredentials'
import { Credentials, defaultCredentialsFactory } from './credentials';
import { commonLogger } from './common'
import { PanCloudError } from './error'

export async function autoCredentials(opt?: CredentialProviderOptions & DevTokenCredentialsOptions & { accessToken?: string }): Promise<Credentials> {
    try {
        return await defaultCredentialsProviderFactory(opt)
    }
    catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate Default Credential class with message ${(e as Error).message}`)
    }
    try {
        let devTokCredentias: Credentials = new DevTokenCredentials(opt)
        await devTokCredentias.retrieveAccessToken()
        return devTokCredentias
    } catch (e) {
        commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate DevTokenCredentials class with message ${(e as Error).message}`)
    }
    if (opt && opt.accessToken) {
        try {
            return defaultCredentialsFactory(opt.accessToken)
        } catch (e) {
            commonLogger.info({ className: 'AutoCredentials' }, `Failed to instantiate Static Credential class with message ${(e as Error).message}`)
        }
    }
    throw new PanCloudError({ className: 'AutoCredentials' }, 'PARSER', 'Unable to instantiate a Credentials class')
}